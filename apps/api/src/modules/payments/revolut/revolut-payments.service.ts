import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import {
  BusinessErrorCode,
  BusinessException,
} from '../../../common/exceptions/business.exception';
import { revolutConfig } from '../../../config/configuration';
import { PaymentLedgerService } from '../payment-ledger.service';
import type { RevolutIntentResult } from '../payment-intent.types';

import { RevolutClient, type RevolutOrder } from './revolut.client';
import { isTimestampFresh, verifySignature } from './revolut-signature';

/**
 * Card payment through the Revolut Merchant API.
 *
 * The shape mirrors the Stripe path deliberately, because it is the only safe
 * one: this server opens an order, the browser pays it with a token that can do
 * nothing else, and **the webhook is the only thing that marks a booking paid**.
 * A browser callback can be lost, replayed or forged; a signed webhook cannot.
 *
 * And a webhook is a trigger, not proof. Revolut's own guidance is to read the
 * order back over the API before fulfilling, which is what `confirmFromWebhook`
 * does — the event says only "look at this order", never "take the money as
 * received".
 *
 * Card details never reach this server: the widget exchanges them with Revolut
 * in the browser, which keeps the deployment out of PCI scope.
 */

/** States that can still be paid, and so can have their order reused. */
const REUSABLE_STATES = new Set(['pending', 'processing']);

interface RevolutWebhookPayload {
  event?: string;
  order_id?: string;
  merchant_order_ext_ref?: string;
}

@Injectable()
export class RevolutPaymentsService {
  private readonly logger = new Logger(RevolutPaymentsService.name);

  constructor(
    private readonly ledger: PaymentLedgerService,
    private readonly revolut: RevolutClient,
    @Inject(revolutConfig.KEY) private readonly config: ConfigType<typeof revolutConfig>,
  ) {}

  private assertConfigured(): void {
    if (!this.revolut.isEnabled) {
      throw new ServiceUnavailableException(
        'Card payment is not configured on this environment yet.',
      );
    }
  }

  // --- starting a payment ----------------------------------------------------

  /**
   * Creates — or re-uses — the Revolut order for a pending booking.
   *
   * Re-use matters: a traveller who reloads the payment page must not strand a
   * second order against the same booking. The amount is always re-read from
   * the booking, so an order whose booking changed is repriced rather than
   * silently underpaid.
   */
  async createIntent(reference: string): Promise<RevolutIntentResult> {
    // Checked before anything touches the database: an environment with no
    // Revolut key must answer 503 for this endpoint rather than fail later.
    this.assertConfigured();

    const booking = await this.ledger.loadPayableBooking(reference);
    const existing = booking.payment;

    let order: RevolutOrder | null = null;

    // Only a Revolut id can be handed back to Revolut. A booking that was part
    // way through Stripe before the provider was switched holds an intent id
    // that means nothing here, so it starts again.
    if (existing?.provider === 'REVOLUT' && existing.providerIntentId) {
      order = await this.reusableOrder(existing.providerIntentId, booking.total, booking.currency);
    }

    order ??= await this.revolut.createOrder({
      amount: booking.total,
      currency: booking.currency,
      description: `Pasta Roma Tour booking ${booking.reference}`,
      merchantOrderReference: booking.reference,
      customer: { email: booking.customer.email, full_name: booking.customer.fullName },
    });

    if (!order.token) {
      // Without the public token there is nothing for the widget to mount, and
      // the private id must never be sent to a browser.
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'Revolut did not return a checkout token. Please try again.',
      );
    }

    await this.ledger.recordPending({
      bookingId: booking.id,
      paymentId: existing?.id,
      provider: 'REVOLUT',
      providerIntentId: order.id,
      amount: booking.total,
      currency: booking.currency,
    });

    return {
      provider: 'revolut',
      token: order.token,
      publicKey: this.config.publicKey ?? null,
      environment: this.config.environment,
      amountMinor: booking.total,
      currency: booking.currency,
    };
  }

  /**
   * The stored order, if it can still be paid — repriced first if the booking
   * has moved on. `null` means "open a fresh one".
   */
  private async reusableOrder(
    orderId: string,
    amount: number,
    currency: string,
  ): Promise<RevolutOrder | null> {
    const order = await this.revolut.retrieveOrder(orderId).catch(() => null);

    if (!order || !REUSABLE_STATES.has(order.state)) return null;

    // A currency change is not a reprice — it is a different sale.
    if (order.currency !== currency) return null;

    if (order.amount !== amount) {
      return this.revolut.updateOrder(orderId, amount, currency).catch((error: unknown) => {
        this.logger.warn(
          `Could not reprice Revolut order ${orderId}; opening a new one instead: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });
    }

    return order;
  }

  // --- webhook ---------------------------------------------------------------

  /**
   * Verifies and dispatches a Revolut event.
   *
   * The signature check is the authentication for this endpoint: without it,
   * anyone who learns the URL could mark any booking paid. An unverifiable
   * payload is rejected before it is parsed.
   */
  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): Promise<{ received: true }> {
    this.assertConfigured();

    if (this.config.webhookSecrets.length === 0) {
      throw new ServiceUnavailableException('The payment webhook is not configured.');
    }

    // Freshness first: it is the cheaper check, and a stale-but-valid payload
    // is exactly what a replay looks like.
    if (!isTimestampFresh(timestamp)) {
      this.logger.warn('Rejected a Revolut webhook whose timestamp is outside the tolerance zone.');
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook timestamp is outside the accepted window.',
        400 as never,
      );
    }

    if (
      !verifySignature({
        header: signature,
        timestamp,
        rawBody,
        secrets: this.config.webhookSecrets,
      })
    ) {
      this.logger.warn('Rejected a Revolut webhook with an invalid signature.');
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook signature could not be verified.',
        400 as never,
      );
    }

    let payload: RevolutWebhookPayload;

    try {
      payload = JSON.parse(rawBody.toString('utf8')) as RevolutWebhookPayload;
    } catch {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook payload could not be read.',
        400 as never,
      );
    }

    const orderId = payload.order_id;

    if (!payload.event || !orderId) {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook payload is missing its event or order id.',
        400 as never,
      );
    }

    switch (payload.event) {
      // Both are treated the same way: neither is taken at its word, and both
      // lead to reading the order back before anything is written.
      case 'ORDER_COMPLETED':
      case 'ORDER_AUTHORISED':
        await this.confirmFromWebhook(orderId);
        break;

      case 'ORDER_PAYMENT_FAILED':
      case 'ORDER_PAYMENT_DECLINED':
        await this.ledger.markFailed(orderId, 'The card was declined. Please try another card.');
        break;

      case 'ORDER_CANCELLED':
        await this.ledger.markFailed(orderId, 'The payment was cancelled.');
        break;

      case 'REFUND_COMPLETED':
        await this.recordRefundFromWebhook(orderId);
        break;

      default:
        // Everything else is acknowledged and ignored: returning an error would
        // make Revolut retry an event this application has no opinion about.
        this.logger.debug(`Ignoring Revolut event ${payload.event}`);
    }

    return { received: true };
  }

  /**
   * Reads the order back and confirms the booking only if Revolut itself says
   * the money is there, for the amount this application is owed.
   *
   * The amount check is the point: an event carries an order id and nothing
   * else worth trusting, and a completed order for the wrong figure is not a
   * paid booking.
   */
  private async confirmFromWebhook(orderId: string): Promise<void> {
    const [order, payment] = await Promise.all([
      this.revolut.retrieveOrder(orderId).catch(() => null),
      this.ledger.paymentSnapshot(orderId),
    ]);

    if (!payment) {
      this.logger.warn(`Received Revolut order ${orderId} with no matching payment record.`);
      return;
    }

    if (!order) {
      // Left unapplied on purpose. Revolut retries, and confirming a booking on
      // an event this server could not corroborate is exactly the failure the
      // read-back exists to prevent.
      this.logger.error(`Could not read Revolut order ${orderId} back; leaving it unapplied.`);
      return;
    }

    if (order.state !== 'completed') {
      this.logger.debug(`Revolut order ${orderId} is ${order.state}, not completed yet.`);
      return;
    }

    if (order.amount !== payment.amount || order.currency !== payment.currency) {
      this.logger.error(
        `Revolut order ${orderId} settled ${order.amount} ${order.currency}, but this booking is owed ${payment.amount} ${payment.currency}. Not confirming.`,
      );
      return;
    }

    await this.ledger.markPaid(orderId, {
      transactionId: order.id,
      note: `Payment captured through Revolut (${order.id}).`,
    });
  }

  /**
   * A refund is its own order, linked back to the one it reverses.
   *
   * The event names the *refund*, so the original has to be read off it — and
   * the refund's own id is what makes applying it twice a no-op.
   */
  private async recordRefundFromWebhook(refundOrderId: string): Promise<void> {
    const refund = await this.revolut.retrieveOrder(refundOrderId).catch(() => null);

    if (!refund?.related_order_id) {
      this.logger.warn(`Revolut refund ${refundOrderId} has no related order; ignoring.`);
      return;
    }

    await this.ledger.applyRefund(refund.related_order_id, refund.id, refund.amount);
  }

  // --- refunds ---------------------------------------------------------------

  /**
   * Refunds through Revolut, then lets the resulting `REFUND_COMPLETED` webhook
   * write the local record — so a refund made here and one made in the Revolut
   * dashboard travel exactly the same path.
   */
  async refund(paymentId: string, amountMinor?: number): Promise<{ message: string }> {
    this.assertConfigured();

    const payment = await this.ledger.loadRefundablePayment(paymentId);
    const amount = this.ledger.refundableAmount(payment, amountMinor);

    await this.revolut.refundOrder(payment.providerIntentId, amount, payment.currency);

    return { message: `Refund of ${(amount / 100).toFixed(2)} submitted to Revolut.` };
  }
}
