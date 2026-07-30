import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@pasta/ui';

import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { AvailabilityPicker } from '@/components/tours/availability-picker';
import { api, safely } from '@/lib/api';
import { activeCurrency } from '@/lib/currency.server';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const tour = await safely(api.tours.bySlug(slug), null, 'tours.bySlug');

  return {
    title: tour ? `Check Availability — ${tour.title}` : 'Check Availability',
    // A booking funnel step has no business in search results.
    robots: { index: false, follow: true },
  };
}

export default async function AvailabilityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const currency = await activeCurrency();
  const tour = await safely(api.tours.bySlug(slug, currency), null, 'tours.bySlug');

  if (!tour) notFound();

  const rawDate = Array.isArray(query.date) ? query.date[0] : query.date;
  const rawTravellers = Array.isArray(query.travellers) ? query.travellers[0] : query.travellers;
  const travellers = Number.parseInt(rawTravellers ?? '2', 10);

  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <Breadcrumb
          className="mb-6"
          items={[
            { label: 'Home', href: '/' },
            { label: `${tour.location.split(',')[0]} Tours`, href: '/tours' },
            { label: tour.title, href: `/tours/${tour.slug}` },
            { label: 'Check Availability' },
          ]}
          renderLink={(item) => (
            <Link href={item.href ?? '/'} className="text-muted-foreground hover:text-primary">
              {item.label}
            </Link>
          )}
        />

        <header className="mb-8">
          <h1 className="font-display text-4xl font-semibold">Check Availability</h1>
          <p className="text-muted-foreground mt-2">
            Select your preferred date and time to continue your booking.
          </p>
        </header>

        <AvailabilityPicker
          slug={tour.slug}
          maxTickets={tour.maxTicketsPerTour}
          title={tour.title}
          location={tour.location}
          durationHours={tour.durationHours}
          priceMinor={tour.priceMinor}
          currency={tour.currency}
          initialDate={rawDate}
          initialTravellers={Number.isFinite(travellers) && travellers > 0 ? travellers : 2}
        />
      </main>

      <Footer />
    </>
  );
}
