'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { CurrencyCode } from '@pasta/types';
import type { TourSlot } from '@pasta/api-client';
import {
  Button,
  Card,
  CardContent,
  DateStrip,
  PriceBreakdown,
  QuantityStepper,
  Skeleton,
  TimeSlotGrid,
} from '@pasta/ui';
import { formatClockTime, formatDate, formatDuration } from '@pasta/utils';
import {
  CalendarDays,
  Clock,
  MapPin,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Zap,
} from 'lucide-react';

import { useCurrency } from '@/components/currency-provider';
import { browserApi } from '@/lib/browser-api';
import { syncCartCount } from '@/lib/cart-store';
import { isApiClientError } from '@pasta/api-client';

const BOOKING_FEE_MINOR = 500;

const ASSURANCES = [
  {
    icon: ShieldCheck,
    title: 'Free cancellation up to 24 hours',
    body: 'Get a full refund if you cancel in time.',
  },
  {
    icon: Zap,
    title: 'Instant Confirmation',
    body: 'Receive your booking confirmation instantly.',
  },
  {
    icon: Smartphone,
    title: 'Mobile Ticket',
    body: 'Show your ticket on your phone and go.',
  },
];

export interface AvailabilityPickerProps {
  slug: string;
  title: string;
  location: string;
  durationHours: number;
  priceMinor: number;
  currency: CurrencyCode;
  maxTickets?: number;
  initialDate?: string;
  initialTravellers?: number;
  /** First date of the rail. Defaults to today. */
  firstDate?: string;
}

/**
 * The three-step availability picker.
 *
 * Adults-only throughout: the child ticket row and the "children under 4 enter
 * free" note were struck from the design, and the admin tour form only ever
 * exposes an adult price, so there is a single ticket type here.
 */
export function AvailabilityPicker({
  slug,
  title,
  location,
  durationHours,
  priceMinor,
  currency,
  maxTickets = 10,
  initialDate,
  initialTravellers = 2,
  firstDate,
}: AvailabilityPickerProps) {
  const router = useRouter();
  const [windowStart, setWindowStart] = React.useState(0);
  const [dateOptions, setDateOptions] = React.useState<{ date: string; available: boolean }[]>([]);
  const [date, setDate] = React.useState(initialDate ?? '');
  const [travellers, setTravellers] = React.useState(initialTravellers);
  const [slots, setSlots] = React.useState<TourSlot[]>([]);
  const [slotId, setSlotId] = React.useState<string | undefined>(undefined);
  const [isLoadingSlots, setIsLoadingSlots] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<'book' | 'cart' | null>(null);
  // The basket is priced in whatever currency the visitor is browsing in.
  const { currency: activeCurrency } = useCurrency();
  const [error, setError] = React.useState<string | null>(null);

  // The rail: one request per seven-day window.
  React.useEffect(() => {
    let cancelled = false;
    const from = firstDate ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${from}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() + windowStart);

    void browserApi.tours
      .availability(slug, start.toISOString().slice(0, 10), 7)
      .then((days) => {
        if (cancelled) return;
        setDateOptions(days);
        // Land on the first bookable day when nothing is chosen yet.
        setDate(
          (current) => current || (days.find((day) => day.available)?.date ?? days[0]?.date) || '',
        );
      })
      .catch(() => {
        if (!cancelled) setDateOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, windowStart, firstDate]);

  // The time grid: one request per selected date.
  React.useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setIsLoadingSlots(true);

    void browserApi.tours
      .slots(slug, date)
      .then((result) => {
        if (cancelled) return;
        setSlots(result);
        setSlotId(result.find((slot) => slot.available)?.id);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, date]);

  const selectedSlot = slots.find((slot) => slot.id === slotId);

  /**
   * Both CTAs put the departure in the cart; "Book Now" then goes straight to
   * checkout while "Add to Cart" stays on the cart page, matching the design's
   * two-button layout.
   */
  async function addToCart(intent: 'book' | 'cart') {
    if (!slotId) return;

    setPendingAction(intent);
    setError(null);

    try {
      syncCartCount(await browserApi.cart.add(slug, slotId, travellers, activeCurrency));
      router.push(intent === 'book' ? '/checkout' : '/cart');
    } catch (caught) {
      setError(
        isApiClientError(caught) ? caught.message : 'We could not add that. Please try again.',
      );
      setPendingAction(null);
    }
  }
  const subtotal = priceMinor * travellers;
  const total = subtotal + BOOKING_FEE_MINOR;
  const canBook = Boolean(selectedSlot?.available) && travellers > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-8">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <div
              role="img"
              aria-label={title}
              className="rounded-field h-16 w-24 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
            />
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <span className="text-muted-foreground ml-auto flex flex-wrap items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {location}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                {formatDuration(durationHours)}
              </span>
            </span>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">1. Choose a Date</h2>
          <DateStrip
            dates={dateOptions}
            value={date}
            onChange={setDate}
            canGoBack={windowStart > 0}
            onPrevious={() => setWindowStart((start) => Math.max(0, start - 7))}
            onNext={() => setWindowStart((start) => start + 7)}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">
            2. Choose a Time Slot{date ? ` for ${formatDate(date)}` : ''}
          </h2>
          {isLoadingSlots ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-[4.5rem]" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No departures are scheduled for this date.
            </p>
          ) : (
            <TimeSlotGrid slots={slots} value={slotId} onChange={setSlotId} />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">3. Select Travelers</h2>
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <span>
                <span className="block text-sm font-medium">Adults</span>
                <span className="text-muted-foreground block text-xs">Ages 13+</span>
              </span>
              <QuantityStepper
                label="Adult tickets"
                value={travellers}
                onChange={setTravellers}
                min={1}
                max={maxTickets}
              />
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-xs">
            Maximum {maxTickets} tickets per booking for this tour.
          </p>
        </section>
      </div>

      <aside>
        <Card className="sticky top-24">
          <CardContent className="flex flex-col gap-5 p-6">
            <h2 className="font-display text-lg font-semibold">Your Booking Summary</h2>

            <dl className="flex flex-col gap-2.5 text-sm">
              {[
                { icon: MapPin, label: 'Tour', value: title },
                { icon: MapPin, label: 'Location', value: location },
                { icon: Clock, label: 'Duration', value: formatDuration(durationHours) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground inline-flex items-center gap-2">
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <dl className="border-border flex flex-col gap-2.5 border-t pt-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground inline-flex items-center gap-2">
                  <CalendarDays className="size-4" aria-hidden />
                  Date
                </dt>
                <dd className="font-medium">{date ? formatDate(date) : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground inline-flex items-center gap-2">
                  <Clock className="size-4" aria-hidden />
                  Time
                </dt>
                <dd className="font-medium">
                  {selectedSlot ? formatClockTime(selectedSlot.time) : '—'}
                </dd>
              </div>
            </dl>

            <div className="border-border border-t pt-4">
              <p className="mb-3 text-sm font-medium">Price Breakdown</p>
              <PriceBreakdown
                currency={currency}
                lines={[
                  {
                    label: `Adults (${travellers} × ${(priceMinor / 100).toFixed(0)} ${currency})`,
                    amountMinor: subtotal,
                  },
                  { label: 'Booking fee', amountMinor: BOOKING_FEE_MINOR, muted: true },
                ]}
                totalMinor={total}
                note={`All prices in ${currency}`}
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                size="lg"
                block
                disabled={!canBook || pendingAction !== null}
                isLoading={pendingAction === 'book'}
                onClick={() => void addToCart('book')}
              >
                Book Now
              </Button>
              <Button
                variant="outline"
                size="lg"
                block
                disabled={!canBook || pendingAction !== null}
                isLoading={pendingAction === 'cart'}
                leadingIcon={<ShoppingCart aria-hidden />}
                onClick={() => void addToCart('cart')}
              >
                Add to Cart
              </Button>

              {error ? (
                <p role="alert" className="text-danger text-center text-xs">
                  {error}
                </p>
              ) : null}
              {!canBook ? (
                <p className="text-muted-foreground text-center text-xs" role="status">
                  Choose an available time slot to continue.
                </p>
              ) : null}
            </div>

            <ul className="border-border flex flex-col gap-4 border-t pt-5">
              {ASSURANCES.map(({ icon: Icon, title: heading, body }) => (
                <li key={heading} className="flex gap-3">
                  <Icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{heading}</span>
                    <span className="text-muted-foreground block text-xs">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
