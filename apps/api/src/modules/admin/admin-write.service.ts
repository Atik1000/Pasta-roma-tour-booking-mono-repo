import { Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@pasta/utils';

import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type {
  SaveBlogDto,
  SaveTourDto,
  UpdateBookingDto,
  UpsertNoteDto,
} from './dto/admin-write.dto';

@Injectable()
export class AdminWriteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends `-2`, `-3`… until the slug is free. */
  private async uniqueSlug(
    table: 'tour' | 'blog',
    desired: string,
    ignoreId?: string,
  ): Promise<string> {
    const base = slugify(desired) || 'untitled';
    let candidate = base;

    for (let attempt = 2; attempt < 100; attempt += 1) {
      const existing =
        table === 'tour'
          ? await this.prisma.tour.findUnique({ where: { slug: candidate }, select: { id: true } })
          : await this.prisma.blog.findUnique({ where: { slug: candidate }, select: { id: true } });

      if (!existing || existing.id === ignoreId) return candidate;
      candidate = `${base}-${attempt}`;
    }

    throw new BusinessException(BusinessErrorCode.SlugTaken, 'Could not derive a unique slug.');
  }

  // --- tours -----------------------------------------------------------------

  private async resolveLocationId(name: string): Promise<string> {
    const location = await this.prisma.location.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException(`Unknown location: ${name}`);
    }

    return location.id;
  }

  async createTour(dto: SaveTourDto): Promise<{ id: string; slug: string }> {
    const slug = await this.uniqueSlug('tour', dto.slug ?? dto.title);
    const locationId = await this.resolveLocationId(dto.location);

    const tour = await this.prisma.tour.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        durationHours: dto.durationHours,
        type: dto.type,
        status: dto.published ? 'PUBLISHED' : 'DRAFT',
        locationId,
        priceAdultEur: dto.priceEurMinor,
        priceAdultUsd: dto.priceUsdMinor,
        maxTicketsPerTour: dto.maxTicketsPerTour,
        meetingPointTitle: dto.meetingPointTitle,
        meetingPointAddress: dto.meetingPointAddress,
        bullets: { create: AdminWriteService.bulletRows(dto) },
        plans: {
          create: dto.plans.map((plan, index) => ({
            position: index + 1,
            title: plan.title,
            description: plan.description,
          })),
        },
      },
      select: { id: true, slug: true },
    });

    return tour;
  }

  async updateTour(id: string, dto: SaveTourDto): Promise<{ id: string; slug: string }> {
    const existing = await this.prisma.tour.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('That tour could not be found.');

    const slug = await this.uniqueSlug('tour', dto.slug ?? dto.title, id);
    const locationId = await this.resolveLocationId(dto.location);

    // Bullets and plans are positional lists; replacing them wholesale keeps the
    // stored order identical to what the editor shows.
    return this.prisma.$transaction(async (tx) => {
      await tx.tourBullet.deleteMany({ where: { tourId: id } });
      await tx.tourPlan.deleteMany({ where: { tourId: id } });

      return tx.tour.update({
        where: { id },
        data: {
          title: dto.title,
          slug,
          description: dto.description,
          durationHours: dto.durationHours,
          type: dto.type,
          status: dto.published ? 'PUBLISHED' : 'DRAFT',
          locationId,
          priceAdultEur: dto.priceEurMinor,
          priceAdultUsd: dto.priceUsdMinor,
          maxTicketsPerTour: dto.maxTicketsPerTour,
          meetingPointTitle: dto.meetingPointTitle,
          meetingPointAddress: dto.meetingPointAddress,
          bullets: { create: AdminWriteService.bulletRows(dto) },
          plans: {
            create: dto.plans.map((plan, index) => ({
              position: index + 1,
              title: plan.title,
              description: plan.description,
            })),
          },
        },
        select: { id: true, slug: true },
      });
    });
  }

  private static bulletRows(dto: SaveTourDto) {
    const rows: {
      kind: 'HIGHLIGHT' | 'INCLUDED' | 'GOOD_TO_KNOW';
      text: string;
      position: number;
    }[] = [];

    const push = (kind: 'HIGHLIGHT' | 'INCLUDED' | 'GOOD_TO_KNOW', values: string[]) => {
      values
        .map((text) => text.trim())
        .filter(Boolean)
        .forEach((text, position) => rows.push({ kind, text, position }));
    };

    push('HIGHLIGHT', dto.highlights);
    push('INCLUDED', dto.included);
    push('GOOD_TO_KNOW', dto.goodToKnow);
    return rows;
  }

  /**
   * Soft delete. A tour referenced by past bookings must keep existing so those
   * bookings still resolve, so nothing is ever physically removed here.
   */
  async deleteTour(id: string): Promise<void> {
    const tour = await this.prisma.tour.findFirst({ where: { id, deletedAt: null } });
    if (!tour) throw new NotFoundException('That tour could not be found.');

    await this.prisma.tour.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DRAFT' },
    });
  }

  // --- blogs -----------------------------------------------------------------

  async saveBlog(dto: SaveBlogDto, id?: string): Promise<{ id: string; slug: string }> {
    const slug = await this.uniqueSlug('blog', dto.slug ?? dto.title, id);

    const categoryIds = await this.prisma.blogCategory.findMany({
      where: { name: { in: dto.categories } },
      select: { id: true },
    });

    const publishing = dto.status === 'PUBLISHED';

    const data = {
      title: dto.title,
      slug,
      content: dto.content,
      status: dto.status,
      coverImage: dto.coverImage,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
    };

    if (id) {
      const existing = await this.prisma.blog.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, publishedAt: true },
      });

      if (!existing) throw new NotFoundException('That post could not be found.');

      return this.prisma.$transaction(async (tx) => {
        await tx.blogOnCategory.deleteMany({ where: { blogId: id } });

        return tx.blog.update({
          where: { id },
          data: {
            ...data,
            // Stamped once, on first publish — the manual date field was struck.
            publishedAt: publishing ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
            categories: { create: categoryIds.map((category) => ({ categoryId: category.id })) },
          },
          select: { id: true, slug: true },
        });
      });
    }

    return this.prisma.blog.create({
      data: {
        ...data,
        publishedAt: publishing ? new Date() : null,
        categories: { create: categoryIds.map((category) => ({ categoryId: category.id })) },
      },
      select: { id: true, slug: true },
    });
  }

  async deleteBlog(id: string): Promise<void> {
    const blog = await this.prisma.blog.findFirst({ where: { id, deletedAt: null } });
    if (!blog) throw new NotFoundException('That post could not be found.');

    await this.prisma.blog.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DRAFT' },
    });
  }

  // --- bookings --------------------------------------------------------------

  async updateBooking(reference: string, dto: UpdateBookingDto): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true, customerId: true, status: true },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    await this.prisma.$transaction(async (tx) => {
      if (dto.fullName !== undefined || dto.email !== undefined) {
        await tx.customer.update({
          where: { id: booking.customerId },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(dto.email !== undefined ? { email: dto.email.toLowerCase().trim() } : {}),
          },
        });
      }

      if (dto.status !== undefined && dto.status !== booking.status) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: dto.status,
            cancelledAt: dto.status === 'CANCELLED' ? new Date() : null,
          },
        });
      }
    });
  }

  /**
   * Cancels a booking and returns its seats to inventory. Idempotent: a booking
   * already cancelled releases nothing a second time.
   */
  async cancelBooking(reference: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true, status: true, items: { select: { slotId: true, quantity: true } } },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    if (booking.status === 'CANCELLED') {
      throw new BusinessException(
        BusinessErrorCode.BookingNotCancellable,
        'That booking is already cancelled.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      ...booking.items.map((item) =>
        this.prisma.tourSlot.update({
          where: { id: item.slotId },
          data: { booked: { decrement: item.quantity } },
        }),
      ),
    ]);
  }

  async addNote(reference: string, dto: UpsertNoteDto, authorId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    await this.prisma.bookingNote.create({
      data: { bookingId: booking.id, authorId, body: dto.body.trim() },
    });
  }
}
