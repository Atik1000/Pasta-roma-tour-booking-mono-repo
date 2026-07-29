import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationMeta } from '@pasta/types';
import { buildPaginationMeta, normalizePagination } from '@pasta/utils';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type {
  AvailabilityDayDto,
  ListToursQueryDto,
  SlotDto,
  TourDetailDto,
  TourSummaryDto,
} from './dto/tour.dto';

/** Only published, non-deleted tours are ever visible to the public site. */
const PUBLIC_TOUR_FILTER = { status: 'PUBLISHED', deletedAt: null } as const;

const ORDER_BY: Record<string, Prisma.TourOrderByWithRelationInput[]> = {
  popular: [{ isBestseller: 'desc' }, { sortOrder: 'asc' }],
  'price-asc': [{ priceAdultEur: 'asc' }],
  'price-desc': [{ priceAdultEur: 'desc' }],
  duration: [{ durationHours: 'asc' }],
  newest: [{ createdAt: 'desc' }],
};

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListToursQueryDto): Promise<{ data: TourSummaryDto[]; meta: PaginationMeta }> {
    const { page, limit, skip, take } = normalizePagination(query);

    const where: Prisma.TourWhereInput = {
      ...PUBLIC_TOUR_FILTER,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.location ? { location: { name: query.location } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tour.findMany({
        where,
        orderBy: ORDER_BY[query.sort] ?? ORDER_BY.popular,
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
        location: row.location.name,
        durationHours: Number(row.durationHours),
        priceMinor: row.priceAdultEur,
        currency: 'EUR' as const,
        description: row.description,
        isBestseller: row.isBestseller,
        coverImage: row.images[0]?.url ?? null,
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findBySlug(slug: string): Promise<TourDetailDto> {
    const tour = await this.prisma.tour.findFirst({
      where: { slug, ...PUBLIC_TOUR_FILTER },
      include: {
        location: { select: { name: true } },
        images: { orderBy: { position: 'asc' } },
        bullets: { orderBy: { position: 'asc' } },
        plans: { orderBy: { position: 'asc' } },
      },
    });

    if (!tour) {
      throw new NotFoundException('That tour could not be found.');
    }

    const bulletsOf = (kind: 'HIGHLIGHT' | 'INCLUDED' | 'GOOD_TO_KNOW') =>
      tour.bullets.filter((bullet) => bullet.kind === kind).map((bullet) => bullet.text);

    return {
      id: tour.id,
      slug: tour.slug,
      title: tour.title,
      location: tour.location.name,
      durationHours: Number(tour.durationHours),
      priceMinor: tour.priceAdultEur,
      currency: 'EUR',
      description: tour.description,
      isBestseller: tour.isBestseller,
      coverImage: tour.images.find((image) => image.isCover)?.url ?? tour.images[0]?.url ?? null,
      highlights: bulletsOf('HIGHLIGHT'),
      included: bulletsOf('INCLUDED'),
      goodToKnow: bulletsOf('GOOD_TO_KNOW'),
      plan: tour.plans.map((plan) => ({ title: plan.title, description: plan.description })),
      gallery: tour.images.map((image) => ({
        url: image.url,
        alt: image.alt,
        isCover: image.isCover,
      })),
      meetingPointTitle: tour.meetingPointTitle,
      meetingPointAddress: tour.meetingPointAddress,
      maxTicketsPerTour: tour.maxTicketsPerTour,
    };
  }

  /** Departure times for one date. Sold-out slots are returned, not hidden. */
  async slotsForDate(slug: string, date: string): Promise<SlotDto[]> {
    const tour = await this.requireTourId(slug);

    const slots = await this.prisma.tourSlot.findMany({
      where: { tourId: tour.id, date: new Date(`${date}T00:00:00.000Z`) },
      orderBy: { time: 'asc' },
    });

    return slots.map((slot) => {
      const remaining = Math.max(0, slot.capacity - slot.booked);
      return { id: slot.id, time: slot.time, available: remaining > 0, remaining };
    });
  }

  /** One entry per day for the availability rail. */
  async availability(slug: string, from: string, days: number): Promise<AvailabilityDayDto[]> {
    const tour = await this.requireTourId(slug);

    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + days);

    const slots = await this.prisma.tourSlot.findMany({
      where: { tourId: tour.id, date: { gte: start, lt: end } },
      select: { date: true, capacity: true, booked: true },
    });

    // A day is bookable when at least one of its slots still has a seat.
    const bookableDays = new Set(
      slots
        .filter((slot) => slot.capacity - slot.booked > 0)
        .map((slot) => slot.date.toISOString().slice(0, 10)),
    );

    return Array.from({ length: days }, (_, index) => {
      const day = new Date(start.getTime());
      day.setUTCDate(day.getUTCDate() + index);
      const date = day.toISOString().slice(0, 10);
      return { date, available: bookableDays.has(date) };
    });
  }

  private async requireTourId(slug: string): Promise<{ id: string }> {
    const tour = await this.prisma.tour.findFirst({
      where: { slug, ...PUBLIC_TOUR_FILTER },
      select: { id: true },
    });

    if (!tour) {
      throw new NotFoundException('That tour could not be found.');
    }

    return tour;
  }

  /** Other published tours, for the "You might also like" rail. */
  async related(slug: string, limit = 3): Promise<TourSummaryDto[]> {
    const rows = await this.prisma.tour.findMany({
      where: { ...PUBLIC_TOUR_FILTER, slug: { not: slug } },
      orderBy: [{ isBestseller: 'desc' }, { sortOrder: 'asc' }],
      take: limit,
      include: {
        location: { select: { name: true } },
        images: { where: { isCover: true }, take: 1, select: { url: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      location: row.location.name,
      durationHours: Number(row.durationHours),
      priceMinor: row.priceAdultEur,
      currency: 'EUR' as const,
      description: row.description,
      isBestseller: row.isBestseller,
      coverImage: row.images[0]?.url ?? null,
    }));
  }
}
