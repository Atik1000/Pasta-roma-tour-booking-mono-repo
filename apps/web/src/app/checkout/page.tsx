import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/checkout/checkout-form';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';

export const metadata: Metadata = {
  title: 'Cart Checkout',
  description: 'Review your tours, provide ticket holder details, and complete your booking.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="font-display text-4xl font-semibold">Cart Checkout</h1>
          <p className="text-muted-foreground mt-2 max-w-md">
            Review your tours, provide ticket holder details, and complete your booking.
          </p>
        </header>

        <CheckoutForm />
      </main>

      <Footer />
    </>
  );
}
