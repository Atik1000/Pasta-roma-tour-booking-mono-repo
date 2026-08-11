import type { Metadata } from 'next';

import { Suspense } from 'react';

import { Skeleton } from '@pasta/ui';

import { BookingLookup } from '@/components/bookings/booking-lookup';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';

export const metadata: Metadata = {
  title: 'My Bookings',
  description: 'Enter the email address used for your booking to view your booking history.',
  robots: { index: false, follow: true },
};

export default function MyBookingsPage() {
  return (
    <>
      {/* Floats over the page hero photograph. */}
      <Navbar overlay />

      <main id="main">
        <PageHero
          title="My Bookings"
          description="Enter the email address used for your booking to view your booking history."
        />

        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <BookingLookup />
          </Suspense>
        </div>
      </main>

      <Footer />
    </>
  );
}
