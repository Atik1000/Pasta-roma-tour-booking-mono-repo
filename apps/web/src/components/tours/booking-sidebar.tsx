'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { isApiClientError } from '@pasta/api-client';
import type { CurrencyCode } from '@pasta/types';
import { Button, Card, CardContent, QuantityStepper } from '@pasta/ui';
import { formatMoney } from '@pasta/utils';
import { CalendarDays, ShieldCheck, Smartphone, Users, Wallet } from 'lucide-react';

import { browserApi } from '@/lib/browser-api';
import { syncCartCount } from '@/lib/cart-store';

const TRUST_ITEMS = [
  {
    icon: Wallet,
    title: 'Free cancellation up to 24 hours',
    body: 'Get a full refund if you cancel in time.',
  },
  {
    icon: CalendarDays,
    title: 'Book any day, no fixed departure',
    body: 'We arrange a time that suits you after booking.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure booking',
    body: 'Your data is protected with 256-bit SSL.',
  },
];

/** Mirrors the two options on the checkout screen. */
const PAYMENT_OPTIONS = ['Cash at the meeting point', 'Pay later'];

export interface BookingSidebarProps {
  slug: string;
  priceMinor: number;
  currency: CurrencyCode;
  maxTickets?: number;
}

/**
 * The sticky booking panel on the tour detail page.
 *
 * This used to be a router: it collected a date and a departure time and handed
 * them to a Check Availability screen, which did the actual adding. Tours run on
 * demand now — there is no calendar to consult and nothing that can be sold out
 * — so the two screens collapsed into this one. Party size is the only choice
 * left to make, and both CTAs act on it directly.
 */
export function BookingSidebar({
  slug,
  priceMinor,
  currency,
  maxTickets = 10,
}: BookingSidebarProps) {
  const router = useRouter();
  const [travellers, setTravellers] = React.useState(2);
  const [pendingAction, setPendingAction] = React.useState<'book' | 'cart' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Both CTAs put the tour in the cart; "Book Now" then goes straight to
   * checkout while "Add to Cart" stays on the cart page, matching the design's
   * two-button layout.
   */
  async function addToCart(intent: 'book' | 'cart') {
    setPendingAction(intent);
    setError(null);

    try {
      syncCartCount(await browserApi.cart.add(slug, travellers, currency));
      router.push(intent === 'book' ? '/checkout' : '/cart');
    } catch (caught) {
      setError(
        isApiClientError(caught) ? caught.message : 'We could not add that. Please try again.',
      );
      setPendingAction(null);
    }
  }

  return (
    <Card className="sticky top-24">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Starts from</p>
          <p className="font-display text-primary text-4xl font-semibold">
            {formatMoney(priceMinor, currency, { showDecimals: false })}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">per person</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Travelers</span>
          <div className="rounded-field border-input bg-card flex h-11 items-center justify-between border px-4">
            <span className="inline-flex items-center gap-2 text-sm">
              <Users className="text-muted-foreground size-4" aria-hidden />
              {travellers} {travellers === 1 ? 'Adult' : 'Adults'}
            </span>
            <QuantityStepper
              size="sm"
              label="Adult tickets"
              value={travellers}
              onChange={setTravellers}
              min={1}
              max={maxTickets}
            />
          </div>
        </div>

        <div className="border-border flex items-center justify-between border-t pt-4">
          <span className="text-sm font-medium">Total</span>
          <span className="font-display text-xl font-semibold">
            {formatMoney(priceMinor * travellers, currency)}
          </span>
        </div>

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            block
            isLoading={pendingAction === 'book'}
            disabled={pendingAction !== null}
            onClick={() => void addToCart('book')}
          >
            Book Now
          </Button>
          <Button
            size="lg"
            block
            variant="outline"
            isLoading={pendingAction === 'cart'}
            disabled={pendingAction !== null}
            onClick={() => void addToCart('cart')}
          >
            Add to Cart
          </Button>
        </div>

        <ul className="border-border flex flex-col gap-4 border-t pt-5">
          {TRUST_ITEMS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <Icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="text-muted-foreground block text-xs">{body}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* This sits one click from checkout, so it names the methods checkout
            actually offers. The card-brand row it replaced promised VISA and
            Amex, which nothing in the booking flow can take. */}
        <div className="border-border flex flex-col gap-1.5 border-t pt-5">
          <span className="text-muted-foreground text-xs">How you can pay</span>
          <ul className="flex flex-wrap items-center gap-1.5">
            {PAYMENT_OPTIONS.map((option) => (
              <li
                key={option}
                className="border-border text-muted-foreground rounded-field border px-2.5 py-1 text-xs"
              >
                {option}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Smartphone className="size-3.5" aria-hidden />
          Mobile ticket — show it on your phone and go
        </p>
      </CardContent>
    </Card>
  );
}
