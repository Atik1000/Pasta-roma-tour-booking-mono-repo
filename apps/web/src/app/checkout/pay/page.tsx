import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PaymentStep } from '@/components/checkout/payment-step';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const reference = Array.isArray(params.reference) ? params.reference[0] : params.reference;

  // Nothing to pay for without a reference.
  if (!reference) redirect('/cart');

  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="font-display mb-2 text-3xl font-semibold">Payment</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Booking <strong>{reference}</strong> is held for you. Your seats are released if payment
          is not completed within 30 minutes.
        </p>

        <PaymentStep reference={reference} />
      </main>

      <Footer />
    </>
  );
}
