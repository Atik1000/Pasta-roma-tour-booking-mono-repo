import type { Metadata } from 'next';

import { CartView } from '@/components/cart/cart-view';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';

export const metadata: Metadata = {
  title: 'Your Cart',
  description: 'Review the tours and tickets in your cart before checkout.',
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="font-display text-4xl font-semibold">Your Cart</h1>
          <p className="text-muted-foreground mt-2">
            Review the tours and tickets in your cart before checkout.
          </p>
        </header>

        <CartView />
      </main>

      <Footer />
    </>
  );
}
