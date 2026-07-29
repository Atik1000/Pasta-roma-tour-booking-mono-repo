'use client';

import * as React from 'react';

import Link from 'next/link';

import { cn, SectionHeading, TourCard } from '@pasta/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { TourSummary } from '@pasta/api-client';

const PER_PAGE = 4;

export function TrendingTours({ tours }: { tours: TourSummary[] }) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(tours.length / PER_PAGE));
  const visible = tours.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const arrow =
    'flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground';

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="relative">
        <SectionHeading
          title="Trending Tours"
          description="Handpicked experiences loved by travelers around the world."
        />

        <button
          type="button"
          aria-label="Previous tours"
          disabled={page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          className={cn(arrow, 'absolute left-0 top-1/2 hidden -translate-y-1/2 lg:flex')}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="More tours"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          className={cn(arrow, 'absolute right-0 top-1/2 hidden -translate-y-1/2 lg:flex')}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((tour) => (
          <TourCard
            key={tour.id}
            title={tour.title}
            location={tour.location}
            durationHours={tour.durationHours}
            priceMinor={tour.priceMinor}
            currency={tour.currency}
            isBestseller={tour.isBestseller}
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

      {pageCount > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === page}
              onClick={() => setPage(index)}
              className={cn(
                'focus-visible:outline-ring h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2',
                index === page ? 'bg-primary w-6' : 'bg-cream-400 hover:bg-cream-500 w-2',
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
