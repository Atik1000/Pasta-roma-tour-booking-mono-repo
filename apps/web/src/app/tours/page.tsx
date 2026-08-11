import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState, TourCard } from '@pasta/ui';
import { formatResultRange } from '@pasta/utils';

import type { ListToursParams } from '@pasta/api-client';

import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';
import { TourFilters } from '@/components/tours/tour-filters';
import { ToursPagination } from '@/components/tours/tours-pagination';
import { api, safely } from '@/lib/api';
import { activeCurrency } from '@/lib/currency.server';

export const metadata: Metadata = {
  title: 'Explore Our Tours',
  description:
    'Handpicked experiences to help you discover the best of Rome. Choose your adventure and make memories that last a lifetime.',
  alternates: { canonical: '/tours' },
};

const PER_PAGE = 6;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ToursPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const page = Number.parseInt(first(params.page) ?? '1', 10) || 1;
  const currency = await activeCurrency();

  const { data: tours, meta } = await safely(
    api.tours.list({
      q: first(params.q),
      location: first(params.location),
      // Where the landing page's category tiles land.
      type: first(params.type) as ListToursParams['type'],
      sort: first(params.sort) as 'popular' | 'price-asc' | 'price-desc' | 'duration' | undefined,
      page,
      limit: PER_PAGE,
      currency,
    }),
    {
      data: [],
      meta: {
        page: 1,
        limit: 0,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    'tours.list',
  );

  return (
    <>
      {/* Floats over the page hero photograph. */}
      <Navbar overlay />

      <main id="main">
        <PageHero
          title="Explore Our Tours"
          description="Handpicked experiences to help you discover the best of Rome. Choose your adventure and make memories that last a lifetime."
          laurels={false}
        />

        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <TourFilters />

          <p className="text-muted-foreground mt-6 text-sm" aria-live="polite">
            {formatResultRange(meta, 'tours')}
          </p>

          {tours.length === 0 ? (
            <EmptyState
              className="rounded-card border-border bg-card mt-6 border"
              title="No tours match your filters"
              description="Try a different search term or clear the filters to see everything."
              action={
                <Link className="text-primary underline underline-offset-4" href="/tours">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {tours.map((tour) => (
                <TourCard
                  key={tour.id}
                  title={tour.title}
                  location={tour.location}
                  durationHours={tour.durationHours}
                  priceMinor={tour.priceMinor}
                  currency={tour.currency}
                  description={tour.description}
                  imageUrl={tour.coverImage ?? undefined}
                  isBestseller={tour.isBestseller}
                  showAction
                  renderLink={(children) => (
                    <Link
                      href={`/tours/${tour.slug}`}
                      className="rounded-card focus-visible:outline-ring block h-full focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      {children}
                    </Link>
                  )}
                />
              ))}
            </div>
          )}

          <ToursPagination page={meta.page} totalPages={meta.totalPages} className="mt-10" />
        </div>
      </main>

      <Footer />
    </>
  );
}
