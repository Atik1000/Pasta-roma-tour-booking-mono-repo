import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationMeta } from '@pasta/types';
import { buildPaginationMeta, normalizePagination } from '@pasta/utils';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type {
  AdminBlogDto,
  AdminBookingDetailDto,
  AdminBookingDto,
  AdminPaymentDto,
  AdminTourDto,
  DashboardStatsDto,
  ListAdminBlogsQueryDto,
  ListAdminBookingsQueryDto,
  ListAdminToursQueryDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // --- dashboard -------------------------------------------------------------

  async dashboardStats(): Promise<DashboardStatsDto> {
    const [totalBookings, revenue, totalCustomers, activeTours, pendingPayments] =
      await Promise.all([
        this.prisma.booking.count({ where: { deletedAt: null } }),
        this.prisma.booking.aggregate({
          where: { paymentStatus: 'PAID', deletedAt: null },
          _sum: { total: true },
        }),
        this.prisma.customer.count(),
        this.prisma.tour.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
        this.prisma.booking.count({ where: { paymentStatus: 'PENDING', deletedAt: null } }),
      ]);

    return {
      totalBookings,
      totalRevenueMinor: revenue._sum.total ?? 0,
      totalCustomers,
      activeTours,
      pendingPayments,
    };
  }

  /** Bookings per day for the overview chart. */
  async bookingsSeries(days = 7): Promise<{ day: string; bookings: number }[]> {
    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "bookedAt") AS day, COUNT(*) AS count
      FROM "bookings"
      WHERE "deletedAt" IS NULL
        AND "bookedAt" >= NOW() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      day: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(row.day),
      bookings: Number(row.count),
    }));
  }

  async statusBreakdown(): Promise<{ name: string; value: number }[]> {
    const [byStatus, refunded] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.booking.count({ where: { paymentStatus: 'REFUNDED', deletedAt: null } }),
    ]);

    const countOf = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return [
      { name: 'Confirmed', value: countOf('CONFIRMED') },
      { name: 'Pending', value: countOf('PENDING') },
      { name: 'Cancelled', value: countOf('CANCELLED') },
      { name: 'Refunded', value: refunded },
    ];
  }

  async topTours(limit = 5): Promise<{ title: string; bookings: number }[]> {
    const rows = await this.prisma.bookingItem.groupBy({
      by: ['tourTitle'],
      _count: { _all: true },
      orderBy: { _count: { tourTitle: 'desc' } },
      take: limit,
    });

    return rows.map((row) => ({ title: row.tourTitle, bookings: row._count._all }));
  }

  async recentBookings(limit = 5) {
    const rows = await this.prisma.booking.findMany({
      where: { deletedAt: null },
      orderBy: { bookedAt: 'desc' },
      take: limit,
      include: { customer: { select: { fullName: true } } },
    });

    return rows.map((row) => ({
      reference: row.reference,
      customer: row.customer.fullName,
      amountMinor: row.total,
      status: row.status,
      bookedAt: row.bookedAt.toISOString(),
    }));
  }

  // --- tours -----------------------------------------------------------------

  async tourStats(): Promise<{
    total: number;
    published: number;
    draft: number;
    locations: number;
  }> {
    const [total, published, draft, locations] = await Promise.all([
      this.prisma.tour.count({ where: { deletedAt: null } }),
      this.prisma.tour.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      this.prisma.tour.count({ where: { status: 'DRAFT', deletedAt: null } }),
      this.prisma.location.count({ where: { deletedAt: null } }),
    ]);

    return { total, published, draft, locations };
  }

  async listTours(
    query: ListAdminToursQueryDto,
  ): Promise<{ data: AdminTourDto[]; meta: PaginationMeta }> {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.TourWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { location: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
      ...(query.location ? { location: { name: query.location } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tour.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          location: { select: { name: true } },
          images: { where: { isCover: true }, take: 1, select: { url: true } },
        },
      }),
      this.prisma.tour.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        location: row.location.name,
        durationHours: Number(row.durationHours),
        priceUsdMinor: row.priceAdultUsd,
        priceEurMinor: row.priceAdultEur,
        status: row.status,
        coverImage: row.images[0]?.url ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // --- bookings --------------------------------------------------------------

  async bookingStats() {
    const [total, confirmed, pending, cancelled, revenue] = await Promise.all([
      this.prisma.booking.count({ where: { deletedAt: null } }),
      this.prisma.booking.count({ where: { status: 'CONFIRMED', deletedAt: null } }),
      this.prisma.booking.count({ where: { status: 'PENDING', deletedAt: null } }),
      this.prisma.booking.count({ where: { status: 'CANCELLED', deletedAt: null } }),
      this.prisma.booking.aggregate({
        where: { paymentStatus: 'PAID', deletedAt: null },
        _sum: { total: true },
      }),
    ]);

    return { total, confirmed, pending, cancelled, revenueMinor: revenue._sum.total ?? 0 };
  }

  async listBookings(
    query: ListAdminBookingsQueryDto,
  ): Promise<{ data: AdminBookingDto[]; meta: PaginationMeta }> {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { customer: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
      ...(query.paymentStatus && query.paymentStatus !== 'ALL'
        ? { paymentStatus: query.paymentStatus }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { bookedAt: 'desc' },
        skip,
        take,
        include: {
          customer: { select: { fullName: true, email: true } },
          items: { select: { tourTitle: true, quantity: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        reference: row.reference,
        customerName: row.customer.fullName,
        customerEmail: row.customer.email,
        tours: row.items.map((item) => item.tourTitle),
        tickets: row.items.reduce((sum, item) => sum + item.quantity, 0),
        totalMinor: row.total,
        currency: row.currency,
        paymentStatus: row.paymentStatus,
        status: row.status,
        bookedAt: row.bookedAt.toISOString(),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async bookingByReference(reference: string): Promise<AdminBookingDetailDto> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      include: {
        customer: true,
        items: { include: { tickets: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!booking) {
      throw new NotFoundException('That booking could not be found.');
    }

    const payment = booking.payments[0];

    return {
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      bookedAt: booking.bookedAt.toISOString(),
      currency: booking.currency,
      subtotalMinor: booking.subtotal,
      bookingFeeMinor: booking.bookingFee,
      totalMinor: booking.total,
      customer: {
        fullName: booking.customer.fullName,
        email: booking.customer.email,
      },
      items: booking.items.map((item) => ({
        id: item.id,
        title: item.tourTitle,
        date: item.date.toISOString().slice(0, 10),
        time: item.time,
        quantity: item.quantity,
        unitPriceMinor: item.unitPrice,
        amountMinor: item.amount,
        holders: item.tickets.map((ticket) => `${ticket.holderFirstName} ${ticket.holderLastName}`),
      })),
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            transactionId: payment.transactionId,
            amountMinor: payment.amount,
            paidAt: payment.paidAt?.toISOString() ?? null,
          }
        : null,
      notes: booking.notes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
      })),
    };
  }

  // --- blogs -----------------------------------------------------------------

  async blogStats(): Promise<{ total: number; published: number; draft: number }> {
    const [total, published, draft] = await Promise.all([
      this.prisma.blog.count({ where: { deletedAt: null } }),
      this.prisma.blog.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      this.prisma.blog.count({ where: { status: 'DRAFT', deletedAt: null } }),
    ]);

    return { total, published, draft };
  }

  async listBlogs(
    query: ListAdminBlogsQueryDto,
  ): Promise<{ data: AdminBlogDto[]; meta: PaginationMeta }> {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.BlogWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
      ...(query.category ? { categories: { some: { category: { name: query.category } } } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: { categories: { include: { category: { select: { name: true } } } } },
      }),
      this.prisma.blog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        // No excerpt column exists — the teaser comes from the body.
        excerpt: row.content.split('\n\n')[0]?.slice(0, 140) ?? '',
        categories: row.categories.map((link) => link.category.name),
        status: row.status,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // --- payments --------------------------------------------------------------

  async paymentStats() {
    const [collected, pending, refunded, failed] = await Promise.all([
      this.prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({
        where: { status: 'REFUNDED' },
        _sum: { refundedAmount: true },
      }),
      this.prisma.payment.count({ where: { status: 'FAILED' } }),
    ]);

    return {
      collectedMinor: collected._sum.amount ?? 0,
      pendingMinor: pending._sum.amount ?? 0,
      refundedMinor: refunded._sum.refundedAmount ?? 0,
      failed,
    };
  }

  async listPayments(
    page = 1,
    limit = 10,
  ): Promise<{ data: AdminPaymentDto[]; meta: PaginationMeta }> {
    const pagination = normalizePagination({ page, limit });

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          booking: {
            select: { reference: true, customer: { select: { fullName: true } } },
          },
        },
      }),
      this.prisma.payment.count(),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        bookingReference: row.booking.reference,
        customerName: row.booking.customer.fullName,
        method: row.method,
        transactionId: row.transactionId,
        amountMinor: row.amount,
        refundedMinor: row.refundedAmount,
        currency: row.currency,
        status: row.status,
        paidAt: row.paidAt?.toISOString() ?? null,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }
}
