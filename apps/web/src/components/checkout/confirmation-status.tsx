'use client';

import * as React from 'react';

import Link from 'next/link';

import { Button } from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { CalendarClock, CheckCircle2, CreditCard, Loader2, Mail } from 'lucide-react';

import { browserApi } from '@/lib/browser-api';

/** How long to wait for the webhook before offering a way forward. */
const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 15;

type Phase = 'waiting' | 'paid' | 'unpaid' | 'unknown';

/**
 * What actually happened to the booking, according to the API.
 *
 * Stripe tells the *browser* when a card is accepted, but only the signed
 * webhook may mark a booking paid — a browser can be closed, replayed or
 * lied to. So this polls the server rather than trusting the redirect, and
 * says "processing" in the gap between the two, which is a real state and is
 * usually a second or two.
 */
export function ConfirmationStatus({ reference }: { reference: string }) {
  const [phase, setPhase] = React.useState<Phase>('waiting');

  React.useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    async function poll() {
      attempts += 1;

      try {
        const result = await browserApi.checkout.status(reference);
        if (cancelled) return;

        if (result.paymentStatus === 'PAID') {
          setPhase('paid');
          return;
        }

        if (attempts >= POLL_ATTEMPTS) {
          setPhase('unpaid');
          return;
        }
      } catch (caught: unknown) {
        if (cancelled) return;
        // An unknown reference will never become known by waiting.
        if (isApiClientError(caught) && caught.statusCode === 404) {
          setPhase('unknown');
          return;
        }
        if (attempts >= POLL_ATTEMPTS) {
          setPhase('unpaid');
          return;
        }
      }

      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reference]);

  if (phase === 'unknown') {
    return (
      <>
        <h1 className="font-display text-3xl font-semibold">We could not find that booking</h1>
        <p className="text-muted-foreground">
          Check the link you followed, or look your bookings up by email.
        </p>
        <Button asChild>
          <Link href="/my-bookings">Find my bookings</Link>
        </Button>
      </>
    );
  }

  if (phase === 'waiting') {
    return (
      <>
        <span className="bg-accent text-accent-foreground flex size-16 items-center justify-center rounded-full">
          <Loader2 className="size-8 animate-spin" aria-hidden />
        </span>

        <h1 className="font-display text-3xl font-semibold">Confirming your payment…</h1>
        <p className="text-muted-foreground" role="status">
          This usually takes a moment. Reference{' '}
          <strong className="text-foreground font-mono">{reference}</strong>
        </p>
      </>
    );
  }

  if (phase === 'unpaid') {
    return (
      <>
        <span className="bg-warning-soft text-warning-foreground flex size-16 items-center justify-center rounded-full">
          <CreditCard className="size-8" aria-hidden />
        </span>

        <h1 className="font-display text-3xl font-semibold">Your booking is held</h1>
        <p className="text-muted-foreground">
          Reference <strong className="text-foreground font-mono">{reference}</strong>. We have not
          seen a completed payment yet — your seats are held for 30 minutes.
        </p>

        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href={`/checkout/pay?reference=${encodeURIComponent(reference)}`}>
              Complete payment
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/my-bookings">View my bookings</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="bg-success-soft text-success flex size-16 items-center justify-center rounded-full">
        <CheckCircle2 className="size-8" aria-hidden />
      </span>

      <h1 className="font-display text-3xl font-semibold">Your booking is confirmed</h1>
      <p className="text-muted-foreground">
        Your reference is <strong className="text-foreground font-mono">{reference}</strong>
      </p>

      <ul className="text-muted-foreground flex flex-col gap-3 text-left text-sm">
        <li className="flex gap-2.5">
          <Mail className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          Your tickets are attached to the confirmation email we just sent.
        </li>
        <li className="flex gap-2.5">
          <CalendarClock className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          Please arrive 15 minutes before each departure.
        </li>
      </ul>

      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/my-bookings">View my bookings</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/tours">Browse more tours</Link>
        </Button>
      </div>
    </>
  );
}
