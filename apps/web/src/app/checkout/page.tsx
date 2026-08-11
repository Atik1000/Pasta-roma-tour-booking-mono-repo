import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/checkout/checkout-form';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';

export const metadata: Metadata = {
  title: 'Cart Checkout',
  description: 'Review your tours, provide ticket holder details, and complete your booking.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <>
      {/* Floats over the page hero photograph. */}
      <Navbar overlay />

      <main id="main">
        <PageHero
          title="Cart Checkout"
          description="Review your tours, provide ticket holder details, and complete your booking."
          laurels={false}
        />

        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <CheckoutForm />
        </div>
      </main>

      <Footer />
    </>
  );
}
