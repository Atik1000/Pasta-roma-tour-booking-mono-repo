import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationMeta } from '@pasta/types';
import { buildPaginationMeta, normalizePagination } from '@pasta/utils';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, TourBulletKind } from '../../generated/prisma/client';
import type {
  AdminBlogDto,
  AdminBookingDetailDto,
  AdminBookingDto,
  AdminPaymentDto,
  AdminTourDto,
  DashboardRangeQueryDto,
  DashboardStatsDto,
  ListAdminBlogsQueryDto,
  ListAdminBookingsQueryDto,
  ListAdminPaymentsQueryDto,
  ListAdminToursQueryDto,
  TopTourDto,
} from './dto/admin.dto';

/** Start of the given UTC day, or undefined when the caller left it open. */
function startOfDay(date?: string): Date | undefined {
  return date ? new Date(`${date.slice(0, 10)}T00:00:00.000Z`) : undefined;
}

/**
 * End of the given UTC day. The bound is exclusive-by-a-millisecond rather than
 * the next midnight so `lte` includes everything booked on the closing day.
 */
function endOfDay(date?: string): Date | undefined {
  return date ? new Date(`${date.slice(0, 10)}T23:59:59.999Z`) : undefined;
}

/**
 * A Prisma date filter for a `from`/`to` pair, or undefined when neither bound
 * was given — an empty `{}` would still narrow nothing but reads as a filter.
 */
function dateRangeFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const gte = startOfDay(from);
  const lte = endOfDay(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/**
 * The same thing, ready to spread into a `where`: `{}` when the range is open,
 * so callers do not have to test the range and then build it a second time.
 */
function dateRangeOn<TField extends string>(
  field: TField,
  from?: string,
  to?: string,
): Partial<Record<TField, { gte?: Date; lte?: Date }>> {
  const range = dateRangeFilter(from, to);
  return range ? ({ [field]: range } as Record<TField, typeof range>) : {};
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // --- dashboard -------------------------------------------------------------

  /**
   * Every figure on the dashboard honours the header's date range.
   *
   * Two of them deliberately do not: Active Tours and Total Customers are
   * "how much do we have right now" counts, not activity in a window, so a
   * narrower range must not make the catalogue look smaller.
   */
  async dashboardStats(range: DashboardRangeQueryDto = {}): Promise<DashboardStatsDto> {
    const bookedAt = dateRangeFilter(range.from, range.to);
    const inRange = { deletedAt: null, ...(bookedAt ? { bookedAt } : {}) };

    const [totalBookings, revenue, totalCustomers, activeTours, pendingPayments] =
      await Promise.all([
        this.prisma.booking.count({ where: inRange }),
        this.prisma.booking.aggregate({
          where: { ...inRange, paymentStatus: 'PAID' },
          _sum: { total: true },
        }),
        this.prisma.customer.count(),
        this.prisma.tour.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
        this.prisma.booking.count({ where: { ...inRange, paymentStatus: 'PENDING' } }),
      ]);

    return {
      totalBookings,
      totalRevenueMinor: revenue._sum.total ?? 0,
      totalCustomers,
      activeTours,
      pendingPayments,
    };
  }

  /**
   * Bookings per day for the overview chart.
   *
   * Days with no bookings are emitted as zero rather than omitted: a gap in the
   * result set would make the line jump straight from one busy day to the next
   * and read as though the quiet day never existed.
   */
  async bookingsSeries(
    range: DashboardRangeQueryDto = {},
  ): Promise<{ day: string; bookings: number }[]> {
    const to = endOfDay(range.to) ?? new Date();
    const from =
      startOfDay(range.from) ??
      new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 6));

    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "bookedAt") AS day, COUNT(*) AS count
      FROM "bookings"
      WHERE "deletedAt" IS NULL
        AND "bookedAt" >= ${from}
        AND "bookedAt" <= ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const counts = new Map(
      rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]),
    );

    const format = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });

    // A very wide range would produce an unreadable axis, so the series is
    // capped at a quarter's worth of days.
    const MAX_DAYS = 92;
    const series: { day: string; bookings: number }[] = [];
    const cursor = new Date(from);

    while (cursor <= to && series.length < MAX_DAYS) {
      const key = cursor.toISOString().slice(0, 10);
      series.push({ day: format.format(cursor), bookings: counts.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return series;
  }

  async statusBreakdown(
    range: DashboardRangeQueryDto = {},
  ): Promise<{ name: string; value: number }[]> {
    const bookedAt = dateRangeFilter(range.from, range.to);
    const inRange = { deletedAt: null, ...(bookedAt ? { bookedAt } : {}) };

    const [byStatus, refunded] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: inRange,
        _count: { _all: true },
      }),
      this.prisma.booking.count({ where: { ...inRange, paymentStatus: 'REFUNDED' } }),
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

  /**
   * The most-booked tours in the range.
   *
   * Grouped by `tourId` rather than the denormalised title so renaming a tour
   * does not split its history into two entries. Cancelled and soft-deleted
   * bookings are excluded — a leaderboard that counted cancellations would rank
   * a tour nobody actually went on.
   */
  async topTours(range: DashboardRangeQueryDto = {}, limit = 5): Promise<TopTourDto[]> {
    const bookedAt = dateRangeFilter(range.from, range.to);

    const rows = await this.prisma.bookingItem.groupBy({
      by: ['tourId'],
      where: {
        booking: {
          deletedAt: null,
          status: { not: 'CANCELLED' },
          ...(bookedAt ? { bookedAt } : {}),
        },
      },
      _count: { _all: true },
      orderBy: { _count: { tourId: 'desc' } },
      take: limit,
    });

    if (rows.length === 0) return [];

    const tours = await this.prisma.tour.findMany({
      where: { id: { in: rows.map((row) => row.tourId) } },
      select: {
        id: true,
        title: true,
        images: { where: { isCover: true }, take: 1, select: { url: true } },
      },
    });

    const byId = new Map(tours.map((tour) => [tour.id, tour]));

    return rows.map((row) => {
      const tour = byId.get(row.tourId);
      return {
        id: row.tourId,
        title: tour?.title ?? 'Deleted tour',
        bookings: row._count._all,
        coverImage: tour?.images[0]?.url ?? null,
      };
    });
  }

  async recentBookings(range: DashboardRangeQueryDto = {}, limit = 5) {
    const bookedAt = dateRangeFilter(range.from, range.to);

    const rows = await this.prisma.booking.findMany({
      where: { deletedAt: null, ...(bookedAt ? { bookedAt } : {}) },
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
      // Advanced filters. The price bounds read the USD column because that is
      // the one the table shows, so the filter matches the visible figures.
      ...(query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined
        ? {
            priceAdultUsd: {
              ...(query.minPriceMinor !== undefined ? { gte: query.minPriceMinor } : {}),
              ...(query.maxPriceMinor !== undefined ? { lte: query.maxPriceMinor } : {}),
            },
          }
        : {}),
      ...dateRangeOn('updatedAt', query.from, query.to),
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

  /**
   * Everything the tour editor needs in one round trip. The public detail
   * endpoint is keyed by slug and hides drafts, so the admin needs its own.
   */
  async tourDetail(id: string) {
    const tour = await this.prisma.tour.findFirst({
      where: { id, deletedAt: null },
      include: {
        location: { select: { name: true } },
        images: { orderBy: { position: 'asc' }, select: { url: true } },
        bullets: { orderBy: { position: 'asc' }, select: { kind: true, text: true } },
        plans: { orderBy: { position: 'asc' }, select: { title: true, description: true } },
      },
    });

    if (!tour) throw new NotFoundException('That tour could not be found.');

    const bulletsOfKind = (kind: TourBulletKind) =>
      tour.bullets.filter((bullet) => bullet.kind === kind).map((bullet) => bullet.text);

    return {
      id: tour.id,
      slug: tour.slug,
      title: tour.title,
      description: tour.description,
      durationHours: Number(tour.durationHours),
      type: tour.type,
      location: tour.location.name,
      priceUsdMinor: tour.priceAdultUsd,
      priceEurMinor: tour.priceAdultEur,
      maxTicketsPerTour: tour.maxTicketsPerTour,
      highlights: bulletsOfKind('HIGHLIGHT'),
      included: bulletsOfKind('INCLUDED'),
      goodToKnow: bulletsOfKind('GOOD_TO_KNOW'),
      gallery: tour.images.map((image) => image.url),
      plans: tour.plans,
      meetingPointTitle: tour.meetingPointTitle,
      meetingPointAddress: tour.meetingPointAddress,
      published: tour.status === 'PUBLISHED',
      createdAt: tour.createdAt.toISOString(),
      updatedAt: tour.updatedAt.toISOString(),
    };
  }

  /** One post in the shape the blog editor edits. */
  async blogDetail(id: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { id, deletedAt: null },
      include: { categories: { include: { category: { select: { name: true } } } } },
    });

    if (!blog) throw new NotFoundException('That post could not be found.');

    return {
      id: blog.id,
      title: blog.title,
      slug: blog.slug,
      content: blog.content,
      status: blog.status,
      coverImage: blog.coverImage,
      categories: blog.categories.map((link) => link.category.name),
      metaTitle: blog.metaTitle,
      metaDescription: blog.metaDescription,
      keywords: blog.keywords,
      publishedAt: blog.publishedAt?.toISOString() ?? null,
      createdAt: blog.createdAt.toISOString(),
      updatedAt: blog.updatedAt.toISOString(),
    };
  }

  /** Every category the blog editor can offer. */
  async blogCategories() {
    return this.prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  /** Destinations for the editor's Location select. */
  async locations() {
    const rows = await this.prisma.location.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, country: true },
    });

    return rows;
  }

  /** Departures for one tour, optionally narrowed to a single date. */
  async tourSlots(tourId: string, date?: string) {
    const rows = await this.prisma.tourSlot.findMany({
      where: {
        tourId,
        ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      time: row.time,
      capacity: row.capacity,
      booked: row.booked,
    }));
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
      // The Tours filter matches bookings that contain the tour, not bookings
      // made up solely of it — a two-tour booking should appear under both.
      ...(query.tourId ? { items: { some: { tourId: query.tourId } } } : {}),
      ...(query.minAmountMinor !== undefined || query.maxAmountMinor !== undefined
        ? {
            total: {
              ...(query.minAmountMinor !== undefined ? { gte: query.minAmountMinor } : {}),
              ...(query.maxAmountMinor !== undefined ? { lte: query.maxAmountMinor } : {}),
            },
          }
        : {}),
      ...dateRangeOn('bookedAt', query.from, query.to),
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
        items: {
          include: {
            tickets: true,
            // For the thumbnail and location line only. Title and price stay
            // denormalised on the item so a historic booking still reads right.
            // `location.name` already reads "Rome, Italy" — the country column
            // is not appended, or it renders as "Florence, Italy, Italy".
            tour: {
              select: {
                location: { select: { name: true } },
                images: { where: { isCover: true }, take: 1, select: { url: true } },
              },
            },
          },
        },
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
        tourId: item.tourId,
        title: item.tourTitle,
        location: item.tour.location.name,
        coverImage: item.tour.images[0]?.url ?? null,
        date: item.date.toISOString().slice(0, 10),
        time: item.time,
        quantity: item.quantity,
        unitPriceMinor: item.unitPrice,
        amountMinor: item.amount,
        holders: item.tickets.map((ticket) => `${ticket.holderFirstName} ${ticket.holderLastName}`),
      })),
      payment: payment
        ? {
            id: payment.id,
            method: payment.method,
            status: payment.status,
            transactionId: payment.transactionId,
            amountMinor: payment.amount,
            paidAt: payment.paidAt?.toISOString() ?? null,
            // A Stripe-backed record is owned by the processor and stays
            // read-only in the admin panel.
            isManual: payment.providerIntentId === null,
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
      // The range applies to the publish date, which is the column the screen
      // shows; drafts have none, so they fall out of a ranged search.
      ...dateRangeOn('publishedAt', query.from, query.to),
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
        coverImage: row.coverImage,
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

  /**
   * Every payment, narrowed server-side.
   *
   * Search, status and method used to be applied in the browser to whichever
   * page happened to be loaded, so searching for a transaction that lived on
   * page 5 returned nothing at all.
   */
  async listPayments(
    query: ListAdminPaymentsQueryDto,
  ): Promise<{ data: AdminPaymentDto[]; meta: PaginationMeta }> {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.PaymentWhereInput = {
      ...(query.search
        ? {
            OR: [
              { transactionId: { contains: query.search, mode: 'insensitive' } },
              { booking: { reference: { contains: query.search, mode: 'insensitive' } } },
              {
                booking: {
                  customer: { fullName: { contains: query.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
      ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
      ...(query.method && query.method !== 'ALL' ? { method: query.method } : {}),
      // Ranged on the capture date, which is the column the table shows.
      ...dateRangeOn('paidAt', query.from, query.to),
    };

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          booking: {
            select: { reference: true, customer: { select: { fullName: true } } },
          },
        },
      }),
      this.prisma.payment.count({ where }),
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
      meta: buildPaginationMeta(total, page, limit),
    };
  }
}
