import type { Metadata } from 'next';

import { Hero } from '@/components/home/hero';
import { TrendingTours } from '@/components/home/trending-tours';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { api, safely } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Discover Rome Like Never Before',
  description:
    'Book the best tours and tickets to iconic attractions, hidden gems, and unforgettable experiences across Italy.',
  alternates: { canonical: '/' },
};

/** Trending tours change rarely; revalidate rather than hitting the API per visit. */
export const revalidate = 300;

export default async function HomePage() {
  const { data: tours } = await safely(
    api.tours.list({ sort: 'popular', limit: 8 }),
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
