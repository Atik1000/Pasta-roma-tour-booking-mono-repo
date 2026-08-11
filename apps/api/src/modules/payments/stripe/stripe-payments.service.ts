import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';

import {
  BusinessErrorCode,
  BusinessException,
} from '../../../common/exceptions/business.exception';
import { stripeConfig } from '../../../config/configuration';
import { PaymentLedgerService } from '../payment-ledger.service';
import type { StripeIntentResult } from '../payment-intent.types';

import { STRIPE_CLIENT } from './stripe.provider';

/** Stripe's smallest unit matches the schema's, so no conversion is needed. */
const ZERO_DECIMAL_CURRENCIES = new Set(['jpy', 'krw']);

/** Intent states that can still be paid, and so can be reused. */
const REUSABLE_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
]);

/**
 * Card payment through Stripe.
 *
 * The shape is the one Stripe recommends and the only one that is safe: the
 * browser confirms a PaymentIntent directly with Stripe, and **the webhook is
 * the only thing that marks a booking paid**. A browser redirect can be lost,
 * replayed, or forged; a signed webhook cannot. The confirmation page therefore
 * reports what the API believes, never what the client claims.
 *
 * Card details never reach this server — Stripe Elements exchanges them for a
 * token in the browser, which keeps the deployment out of PCI scope.
 *
 * Everything this has in common with the Revolut path — which bookings may be
 * charged, what a capture does to a booking, when tickets go out — lives in
 * `PaymentLedgerService`, so the two cannot drift apart on it.
 */
@Injectable()
export class StripePaymentsService {
  private readonly logger = new Logger(StripePaymentsService.name);

  constructor(
    private readonly ledger: PaymentLedgerService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    @Inject(stripeConfig.KEY) private readonly config: ConfigType<typeof stripeConfig>,
  ) {}

  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Card payment is not configured on this environment yet.',
      );
    }
    return this.stripe;
  }

  /** Stripe expects the amount in the currency's smallest unit. */
  private static toStripeAmount(minor: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? Math.round(minor / 100) : minor;
  }

  // --- starting a payment ----------------------------------------------------

  /**
   * Creates — or re-uses — the PaymentIntent for a pending booking.
   *
   * Re-use matters: a traveller who reloads the payment page must not strand a
   * second intent against the same booking, and Stripe would happily create
   * one. The amount is always re-read from the booking, so an intent whose
   * booking changed is updated rather than silently underpaid.
   */
  async createIntent(reference: string): Promise<StripeIntentResult> {
    // Checked before anything touches the database: an environment with no
    // Stripe keys must answer 503 for this endpoint rather than fail later.
    const stripe = this.client();

    const booking = await this.ledger.loadPayableBooking(reference);
    const existing = booking.payment;

    const amount = StripePaymentsService.toStripeAmount(booking.total, booking.currency);
    const currency = booking.currency.toLowerCase();

    let intent: Stripe.PaymentIntent | null = null;

    // Only a Stripe id can be handed back to Stripe. A booking part way through
    // Revolut before the provider was switched holds an order id that means
    // nothing here, so it starts again.
    if (existing?.provider === 'STRIPE' && existing.providerIntentId) {
      intent = await stripe.paymentIntents.retrieve(existing.providerIntentId).catch(() => null);

      // An intent that already succeeded or was cancelled cannot be reused.
      if (intent && !REUSABLE_STATUSES.has(intent.status)) {
        intent = null;
      }

      if (intent && intent.amount !== amount) {
        intent = await stripe.paymentIntents.update(intent.id, { amount });
      }
    }

    intent ??= await stripe.paymentIntents.create(
      {
        amount,
        currency,
        // Cards only: the design shows a card form, and enabling redirect-based
        // methods here would strand travellers on an unhandled return URL.
        payment_method_types: ['card'],
        receipt_email: booking.customer.email,
        description: `Pasta Roma Tour booking ${booking.reference}`,
        metadata: { reference: booking.reference, bookingId: booking.id },
      },
      // Keyed on the booking, so a double-submit cannot create two intents.
      { idempotencyKey: `booking-intent-${booking.id}` },
    );

    await this.ledger.recordPending({
      bookingId: booking.id,
      paymentId: existing?.id,
      provider: 'STRIPE',
      providerIntentId: intent.id,
      amount: booking.total,
      currency: booking.currency,
    });

    if (!intent.client_secret) {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'Stripe did not return a client secret. Please try again.',
      );
    }

    return {
      provider: 'stripe',
      clientSecret: intent.client_secret,
      publishableKey: this.config.publishableKey ?? null,
      amountMinor: booking.total,
      currency: booking.currency,
    };
  }

  // --- webhook ---------------------------------------------------------------

  /**
   * Verifies and dispatches a Stripe event.
   *
   * The signature check is the authentication for this endpoint: without it,
   * anyone who learns the URL could mark any booking paid. An unverifiable
   * payload is rejected before it is parsed.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: true }> {
    const stripe = this.client();

    if (!this.config.webhookSecret) {
      throw new ServiceUnavailableException('The payment webhook is not configured.');
    }

    if (!signature) {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'Missing Stripe signature.',
        400 as never,
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);
    } catch (error) {
      this.logger.warn(
        `Rejected a webhook with an invalid signature: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook signature could not be verified.',
        400 as never,
      );
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        await this.ledger.markPaid(intent.id, {
          transactionId: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
          note: `Payment captured (${intent.id}).`,
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        await this.ledger.markFailed(
          intent.id,
          intent.last_payment_error?.message ?? 'The card was declined. Please try another card.',
        );
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
        // Stripe reports the running total, so it can be stored as-is.
        if (intentId) await this.ledger.recordRefund(intentId, charge.amount_refunded);
        break;
      }

      default:
        // Everything else is acknowledged and ignored: returning an error would
        // make Stripe retry an event this application has no opinion about.
        this.logger.debug(`Ignoring Stripe event ${event.type}`);
    }

    return { received: true };
  }

  // --- refunds ---------------------------------------------------------------

  /**
   * Refunds through Stripe, then lets the resulting `charge.refunded` webhook
   * write the local record — so a refund made here and one made in the Stripe
   * dashboard travel exactly the same path.
   */
  async refund(paymentId: string, amountMinor?: number): Promise<{ message: string }> {
    const stripe = this.client();

    const payment = await this.ledger.loadRefundablePayment(paymentId);
    const amount = this.ledger.refundableAmount(payment, amountMinor);

    await stripe.refunds.create(
      {
        payment_intent: payment.providerIntentId,
        amount: StripePaymentsService.toStripeAmount(amount, payment.currency),
      },
      // A retried request must not refund twice.
      { idempotencyKey: `refund-${payment.id}-${payment.refundedAmount}-${amount}` },
    );

    return { message: `Refund of ${(amount / 100).toFixed(2)} submitted to Stripe.` };
  }
}
