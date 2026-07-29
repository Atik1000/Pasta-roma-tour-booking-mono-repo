import type { Metadata } from 'next';
import Link from 'next/link';

import { Button, Card, CardContent } from '@pasta/ui';
import { CalendarClock, CheckCircle2, Mail } from 'lucide-react';

import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';

export const metadata: Metadata = {
  title: 'Booking received',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Landing page after checkout. The booking is held, not yet paid — payment is
 * the next step once Stripe is configured.
 */
export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const reference = Array.isArray(params.reference) ? params.reference[0] : params.reference;

  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-5 p-10 text-center">
            <span className="bg-success-soft text-success flex size-16 items-center justify-center rounded-full">
              <CheckCircle2 className="size-8" aria-hidden />
            </span>

            <h1 className="font-display text-3xl font-semibold">We&apos;ve got your booking</h1>

            {reference ? (
              <p className="text-muted-foreground">
                Your reference is <strong className="text-foreground font-mono">{reference}</strong>
              </p>
            ) : null}

            <ul className="text-muted-foreground flex flex-col gap-3 text-left text-sm">
              <li className="flex gap-2.5">
                <Mail className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />A confirmation
                is on its way to the email address you gave us.
              </li>
              <li className="flex gap-2.5">
                <CalendarClock className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                Your seats are held for 30 minutes while payment is completed.
              </li>
            </ul>

            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/my-bookings">View my bookings</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/tours">Browse more tours</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </>
  );
}
