'use client';

import * as React from 'react';

import type { Cart } from '@pasta/api-client';
import { create } from 'zustand';

import { browserApi } from '@/lib/browser-api';

interface CartCountState {
  /** Lines in the cart, or `null` before the first load. */
  count: number | null;
  /** Guards the one-time fetch so N mounted navbars make one request. */
  isLoading: boolean;
  sync: (cart: Cart) => void;
  hydrate: () => Promise<void>;
}

/**
 * The cart badge in the header.
 *
 * The cart itself lives on the server behind a cookie, and the pages that
 * change it each hold their own copy. This store exists so the header can show
 * a count without every page having to thread one down: any component that
 * receives a fresh `Cart` calls `sync`, and the badge updates wherever it is.
 *
 * The badge counts *lines*, not seats: `items.length`, so three tickets on one
 * departure reads as 1. It used to report `totalTickets`, which made the badge
 * disagree with the cart page beside it — a basket holding one tour showed a 3.
 */
export const useCartStore = create<CartCountState>((set, get) => ({
  count: null,
  isLoading: false,

  sync: (cart) => set({ count: cart.items.length }),

  hydrate: async () => {
    if (get().count !== null || get().isLoading) return;

    set({ isLoading: true });
    try {
      const cart = await browserApi.cart.get();
      set({ count: cart.items.length });
    } catch {
      // A guest with no cart yet is the common case, not an error.
      set({ count: 0 });
    } finally {
      set({ isLoading: false });
    }
  },
}));

/** Publishes a cart response to the header badge. */
export function syncCartCount(cart: Cart): void {
  useCartStore.getState().sync(cart);
}

/** Empties the badge once checkout has turned the cart into a booking. */
export function clearCartCount(): void {
  useCartStore.setState({ count: 0 });
}

/**
 * The badge's count, fetching it once per session.
 *
 * Returns 0 rather than null before the first response so the header never
 * flashes a stale or placeholder number.
 */
export function useCartCount(): number {
  const count = useCartStore((state) => state.count);
  const hydrate = useCartStore((state) => state.hydrate);

  React.useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return count ?? 0;
}
