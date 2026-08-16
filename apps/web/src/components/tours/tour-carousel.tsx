'use client';

import * as React from 'react';

import Link from 'next/link';

import { cn, TourCard } from '@pasta/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { TourSummary } from '@pasta/api-client';

/** Matches the `lg` card width below; used only for the pre-hydration guess. */
const CARDS_PER_PAGE_DESKTOP = 3;

/**
 * A row of tours that slides, with an arrow on either side.
 *
 * Built on native scroll-snap rather than a carousel library, the same way the
 * landing page's trending row is: touch swiping, iOS momentum, trackpad
 * gestures and keyboard scrolling all come for free, it costs nothing in
 * bundle size, and it degrades to a plain scrollable row if JavaScript never
 * arrives. The arrows drive the same scroll position a finger does, so the two
 * can never disagree.
 *
 * The arrows sit over the track's edges rather than above it, because with
 * more tours than fit on screen the affordance has to be next to the thing it
 * scrolls.
 */
export function TourCarousel({ title, tours }: { title: string; tours: TourSummary[] }) {
  const trackRef = React.useRef<HTMLUListElement>(null);
  const [page, setPage] = React.useState(0);
  // Seeded with the desktop layout so the arrows are enabled in the
  // server-rendered markup; the measurement below corrects the count for the
  // real breakpoint once mounted.
  const [pageCount, setPageCount] = React.useState(() =>
    Math.max(1, Math.ceil(tours.length / CARDS_PER_PAGE_DESKTOP)),
  );

  /**
   * A "page" is one track-width of cards, which changes with the breakpoint —
   * three on a desktop, one on a phone. Measuring rather than assuming keeps
   * the arrows' disabled states honest at every size.
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
    'absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-elevated transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground';

  return (
    <section className="mt-16" aria-roledescription="carousel" aria-label={title}>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>

      <div className="relative mt-6">
        <button
          type="button"
          aria-label="Previous tours"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
          className={cn(arrow, '-left-2 sm:-left-5')}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="More tours"
          disabled={page >= pageCount - 1}
          onClick={() => goTo(page + 1)}
          className={cn(arrow, '-right-2 sm:-right-5')}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>

        <ul
          ref={trackRef}
          className="scrollbar-none flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2"
          tabIndex={0}
          aria-label={title}
        >
          {tours.map((tour) => (
            <li
              key={tour.id}
              className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
            >
              <TourCard
                title={tour.title}
                location={tour.location}
                durationHours={tour.durationHours}
                priceMinor={tour.priceMinor}
                currency={tour.currency}
                imageUrl={tour.coverImage ?? undefined}
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
      </div>
    </section>
  );
}
