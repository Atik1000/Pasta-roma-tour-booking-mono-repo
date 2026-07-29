import type { Metadata } from 'next';
import Link from 'next/link';

import { formatPriceFrom } from '@pasta/utils';
import { ArrowRight, MapPin } from 'lucide-react';

import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';
import { api, safely } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Locations',
  description: 'Every destination we run tours in, from Rome and the Vatican to Tuscany.',
  alternates: { canonical: '/locations' },
};

/** Target of the Locations link in the navbar and footer. */
export default async function LocationsPage() {
  const [locations, catalogue] = await Promise.all([
    safely(api.locations.list(), [], 'locations.list'),
    safely(api.tours.list({ limit: 100 }), null, 'tours.list'),
  ]);

  const summaries = locations.map((entry) => {
    const prices = (catalogue?.data ?? [])
      .filter((tour) => tour.location === entry.name)
      .map((tour) => tour.priceMinor);

    return {
      location: entry.name,
      count: entry.tourCount,
      cheapest: prices.length > 0 ? Math.min(...prices) : undefined,
    };
  });

  return (
    <>
      <Navbar />

      <main id="main">
        <PageHero
          title="Where We Travel"
          description="Every destination we run tours in, from the heart of Rome to the hills of Tuscany."
        />

        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map(({ location, count, cheapest }) => (
              <li key={location}>
                <Link
                  href={`/tours?location=${encodeURIComponent(location)}`}
                  className="rounded-card border-border bg-card shadow-card hover:shadow-elevated focus-visible:outline-ring group flex h-full flex-col overflow-hidden border transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  <div
                    role="img"
                    aria-label={location}
                    className="aspect-[16/9] bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
                  />
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h2 className="font-display group-hover:text-primary inline-flex items-center gap-2 text-lg font-semibold">
                      <MapPin className="text-primary size-4" aria-hidden />
                      {location}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {count === 0
                        ? 'New tours coming soon.'
                        : `${count} ${count === 1 ? 'tour' : 'tours'}${
                            cheapest === undefined ? '' : ` from ${formatPriceFrom(cheapest)}`
                          }`}
                    </p>
                    <span className="text-primary mt-auto inline-flex items-center gap-1.5 pt-3 text-sm">
                      Browse tours
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <Footer />
    </>
  );
}
