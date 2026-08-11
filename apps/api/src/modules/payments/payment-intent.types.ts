/**
 * What the payment page is handed to start a card payment.
 *
 * A discriminated union rather than a lowest-common-denominator object: the two
 * gateways need genuinely different things in the browser — Stripe mounts
 * Elements against a client secret, Revolut mounts its widget against an order
 * token — and flattening them into one optional-everything shape would only
 * move the branch from the type system into a runtime guess.
 */

export interface StripeIntentResult {
  provider: 'stripe';
  clientSecret: string;
  publishableKey: string | null;
  amountMinor: number;
  currency: string;
}

export interface RevolutIntentResult {
  provider: 'revolut';
  /** The order's *public* id. The private one never leaves this server. */
  token: string;
  publicKey: string | null;
  environment: 'sandbox' | 'prod';
  amountMinor: number;
  currency: string;
}

export type PaymentIntentResult = StripeIntentResult | RevolutIntentResult;
