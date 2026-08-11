import type { Metadata } from 'next';

import { CartView } from '@/components/cart/cart-view';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';

export const metadata: Metadata = {
  title: 'Your Cart',
  description: 'Review the tours and tickets in your cart before checkout.',
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <>
      {/* Floats over the page hero photograph. */}
      <Navbar overlay />

      <main id="main">
        <PageHero
          title="Your Cart"
          description="Review the tours and tickets in your cart before checkout."
          laurels={false}
        />

        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <CartView />
        </div>
      </main>

      <Footer />
    </>
  );
}
