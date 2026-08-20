import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrencyCode, type PaginationMeta } from '@pasta/types';
import { buildPaginationMeta, normalizePagination } from '@pasta/utils';

import { adultPriceMinor } from '../../common/dto/currency-query.dto';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { ListToursQueryDto, TourDetailDto, TourSummaryDto } from './dto/tour.dto';

/** Only published, non-deleted tours are ever visible to the public site. */
const PUBLIC_TOUR_FILTER = { status: 'PUBLISHED', deletedAt: null } as const;

/**
 * Sorting by price has to follow the currency being displayed: the two prices
 * are entered independently, so ordering by the EUR column can contradict the
 * USD figures on screen.
 */
function orderBy(sort: string, currency: CurrencyCode): Prisma.TourOrderByWithRelationInput[] {
  const priceColumn = currency === CurrencyCode.USD ? 'priceAdultUsd' : 'priceAdultEur';

  switch (sort) {
    case 'price-asc':
      return [{ [priceColumn]: 'asc' }];
    case 'price-desc':
      return [{ [priceColumn]: 'desc' }];
    case 'duration':
      return [{ durationHours: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    default:
      return [{ isBestseller: 'desc' }, { sortOrder: 'asc' }];
  }
}

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
      ...(query.type ? { type: query.type } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tour.findMany({
        where,
        orderBy: orderBy(query.sort, query.currency),
        skip,
        take,
        include: {
          location: { select: { name: true } },
          // Ordered rather than filtered on `isCover`: the first image *is* the
          // cover, and a gallery whose flag was never set would otherwise show
          // a photo on the detail page and a gradient in the grid.
          images: {
            orderBy: [{ isCover: 'desc' }, { position: 'asc' }],
            take: 1,
            select: { url: true },
          },
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
        priceMinor: adultPriceMinor(row, query.currency),
        currency: query.currency,
        description: row.description,
        isBestseller: row.isBestseller,
        coverImage: row.images[0]?.url ?? null,
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findBySlug(
    slug: string,
    currency: CurrencyCode = CurrencyCode.EUR,
  ): Promise<TourDetailDto> {
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
      priceMinor: adultPriceMinor(tour, currency),
      currency,
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

  /** Other published tours, for the "You might also like" rail. */
  async related(
    slug: string,
    currency: CurrencyCode = CurrencyCode.EUR,
    limit = 3,
  ): Promise<TourSummaryDto[]> {
    const rows = await this.prisma.tour.findMany({
      where: { ...PUBLIC_TOUR_FILTER, slug: { not: slug } },
      orderBy: [{ isBestseller: 'desc' }, { sortOrder: 'asc' }],
      take: limit,
      include: {
        location: { select: { name: true } },
        images: {
          orderBy: [{ isCover: 'desc' }, { position: 'asc' }],
          take: 1,
          select: { url: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      location: row.location.name,
      durationHours: Number(row.durationHours),
      priceMinor: adultPriceMinor(row, currency),
      currency,
      description: row.description,
      isBestseller: row.isBestseller,
      coverImage: row.images[0]?.url ?? null,
    }));
  }
}
