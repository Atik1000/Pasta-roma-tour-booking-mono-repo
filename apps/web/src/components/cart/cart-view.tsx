'use client';

import * as React from 'react';

import Link from 'next/link';

import { isApiClientError, type Cart } from '@pasta/api-client';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  PriceBreakdown,
  QuantityStepper,
  Skeleton,
  Thumbnail,
} from '@pasta/ui';
import { formatClockTime, formatDate, formatMoney } from '@pasta/utils';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  Headphones,
  Lock,
  MapPin,
  ShieldCheck,
  Star,
  Ticket,
  Trash2,
} from 'lucide-react';

import { useCurrency } from '@/components/currency-provider';
import { browserApi } from '@/lib/browser-api';
import { syncCartCount } from '@/lib/cart-store';

const ASSURANCES = [
  {
    icon: Ticket,
    title: 'Instant Confirmation',
    body: 'Receive instant confirmation and e-tickets via email.',
  },
  { icon: Headphones, title: '24/7 Customer Support', body: "We're here to help you anytime." },
  { icon: Star, title: 'Best Price Guarantee', body: "Find a better price? We'll match it." },
];

const EMPTY_CART: Cart = {
  items: [],
  totalTickets: 0,
  subtotalMinor: 0,
  bookingFeeMinor: 0,
  totalMinor: 0,
  currency: 'EUR',
};

/**
 * The cart, restyled into the primary gold/cream system per the Phase 1
 * decision — layout and copy from the mock, palette from the rest of the site.
 *
 * Every mutation returns the server's recalculated cart, so totals are never
 * computed twice. A rejection (sold out, over the per-tour cap) re-reads rather
 * than guessing, so the UI cannot drift from the server's view.
 */
export function CartView() {
  const [cart, setCart] = React.useState<Cart | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Passed on every read so an emptied basket reports the currency being
  // browsed rather than falling back to €.
  const { currency } = useCurrency();

  React.useEffect(() => {
    let cancelled = false;

    void browserApi.cart
      .get(currency)
      .then((result) => {
        if (!cancelled) setCart(result);
      })
      .catch(() => {
        if (!cancelled) setCart({ ...EMPTY_CART, currency });
      });

    return () => {
      cancelled = true;
    };
  }, [currency]);

  async function mutate(itemId: string | null, action: () => Promise<Cart>) {
    setPendingId(itemId ?? 'all');
    setError(null);

    try {
      const updated = await action();
      setCart(updated);
      syncCartCount(updated);
    } catch (caught) {
      setError(
        isApiClientError(caught) ? caught.message : 'Something went wrong. Please try again.',
      );
      const loaded = await browserApi.cart.get(currency).catch(() => ({ ...EMPTY_CART, currency }));
      setCart(loaded);
      syncCartCount(loaded);
    } finally {
      setPendingId(null);
    }
  }

  if (!cart) {
    return (
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Your cart is empty"
          description="Browse our tours and add the experiences you'd like to book."
          action={
            <Button asChild>
              <Link href="/tours">Explore tours</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
      {/*
        `min-w-0` is load-bearing on a phone.

        A grid item defaults to `min-width: auto`, which refuses to shrink below
        its content — so the ticket table's `overflow-x-auto` wrapper never got
        to clamp, and instead of the table scrolling inside its own box the
        whole column grew to 435px inside a 390px screen. The entire page then
        scrolled sideways. The `minmax(0,1fr)` above solves this for the wide
        layout; below `xl` there is no column template to carry it.
      */}
      <div className="flex min-w-0 flex-col gap-5">
        {error ? (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card flex items-start gap-2.5 border px-4 py-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        {cart.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Thumbnail src={item.coverImage} alt="" className="h-20 w-32" />

                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold">{item.title}</h2>
                  <ul className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                    <li className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" aria-hidden />
                      {formatDate(item.date)}
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <Clock className="size-4" aria-hidden />
                      {formatClockTime(item.time)}
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden />
                      {item.location}
                    </li>
                  </ul>

                  {item.priceChanged ? (
                    <p className="text-warning-foreground mt-2 text-xs">
                      The price of this tour changed after you added it. You will be charged the
                      current price at checkout.
                    </p>
                  ) : null}
                </div>

                <Button
                  variant="subtle"
                  size="icon"
                  aria-label={`Remove ${item.title} from cart`}
                  disabled={pendingId !== null}
                  onClick={() =>
                    void mutate(item.id, () => browserApi.cart.remove(item.id, currency))
                  }
                >
                  <Trash2 className="text-danger" aria-hidden />
                </Button>
              </div>

              {/* Adults-only: child ticket rows were struck from the design. */}
              <div className="rounded-field border-border mt-4 overflow-x-auto border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-border bg-muted/40 text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Ticket Type
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Unit Price
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-center font-medium">
                        Quantity
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-3">Adult ({item.currency})</td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(item.unitPriceMinor, item.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <QuantityStepper
                            size="sm"
                            label={`${item.title} adult tickets`}
                            value={item.quantity}
                            disabled={pendingId !== null}
                            min={1}
                            // Never offer more than the tour allows or the slot holds.
                            max={Math.min(item.maxTickets, item.quantity + item.remaining)}
                            onChange={(quantity) =>
                              void mutate(item.id, () =>
                                browserApi.cart.updateQuantity(item.id, quantity, currency),
                              )
                            }
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(item.amountMinor, item.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <Link
                href={`/tours/${item.tourSlug}`}
                className="text-primary mt-3 inline-flex items-center gap-1 text-sm hover:underline"
              >
                View tour details
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild leadingIcon={<ArrowLeft aria-hidden />}>
            <Link href="/tours">Continue Shopping</Link>
          </Button>
          <Button
            variant="outline"
            className="border-danger text-danger hover:bg-danger-soft"
            leadingIcon={<Trash2 aria-hidden />}
            disabled={pendingId !== null}
            onClick={() => void mutate(null, () => browserApi.cart.clear(currency))}
          >
            Clear Cart
          </Button>
        </div>
      </div>

      {/*
        The whole column travels with the scroll, not just the summary card
        inside it.

        Only the summary used to be sticky, so once it had scrolled to its
        resting place the assurances card below it carried on up and left a tall
        blank strip beside a long basket — the summary appeared to float in
        empty space. `self-start` is what makes it work in a grid: a grid item
        stretches to the row height by default, and a sticky element cannot move
        inside a box that is already as tall as its container.
      */}
      <aside className="flex flex-col gap-5 xl:sticky xl:top-24 xl:self-start">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Order Summary</h2>
              {/* "Items" is the header badge's word, and that counts lines.
                  This chip counts seats, so it has to say so — the two sat a
                  few centimetres apart reading 3 and "6 items". */}
              <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs">
                {cart.totalTickets} {cart.totalTickets === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            <dl className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total Tours</dt>
                <dd className="font-medium tabular-nums">{cart.items.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total Tickets</dt>
                <dd className="font-medium tabular-nums">{cart.totalTickets}</dd>
              </div>
            </dl>

            <div className="border-border border-t pt-4">
              <PriceBreakdown
                currency={cart.currency}
                lines={[
                  { label: 'Subtotal', amountMinor: cart.subtotalMinor },
                  { label: 'Booking Fee', amountMinor: cart.bookingFeeMinor, muted: true },
                ]}
                totalMinor={cart.totalMinor}
                totalLabel={`Total (${cart.currency})`}
              />
            </div>

            <Button size="lg" block asChild leadingIcon={<Lock aria-hidden />}>
              <Link href="/checkout">Proceed to Checkout</Link>
            </Button>

            <p className="bg-warning-soft text-warning-foreground rounded-field flex gap-2.5 p-3 text-xs">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong className="block">Your booking is secure</strong>
                We use industry-standard encryption to protect your data.
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            {ASSURANCES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <Icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="text-muted-foreground block text-xs">{body}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
