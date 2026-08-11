import type { Metadata } from 'next';

import { CtaBand } from '@/components/home/cta-band';
import { Destinations, type DestinationTile } from '@/components/home/destinations';
import { Hero } from '@/components/home/hero';
import { Reviews } from '@/components/home/reviews';
import { TrendingTours } from '@/components/home/trending-tours';
import { WhyUs } from '@/components/home/why-us';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { api, safely } from '@/lib/api';
import { activeCurrency } from '@/lib/currency.server';

export const metadata: Metadata = {
  title: 'Discover Rome Like Never Before',
  description:
    'Book the best tours and tickets to iconic attractions, hidden gems, and unforgettable experiences across Italy.',
  alternates: { canonical: '/' },
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 1, limit: 0, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
};

/** The first destination tile is double-width, so six fills the grid evenly. */
const DESTINATION_COUNT = 6;

export default async function HomePage() {
  // Trending Tours carries prices, so this page is rendered per request: two
  // visitors on `/` can have chosen different currencies, and a shared cached
  // copy would show one of them the wrong figures.
  const currency = await activeCurrency();

  // One catalogue read serves both the carousel and the destination tiles.
  // Asking the API twice for the same tours would double this page's latency
  // to save a filter in memory.
  const [trending, catalogue, locations] = await Promise.all([
    safely(api.tours.list({ sort: 'popular', limit: 8, currency }), EMPTY_PAGE, 'tours.list'),
    safely(api.tours.list({ limit: 100, currency }), EMPTY_PAGE, 'tours.catalogue'),
    safely(api.locations.list(), [], 'locations.list'),
  ]);

  /**
   * Busiest destinations first, each carrying a photo and a "from" price
   * borrowed from its own tours. A destination with nothing to sell is dropped
   * rather than shown empty — a tile leading to "no tours match" is a dead end.
   */
  const destinations: DestinationTile[] = locations
    .filter((entry) => entry.tourCount > 0)
    .sort((a, b) => b.tourCount - a.tourCount)
    .slice(0, DESTINATION_COUNT)
    .map((entry) => {
      const here = catalogue.data.filter((tour) => tour.location === entry.name);
      const prices = here.map((tour) => tour.priceMinor);

      return {
        name: entry.name,
        tourCount: entry.tourCount,
        cheapestMinor: prices.length > 0 ? Math.min(...prices) : undefined,
        imageUrl: here.find((tour) => tour.coverImage)?.coverImage ?? undefined,
      };
    });

  return (
    <>
      {/* The navbar floats over the hero image on this page only. */}
      <Navbar overlay />

      <main id="main">
        <Hero />
        <TrendingTours tours={trending.data} />
        <Destinations destinations={destinations} currency={currency} />
        {/* "Browse by Category" sat here. It was struck: the categories it
            offered duplicated the destination tiles above and the filters on
            the catalogue page, three rows apart. */}
        <WhyUs />
        {/* Sample testimonials until real ones are collected — see reviews.tsx. */}
        <Reviews />
        <CtaBand />
      </main>

      <Footer />
    </>
  );
}
