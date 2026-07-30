import type { Metadata } from 'next';

import { Hero } from '@/components/home/hero';
import { TrendingTours } from '@/components/home/trending-tours';
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

export default async function HomePage() {
  // Trending Tours carries prices, so this page is rendered per request: two
  // visitors on `/` can have chosen different currencies, and a shared cached
  // copy would show one of them the wrong figures.
  const currency = await activeCurrency();

  const { data: tours } = await safely(
    api.tours.list({ sort: 'popular', limit: 8, currency }),
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
      {/* The navbar floats over the hero image on this page only. */}
      <Navbar overlay />

      <main id="main">
        <Hero />
        <TrendingTours tours={tours} />
      </main>

      <Footer />
    </>
  );
}
