'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Button, Card, CardContent, Skeleton } from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { formatMoney } from '@pasta/utils';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { AlertTriangle, Lock, ShieldCheck } from 'lucide-react';

import { browserApi } from '@/lib/browser-api';

/**
 * Stripe.js is loaded once per publishable key and cached.
 *
 * The key arrives from the API rather than the build, so a deployment can be
 * repointed at a different Stripe account without rebuilding the front-end —
 * and so a missing key degrades to a clear message instead of a blank form.
 */
const stripeCache = new Map<string, Promise<Stripe | null>>();

function stripeFor(key: string): Promise<Stripe | null> {
  let promise = stripeCache.get(key);
  if (!promise) {
    promise = loadStripe(key);
    stripeCache.set(key, promise);
  }
  return promise;
}

/**
 * The card step.
 *
 * Card details go straight from this form to Stripe — they never reach the
 * application's own server, which is what keeps the deployment out of PCI
 * scope. Confirmation is *not* taken from what Stripe tells the browser: the
 * page hands off to the confirmation screen, which polls the API, because only
 * the signed webhook can mark a booking paid.
 */
function CardForm({
  reference,
  amountMinor,
  currency,
}: {
  reference: string;
  amountMinor: number;
  currency: string;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [error, setError] = React.useState<string | null>(null);
  const [isPaying, setIsPaying] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setIsPaying(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/booking-confirmed?reference=${encodeURIComponent(reference)}`,
      },
      // Stay on the page when the card needs no redirect, so the traveller
      // sees the result immediately instead of a round trip.
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message ?? 'That payment could not be completed. Please try again.');
      setIsPaying(false);
      return;
    }

    // Succeeded or still processing — either way the confirmation page is the
    // place that waits for the webhook.
    router.push(`/booking-confirmed?reference=${encodeURIComponent(reference)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <PaymentElement options={{ layout: 'tabs' }} />

      {error ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card flex items-start gap-2.5 border px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        block
        isLoading={isPaying}
        disabled={!stripe}
        leadingIcon={<Lock aria-hidden />}
      >
        Pay {formatMoney(amountMinor, currency as 'EUR' | 'USD')}
      </Button>

      <p className="text-muted-foreground inline-flex items-center justify-center gap-1.5 text-xs">
        <ShieldCheck className="size-4" aria-hidden />
        Payments are handled by Stripe. Your card details never reach our servers.
      </p>
    </form>
  );
}

export function PaymentStep({ reference }: { reference: string }) {
  const [intent, setIntent] = React.useState<{
    clientSecret: string;
    publishableKey: string;
    amountMinor: number;
    currency: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void browserApi.checkout
      .paymentIntent(reference)
      .then((result) => {
        if (cancelled) return;
        if (!result.publishableKey) {
          setError('Card payment is not configured on this environment yet.');
          return;
        }
        setIntent({ ...result, publishableKey: result.publishableKey });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          isApiClientError(caught)
            ? caught.message
            : 'We could not start the payment. Please try again.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [reference]);

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p role="alert" className="text-danger-foreground text-sm">
            {error}
          </p>
          <p className="text-muted-foreground text-sm">
            Your booking <strong>{reference}</strong> is held. Contact us and we will take payment
            another way.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!intent) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <Card>
      <CardContent className="p-6">
        <Elements
          stripe={stripeFor(intent.publishableKey)}
          options={{
            clientSecret: intent.clientSecret,
            // Stripe renders inside an iframe, so it cannot read the site's
            // stylesheet; the brand is passed through explicitly.
            appearance: {
              theme: 'flat',
              variables: {
                colorPrimary: '#b5751f',
                colorText: '#2b2016',
                borderRadius: '10px',
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
              },
            },
          }}
        >
          <CardForm
            reference={reference}
            amountMinor={intent.amountMinor}
            currency={intent.currency}
          />
        </Elements>
      </CardContent>
    </Card>
  );
}
