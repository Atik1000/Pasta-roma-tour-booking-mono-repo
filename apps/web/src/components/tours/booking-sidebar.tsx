'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { CurrencyCode } from '@pasta/types';
import {
  Button,
  Card,
  CardContent,
  QuantityStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pasta/ui';
import { formatDateWithWeekday, formatMoney } from '@pasta/utils';
import { CalendarDays, Clock, ShieldCheck, Smartphone, Users, Wallet } from 'lucide-react';

import { browserApi } from '@/lib/browser-api';

const TRUST_ITEMS = [
  {
    icon: Wallet,
    title: 'Free cancellation up to 24 hours',
    body: 'Get a full refund if you cancel in time.',
  },
  {
    icon: CalendarDays,
    title: 'Reserve now, pay later',
    body: 'Secure your spot with no upfront payment.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure booking',
    body: 'Your data is protected with 256-bit SSL.',
  },
];

const PAYMENT_MARKS = ['VISA', 'MC', 'AMEX', 'PayPal', 'Pay'];

export interface BookingSidebarProps {
  slug: string;
  priceMinor: number;
  currency: CurrencyCode;
  maxTickets?: number;
}

/**
 * The sticky booking panel on the tour detail page.
 *
 * Per the mark-ups this is a *router* to Check Availability, not a checkout:
 * the "Add to Cart" button and the live "Your Selection" price summary were
 * both struck from the design, so the only action here is Check Availability.
 */
export function BookingSidebar({
  slug,
  priceMinor,
  currency,
  maxTickets = 10,
}: BookingSidebarProps) {
  const router = useRouter();
  const [days, setDays] = React.useState<{ date: string; available: boolean }[]>([]);
  const [date, setDate] = React.useState('');
  const [travellers, setTravellers] = React.useState(2);
  const [slots, setSlots] = React.useState<{ id: string; time: string; available: boolean }[]>([]);
  const [slotId, setSlotId] = React.useState<string | undefined>(undefined);

  // Two weeks of availability, so the date select only offers bookable days.
  React.useEffect(() => {
    let cancelled = false;
    const from = new Date().toISOString().slice(0, 10);

    void browserApi.tours
      .availability(slug, from, 14)
      .then((result) => {
        if (cancelled) return;
        setDays(result);
        setDate((current) => current || (result.find((day) => day.available)?.date ?? ''));
      })
      .catch(() => {
        if (!cancelled) setDays([]);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // A slot id is date-scoped, so the chosen time resets with the date.
  React.useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    void browserApi.tours
      .slots(slug, date)
      .then((result) => {
        if (cancelled) return;
        setSlots(result);
        setSlotId(result.find((slot) => slot.available)?.id);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, date]);

  const availableSlots = slots.filter((slot) => slot.available);

  function checkAvailability() {
    const query = new URLSearchParams({ date, travellers: String(travellers) });
    if (slotId) query.set('slot', slotId);
    router.push(`/tours/${slug}/availability?${query.toString()}`);
  }

  return (
    <Card className="sticky top-24">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Starts from</p>
          <p className="font-display text-primary text-4xl font-semibold">
            {formatMoney(priceMinor, currency, { showDecimals: false })}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="booking-date" className="text-sm font-medium">
            Select Date
          </label>
          <Select value={date} onValueChange={setDate}>
            <SelectTrigger id="booking-date" leadingIcon={<CalendarDays aria-hidden />}>
              <SelectValue placeholder="Choose a date" />
            </SelectTrigger>
            <SelectContent>
              {days
                .filter((day) => day.available)
                .map(({ date: entry }) => (
                  <SelectItem key={entry} value={entry}>
                    {formatDateWithWeekday(entry)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="booking-time" className="text-sm font-medium">
            Select Time
          </label>
          <Select value={slotId} onValueChange={setSlotId} disabled={availableSlots.length === 0}>
            <SelectTrigger id="booking-time" leadingIcon={<Clock aria-hidden />}>
              <SelectValue placeholder="Choose a time" />
            </SelectTrigger>
            <SelectContent>
              {availableSlots.map((slot) => (
                <SelectItem key={slot.id} value={slot.id}>
                  {slot.time}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="flex items-center gap-2 text-sm">
          <span
            className={
              availableSlots.length > 0
                ? 'bg-success size-2 rounded-full'
                : 'bg-danger size-2 rounded-full'
            }
            aria-hidden
          />
          <span className={availableSlots.length > 0 ? 'text-success' : 'text-danger'}>
            {availableSlots.length > 0
              ? 'Good availability on selected date'
              : 'Sold out on selected date'}
          </span>
        </p>

        <Button size="lg" block onClick={checkAvailability}>
          Check Availability
        </Button>

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

        <div className="border-border flex items-center gap-2 border-t pt-5">
          <span className="text-muted-foreground text-xs">We accept</span>
          <ul className="flex flex-wrap items-center gap-1.5">
            {PAYMENT_MARKS.map((mark) => (
              <li
                key={mark}
                className="border-border text-muted-foreground flex h-7 w-10 items-center justify-center rounded-[0.3rem] border text-[0.5rem] font-bold"
              >
                {mark}
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
