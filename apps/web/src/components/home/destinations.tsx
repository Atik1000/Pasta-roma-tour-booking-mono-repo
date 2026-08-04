import Link from 'next/link';

import { SectionHeading } from '@pasta/ui';
import { formatPriceFrom } from '@pasta/utils';
import { ArrowRight, MapPin } from 'lucide-react';

import type { CurrencyCode } from '@pasta/types';

export interface DestinationTile {
  name: string;
  tourCount: number;
  cheapestMinor?: number;
  /** A cover photo borrowed from one of the destination's own tours. */
  imageUrl?: string;
}

/**
 * Top destinations.
 *
 * The tiles borrow a cover photo from a tour that actually runs there rather
 * than drawing another gold gradient — the catalogue already has photography of
 * every one of these places, and a wall of identical gradients was the least
 * convincing thing on the page. A destination whose tours have no photo yet
 * falls back to the gradient, so a missing image degrades to the old look
 * instead of a broken tile.
 *
 * The first tile spans two columns from `sm` up: an even grid of six read as a
 * list of links, and nothing about it said which city the site is actually
 * built around.
 */
export function Destinations({
  destinations,
  currency,
}: {
  destinations: DestinationTile[];
  currency: CurrencyCode;
}) {
  if (destinations.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <SectionHeading
        eyebrow="Where to go"
        title="Top Destinations"
        description="From the heart of Rome to the hills of Tuscany — pick a place and we will show you the best of it."
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {destinations.map((destination, index) => (
          <li key={destination.name} className={index === 0 ? 'sm:col-span-2' : undefined}>
            <Link
              href={`/tours?location=${encodeURIComponent(destination.name)}`}
              className="rounded-card shadow-card hover:shadow-elevated focus-visible:outline-ring group relative flex h-full min-h-52 flex-col justify-end overflow-hidden transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 sm:min-h-56"
            >
              {destination.imageUrl ? (
                /* A plain img, not the Next loader: these are API-served upload
                   URLs and the host changes with the deployment. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={destination.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
                />
              )}

              {/* Holds the white type legible over whatever the photo happens
                  to be doing at the bottom of the frame. */}
              <span
                aria-hidden
                className="from-cream-900/90 via-cream-900/40 absolute inset-0 bg-gradient-to-t to-transparent"
              />

              <span className="relative flex flex-col gap-1 p-5">
                <span className="font-display inline-flex items-center gap-2 text-xl font-semibold text-white">
                  <MapPin className="text-brand-200 size-4 shrink-0" aria-hidden />
                  {destination.name}
                </span>
                <span className="text-sm text-white/80">
                  {destination.tourCount === 0
                    ? 'New tours coming soon'
                    : `${destination.tourCount} ${destination.tourCount === 1 ? 'tour' : 'tours'}${
                        destination.cheapestMinor === undefined
                          ? ''
                          : ` · from ${formatPriceFrom(destination.cheapestMinor, currency)}`
                      }`}
                </span>
                <span className="text-brand-200 mt-2 inline-flex items-center gap-1.5 text-sm font-medium">
                  Browse tours
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
