import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Breadcrumb,
  Card,
  CardContent,
  SectionHeading,
  Thumbnail,
  Timeline,
  TourCard,
} from '@pasta/ui';
import { formatDuration } from '@pasta/utils';
import { Check, Clock, Info, MapPin, ShieldCheck, Smartphone } from 'lucide-react';

import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { BookingSidebar } from '@/components/tours/booking-sidebar';
import { api, safely } from '@/lib/api';
import { activeCurrency } from '@/lib/currency.server';

type Params = Promise<{ slug: string }>;

/**
 * Rendered per request rather than pre-rendered: the price shown depends on the
 * currency the visitor chose, so there is no one correct copy of this page to
 * build ahead of time.
 */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const tour = await safely(api.tours.bySlug(slug), null, 'tours.bySlug');

  if (!tour) return { title: 'Tour not found' };

  return {
    title: tour.title,
    description: tour.description,
    alternates: { canonical: `/tours/${tour.slug}` },
    openGraph: { title: tour.title, description: tour.description, type: 'website' },
  };
}

export default async function TourDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const currency = await activeCurrency();
  const tour = await safely(api.tours.bySlug(slug, currency), null, 'tours.bySlug');

  if (!tour) notFound();

  const related = await safely(api.tours.related(slug, currency), [], 'tours.related');

  // The cover leads the gallery wherever it sits in the uploaded order, and the
  // three tiles beneath it are the rest — never the cover a second time.
  const cover = tour.gallery.find((image) => image.isCover) ?? tour.gallery[0];
  const rest = tour.gallery.filter((image) => image.url !== cover?.url).slice(0, 3);

  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <Breadcrumb
          className="mb-6"
          items={[
            { label: 'Home', href: '/' },
            { label: `${tour.location.split(',')[0]} Tours`, href: '/tours' },
            { label: tour.title },
          ]}
          renderLink={(item) => (
            <Link href={item.href ?? '/'} className="text-muted-foreground hover:text-primary">
              {item.label}
            </Link>
          )}
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-10">
            {/* Gallery. The cover leads; the next three sit under it. Each tile
                falls back to the brand gradient when there is no photo for it
                yet, which is what the whole gallery used to be. */}
            <div className="flex flex-col gap-3">
              <Thumbnail
                src={cover?.url ?? tour.coverImage}
                alt={`${tour.title} — main photograph`}
                className="rounded-card aspect-[16/9] w-full"
              />
              {rest.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {rest.map((image) => (
                    <Thumbnail
                      key={image.url}
                      src={image.url}
                      alt={image.alt ?? tour.title}
                      className="rounded-card aspect-[16/10] w-full"
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {/* Title. The one-line subtitle under the H1 was struck from the design. */}
            <div className="flex flex-col gap-5">
              <h1 className="font-display text-balance text-3xl font-semibold sm:text-4xl">
                {tour.title}
              </h1>

              {/* "Instant Confirmation" was struck; the other four badges stay. */}
              <ul className="flex flex-wrap gap-3">
                {[
                  { icon: MapPin, label: tour.location },
                  { icon: Clock, label: formatDuration(tour.durationHours) },
                  { icon: Smartphone, label: 'Mobile Ticket' },
                  { icon: ShieldCheck, label: 'Free Cancellation' },
                ].map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="rounded-field border-border bg-card inline-flex items-center gap-2 border px-4 py-2.5 text-sm"
                  >
                    <Icon className="text-primary size-4" aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>

              <p className="text-muted-foreground max-w-3xl">{tour.description}</p>
            </div>

            {/* Highlights & inclusions */}
            <div className="grid gap-8 sm:grid-cols-2">
              <section className="flex flex-col gap-4">
                <SectionHeading
                  title="Highlights"
                  align="start"
                  as="h2"
                  className="[&_h2]:text-xl"
                />
                <ul className="flex flex-col gap-2.5">
                  {tour.highlights.map((item) => (
                    <li key={item} className="text-muted-foreground flex gap-2.5 text-sm">
                      <span
                        className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="flex flex-col gap-4">
                <SectionHeading
                  title="What's Included"
                  align="start"
                  as="h2"
                  className="[&_h2]:text-xl"
                />
                <ul className="flex flex-col gap-2.5">
                  {tour.included.map((item) => (
                    <li key={item} className="text-muted-foreground flex gap-2.5 text-sm">
                      <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="flex flex-col gap-6">
              <SectionHeading title="Tour Plan" align="start" as="h2" className="[&_h2]:text-xl" />
              <Timeline steps={tour.plan} />
            </section>

            <div className="grid gap-8 sm:grid-cols-2">
              <section className="flex flex-col gap-4">
                <SectionHeading
                  title="Meeting Point"
                  align="start"
                  as="h2"
                  className="[&_h2]:text-xl"
                />
                <Card>
                  <CardContent className="flex gap-3 p-5">
                    <MapPin className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                    <span>
                      <span className="block font-medium">{tour.meetingPointTitle}</span>
                      <span className="text-muted-foreground block text-sm">
                        {tour.meetingPointAddress}
                      </span>
                    </span>
                  </CardContent>
                </Card>
              </section>

              <section className="flex flex-col gap-4">
                <SectionHeading
                  title="Good to Know"
                  align="start"
                  as="h2"
                  className="[&_h2]:text-xl"
                />
                <ul className="flex flex-col gap-2.5">
                  {tour.goodToKnow.map((item) => (
                    <li key={item} className="text-muted-foreground flex gap-2.5 text-sm">
                      <Info className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            {/* The Cancellation Policy accordion that sat here was struck from the design. */}
          </div>

          <aside>
            <BookingSidebar
              slug={tour.slug}
              priceMinor={tour.priceMinor}
              currency={tour.currency}
              maxTickets={tour.maxTicketsPerTour}
            />
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-16">
            <h2 className="font-display text-2xl font-semibold">You might also like</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <TourCard
                  key={item.id}
                  title={item.title}
                  location={item.location}
                  durationHours={item.durationHours}
                  priceMinor={item.priceMinor}
                  currency={item.currency}
                  imageUrl={item.coverImage ?? undefined}
                  renderLink={(children) => (
                    <Link
                      href={`/tours/${item.slug}`}
                      className="rounded-card focus-visible:outline-ring block h-full focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      {children}
                    </Link>
                  )}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </>
  );
}
