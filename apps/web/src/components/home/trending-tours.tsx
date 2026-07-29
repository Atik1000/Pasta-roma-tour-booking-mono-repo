'use client';

import * as React from 'react';

import Link from 'next/link';

import { cn, SectionHeading, TourCard } from '@pasta/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { TourSummary } from '@pasta/api-client';

/** Matches the `lg` card width below; used only for the pre-hydration guess. */
const CARDS_PER_PAGE_DESKTOP = 4;

/**
 * Trending tours, as a swipeable track.
 *
 * Built on native scroll-snap rather than a carousel library. That buys touch
 * swiping, momentum on iOS, trackpad gestures and keyboard scrolling for free,
 * costs nothing in bundle size, and degrades to a plain scrollable row if
 * JavaScript never arrives. The arrows and dots drive the same scroll position
 * a finger does, so the three can never disagree.
 *
 * Cards are sized so the next one peeks in at narrow widths — the cue that
 * tells a traveller there is more to swipe to.
 */
export function TrendingTours({ tours }: { tours: TourSummary[] }) {
  const trackRef = React.useRef<HTMLUListElement>(null);
  const [page, setPage] = React.useState(0);
  // Seeded with the desktop layout so the dots are in the server-rendered
  // markup; the measurement below corrects the count for the real breakpoint
  // once mounted. Starting at 1 made them pop in after hydration.
  const [pageCount, setPageCount] = React.useState(() =>
    Math.max(1, Math.ceil(tours.length / CARDS_PER_PAGE_DESKTOP)),
  );

  /**
   * A "page" is one track-width of cards, which changes with the breakpoint —
   * four on a desktop, one on a phone. Measuring rather than assuming keeps
   * the dots honest at every size.
   */
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const width = track.clientWidth;
      if (width === 0) return;

      setPageCount(Math.max(1, Math.round(track.scrollWidth / width)));
      setPage(Math.round(track.scrollLeft / width));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);
    track.addEventListener('scroll', measure, { passive: true });

    return () => {
      observer.disconnect();
      track.removeEventListener('scroll', measure);
    };
  }, [tours.length]);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;

    const target = Math.min(Math.max(index, 0), pageCount - 1);

    track.scrollTo({
      left: target * track.clientWidth,
      // Honour a reduced-motion preference: a sliding animation is exactly the
      // kind of movement that setting exists to suppress.
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  const arrow =
    'flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground';

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
      aria-roledescription="carousel"
      aria-label="Trending tours"
    >
      <div className="relative">
        <SectionHeading
          title="Trending Tours"
          description="Handpicked experiences loved by travelers around the world."
        />

        <button
          type="button"
          aria-label="Previous tours"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
          className={cn(arrow, 'absolute left-0 top-1/2 hidden -translate-y-1/2 lg:flex')}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="More tours"
          disabled={page >= pageCount - 1}
          onClick={() => goTo(page + 1)}
          className={cn(arrow, 'absolute right-0 top-1/2 hidden -translate-y-1/2 lg:flex')}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      <ul
        ref={trackRef}
        // `-mx-4 px-4` lets the first card line up with the section padding
        // while its neighbour still peeks past the edge of the viewport.
        className="scrollbar-none -mx-4 mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
        tabIndex={0}
        aria-label="Trending tours"
      >
        {tours.map((tour) => (
          <li
            key={tour.id}
            className="w-[78%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-4.5rem)/4)]"
          >
            <TourCard
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
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === page}
              onClick={() => goTo(index)}
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
