import type { Metadata } from 'next';
import Link from 'next/link';

import { Button, Card, CardContent } from '@pasta/ui';

import { ConfirmationStatus } from '@/components/checkout/confirmation-status';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';

export const metadata: Metadata = {
  title: 'Booking confirmation',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Landing page after payment.
 *
 * What it says is decided by the API, not by the redirect that brought the
 * traveller here — the signed webhook is the only thing that confirms a
 * booking, so this page waits for it rather than assuming.
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
            {reference ? (
              <ConfirmationStatus reference={reference} />
            ) : (
              <>
                <h1 className="font-display text-3xl font-semibold">No booking reference</h1>
                <p className="text-muted-foreground">
                  Look up your bookings by email and we will send you a secure link.
                </p>
                <Button asChild>
                  <Link href="/my-bookings">Find my bookings</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </>
  );
}
