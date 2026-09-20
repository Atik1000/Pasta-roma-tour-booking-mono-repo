import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import {
  BusinessErrorCode,
  BusinessException,
} from '../../../common/exceptions/business.exception';
import { paypalConfig } from '../../../config/configuration';
import { PaymentLedgerService } from '../payment-ledger.service';
import type { PayPalIntentResult } from '../payment-intent.types';

import { isTrustedCertUrl, readWebhookHeaders } from './paypal-signature';
import {
  fromPayPalAmount,
  PayPalApiError,
  PayPalClient,
  type PayPalCapture,
  type PayPalOrder,
} from './paypal.client';

/**
 * Payment through PayPal Checkout.
 *
 * The shape follows Stripe and Revolut — this server opens an order, the
 * browser approves it with an id that can do nothing else, and the booking is
 * only confirmed against something PayPal itself said. What differs is *where*
 * PayPal says it, and the difference is worth stating plainly because it looks
 * at first glance like the rule the other two exist to enforce being broken.
 *
 * With Revolut the browser is told the payment succeeded and that claim is
 * worth nothing, so only the signed webhook confirms. With PayPal the browser
 * does not make the claim at all: approval merely lets this server call
 * `POST /v2/checkout/orders/{id}/capture`, and it is *that response* — read
 * over an authenticated connection, from PayPal, by this server — that says the
 * money moved. The browser is a trigger, not a witness. PayPal's own guidance
 * is to capture server-side for exactly this reason, and the guide this was
 * built from draws the same line: browser → your backend → PayPal API →
 * verified result → database.
 *
 * So there are two ways in and both are safe:
 *
 *   • the capture call, when the traveller stays on the page; and
 *   • `PAYMENT.CAPTURE.COMPLETED`, when they close the tab mid-flow, or the
 *     capture response is lost on the wire, or PayPal completes a payment that
 *     was pending review.
 *
 * They converge on `ledger.markPaid`, which is conditional on the payment not
 * already being PAID — so whichever arrives second writes nothing and sends no
 * second email.
 *
 * Card details never reach this server: PayPal collects them in its own window.
 */

/** Order states that can still be paid, and so can have their order reused. */
const REUSABLE_STATUSES = new Set(['CREATED', 'APPROVED', 'PAYER_ACTION_REQUIRED']);

/** What a capture's own status has to be before a booking is confirmed. */
const CAPTURE_COMPLETED = 'COMPLETED';

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { currency_code?: string; value?: string };
    custom_id?: string;
    invoice_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
    links?: { rel?: string; href?: string }[];
    purchase_units?: { amount?: { currency_code?: string; value?: string } }[];
  };
}

@Injectable()
export class PayPalPaymentsService {
  private readonly logger = new Logger(PayPalPaymentsService.name);

  constructor(
    private readonly ledger: PaymentLedgerService,
    private readonly paypal: PayPalClient,
    @Inject(paypalConfig.KEY) private readonly config: ConfigType<typeof paypalConfig>,
  ) {}

  private assertConfigured(): void {
    if (!this.paypal.isEnabled) {
      throw new ServiceUnavailableException(
        'Online payment is not configured on this environment yet.',
      );
    }
  }

  // --- starting a payment ----------------------------------------------------

  /**
   * Creates — or re-uses — the PayPal order for a pending booking.
   *
   * Re-use matters: a traveller who reloads the payment page must not strand a
   * second order against the same booking. The amount is always re-read from
   * the booking, so an order whose booking changed is repriced rather than
   * silently underpaid.
   */
  async createIntent(reference: string): Promise<PayPalIntentResult> {
    // Checked before anything touches the database: an environment with no
    // PayPal credentials must answer 503 for this endpoint rather than fail
    // later, half-way through a booking the traveller thinks is being paid.
    this.assertConfigured();

    const booking = await this.ledger.loadPayableBooking(reference);
    const existing = booking.payment;

    let order: PayPalOrder | null = null;

    // Only a PayPal id can be handed back to PayPal. A booking that was part
    // way through Stripe or Revolut before the provider was switched holds an
    // id that means nothing here, so it starts again.
    if (existing?.provider === 'PAYPAL' && existing.providerIntentId) {
      order = await this.reusableOrder(existing.providerIntentId, booking.total, booking.currency);
    }

    order ??= await this.paypal.createOrder({
      amount: booking.total,
      currency: booking.currency,
      description: `Pasta Roma Tour booking ${booking.reference}`,
      merchantOrderReference: booking.reference,
      brandName: 'Pasta Roma Tour',
    });

    await this.ledger.recordPending({
      bookingId: booking.id,
      paymentId: existing?.id,
      provider: 'PAYPAL',
      method: 'PAYPAL',
      providerIntentId: order.id,
      amount: booking.total,
      currency: booking.currency,
    });

    return {
      provider: 'paypal',
      orderId: order.id,
      clientId: this.config.clientId ?? null,
      environment: this.config.mode,
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
  ): Promise<PayPalOrder | null> {
    const order = await this.paypal.retrieveOrder(orderId).catch(() => null);

    if (!order) return null;

    /**
     * An order that already completed is not reusable, and it is not a reason
     * to open a second one either: the money is there and something — a lost
     * capture response, a webhook that has not arrived yet — left the booking
     * behind it unpaid. Applying it is the repair.
     *
     * `loadPayableBooking` has already refused anything actually marked PAID,
     * so reaching here with a COMPLETED order means the two genuinely disagree.
     */
    if (order.status === 'COMPLETED') {
      this.logger.warn(`PayPal order ${orderId} is already COMPLETED; applying it to the booking.`);
      await this.applyCompletedOrder(order);
      throw new BusinessException(
        BusinessErrorCode.PaymentAlreadyCaptured,
        'That booking has already been paid.',
      );
    }

    if (!REUSABLE_STATUSES.has(order.status)) return null;

    const unit = order.purchase_units?.[0];
    const openAmount = fromPayPalAmount(unit?.amount?.value);

    // A currency change is not a reprice — it is a different sale.
    if (unit?.amount?.currency_code !== currency) return null;

    if (openAmount !== amount) {
      /**
       * An approved order cannot be repriced without the buyer approving again,
       * so it is abandoned rather than patched. Charging an amount someone
       * approved a different figure for is the one outcome worth ruling out
       * even at the cost of a second order.
       */
      if (order.status !== 'CREATED') return null;

      try {
        await this.paypal.updateOrderAmount(orderId, amount, currency);
        return await this.paypal.retrieveOrder(orderId);
      } catch (error: unknown) {
        this.logger.warn(
          `Could not reprice PayPal order ${orderId}; opening a new one instead: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      }
    }

    return order;
  }

  // --- capture ---------------------------------------------------------------

  /**
   * Takes the money for an order the buyer has approved.
   *
   * The browser asks for this; it does not assert anything by asking. Three
   * things are checked before a booking is confirmed, and every one of them
   * comes from PayPal or from this application's own records:
   *
   *   1. the order is one this server opened for *this* booking — otherwise a
   *      crafted request could settle a booking with somebody else's order;
   *   2. PayPal reports the capture COMPLETED; and
   *   3. the captured amount and currency are what the booking is owed.
   */
  async capture(reference: string, orderId: string): Promise<{ status: string }> {
    this.assertConfigured();

    const expected = await this.ledger.paymentSnapshotForBooking(reference);

    if (!expected || expected.provider !== 'PAYPAL' || expected.providerIntentId !== orderId) {
      // Deliberately the same message for "no such order" and "not your order":
      // a reference is not a secret, and this endpoint must not become a way to
      // discover which PayPal orders exist.
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That payment could not be matched to this booking. Please start again.',
      );
    }

    if (expected.status === 'PAID') {
      // The webhook got here first. Nothing to do, and saying so beats asking
      // PayPal to capture an order it has already settled.
      return { status: 'PAID' };
    }

    let order: PayPalOrder;

    try {
      order = await this.paypal.captureOrder(orderId);
    } catch (error: unknown) {
      /**
       * A double-clicked button, or a retry after a response was lost. PayPal
       * refuses the second capture, which is right — but the first one
       * succeeded, so the truth is on the order and this reads it back rather
       * than reporting a failure the traveller has already paid for.
       */
      if (error instanceof PayPalApiError && error.hasIssue('ORDER_ALREADY_CAPTURED')) {
        order = await this.paypal.retrieveOrder(orderId);
      } else if (error instanceof PayPalApiError && error.status >= 400 && error.status < 500) {
        // PayPal declined it. The booking stays pending so it can be retried.
        await this.ledger.markFailed(orderId, 'PayPal declined the payment.');
        throw new BusinessException(
          BusinessErrorCode.PaymentFailed,
          'PayPal could not complete that payment. Please try again or use another method.',
        );
      } else {
        throw error;
      }
    }

    const applied = await this.applyCompletedOrder(order);

    if (!applied) {
      /**
       * Captured, but not in a state that confirms a booking — PayPal holds
       * some payments for review, and `PENDING` is a real outcome rather than
       * an error. The booking stays pending and `PAYMENT.CAPTURE.COMPLETED`
       * finishes it when PayPal releases the funds.
       */
      return { status: 'PENDING' };
    }

    return { status: 'PAID' };
  }

  /**
   * Confirms the booking behind an order, if what PayPal returned actually
   * says the money is there for the right figure.
   *
   * Returns whether it applied, so the caller can tell "paid" from "PayPal is
   * still thinking about it" without guessing from the absence of an error.
   */
  private async applyCompletedOrder(order: PayPalOrder): Promise<boolean> {
    const payment = await this.ledger.paymentSnapshot(order.id);

    if (!payment) {
      this.logger.warn(`Captured PayPal order ${order.id} has no matching payment record.`);
      return false;
    }

    const capture = PayPalPaymentsService.completedCapture(order);

    if (!capture) {
      this.logger.debug(`PayPal order ${order.id} is ${order.status} with no completed capture.`);
      return false;
    }

    const capturedMinor = fromPayPalAmount(capture.amount?.value);

    /**
     * The amount check is the point. An order id on its own says nothing about
     * what was paid into it, and a completed capture for the wrong figure is
     * not a paid booking.
     */
    if (capturedMinor !== payment.amount || capture.amount?.currency_code !== payment.currency) {
      this.logger.error(
        `PayPal order ${order.id} captured ${capture.amount?.value ?? '?'} ${
          capture.amount?.currency_code ?? '?'
        }, but this booking is owed ${(payment.amount / 100).toFixed(2)} ${
          payment.currency
        }. Not confirming.`,
      );
      return false;
    }

    await this.ledger.markPaid(order.id, {
      // The capture id, not the order id: a refund is made against the capture,
      // and this is how a refund event finds its way back to this payment.
      transactionId: capture.id,
      note: `Payment captured through PayPal (capture ${capture.id}).`,
    });

    return true;
  }

  /** The first capture on an order that PayPal reports as actually completed. */
  private static completedCapture(order: PayPalOrder): PayPalCapture | null {
    for (const unit of order.purchase_units ?? []) {
      for (const capture of unit.payments?.captures ?? []) {
        if (capture.status === CAPTURE_COMPLETED) return capture;
      }
    }

    return null;
  }

  // --- webhook ---------------------------------------------------------------

  /**
   * Verifies and dispatches a PayPal event.
   *
   * The verification call is the authentication for this endpoint: without it,
   * anyone who learns the URL could mark any booking paid. An unverifiable
   * payload is rejected before it is acted on, and a missing `PAYPAL_WEBHOOK_ID`
   * means no event can be authenticated at all — so the endpoint refuses every
   * one of them rather than quietly trusting the lot.
   */
  async handleWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true }> {
    this.assertConfigured();

    if (!this.paypal.webhookId) {
      throw new ServiceUnavailableException('The payment webhook is not configured.');
    }

    const transmission = readWebhookHeaders(headers);

    if (!transmission) {
      this.logger.warn('Rejected a PayPal webhook with incomplete transmission headers.');
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook is missing its signature headers.',
        400 as never,
      );
    }

    // Cheap, local, and it keeps a request that cannot be genuine from being
    // forwarded to PayPal's fetcher at all.
    if (!isTrustedCertUrl(transmission.certUrl)) {
      this.logger.warn(
        `Rejected a PayPal webhook whose certificate URL is not PayPal's: ${transmission.certUrl}`,
      );
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook signature could not be verified.',
        400 as never,
      );
    }

    // The body has to be valid JSON before it is forwarded verbatim inside the
    // verification document — and an event that will not parse is one this
    // application could not act on even if PayPal vouched for it.
    let event: PayPalWebhookEvent;

    try {
      event = JSON.parse(rawBody.toString('utf8')) as PayPalWebhookEvent;
    } catch {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook payload could not be read.',
        400 as never,
      );
    }

    const verified = await this.paypal.verifyWebhookSignature(rawBody, transmission);

    /**
     * Not reachable is not the same as not genuine.
     *
     * A 503 tells PayPal this event was never judged, so it will be redelivered
     * — which is what has to happen, because the alternative is dropping a real
     * capture on the floor during an outage. A 400 would say the same thing to
     * PayPal's retry logic but the wrong thing to whoever reads the log.
     */
    if (verified === 'UNAVAILABLE') {
      throw new ServiceUnavailableException(
        'That webhook could not be verified right now. Please redeliver it.',
      );
    }

    if (verified !== 'SUCCESS') {
      this.logger.warn('Rejected a PayPal webhook with an invalid signature.');
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook signature could not be verified.',
        400 as never,
      );
    }

    if (!event.event_type) {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'That webhook payload is missing its event type.',
        400 as never,
      );
    }

    switch (event.event_type) {
      /**
       * The one that matters. A capture PayPal reports as completed is money
       * taken — including money taken after a review this server never saw,
       * and money taken in a browser that closed before the capture response
       * came back.
       */
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.confirmFromCaptureEvent(event);
        break;

      /**
       * Approved is not paid: it means the buyer said yes and the capture is
       * still this server's to make. Acted on so a traveller whose browser died
       * between approval and capture is not left holding an approved order
       * nobody ever captures.
       */
      case 'CHECKOUT.ORDER.APPROVED':
        await this.captureApprovedOrder(event);
        break;

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        await this.failFromCaptureEvent(event, 'PayPal declined the payment.');
        break;

      case 'PAYMENT.CAPTURE.REVERSED':
        await this.failFromCaptureEvent(event, 'PayPal reversed the payment.');
        break;

      /**
       * Pending is not failed. The booking is left alone so the completion
       * event that follows can confirm it, rather than being marked failed and
       * then paid a minute later.
       */
      case 'PAYMENT.CAPTURE.PENDING':
        this.logger.log(`PayPal capture ${event.resource?.id ?? '?'} is pending review.`);
        break;

      case 'PAYMENT.CAPTURE.REFUNDED':
        await this.recordRefundFromWebhook(event);
        break;

      default:
        // Everything else is acknowledged and ignored: returning an error would
        // make PayPal retry an event this application has no opinion about.
        this.logger.debug(`Ignoring PayPal event ${event.event_type}`);
    }

    return { received: true };
  }

  /**
   * A capture event names the capture, not the order this application stored.
   *
   * PayPal puts the order id in `supplementary_data.related_ids`; when it is
   * absent the `up` link points at the order instead. Either way the event is
   * a trigger — the order is read back and judged on what PayPal then says,
   * not on the amount the event carried.
   */
  private async confirmFromCaptureEvent(event: PayPalWebhookEvent): Promise<void> {
    const orderId = PayPalPaymentsService.orderIdOf(event);

    if (!orderId) {
      this.logger.warn(
        `PayPal capture ${event.resource?.id ?? '?'} names no order; leaving it unapplied.`,
      );
      return;
    }

    const order = await this.paypal.retrieveOrder(orderId).catch(() => null);

    if (!order) {
      // Left unapplied on purpose. PayPal retries, and confirming a booking on
      // an event this server could not corroborate is exactly the failure the
      // read-back exists to prevent.
      this.logger.error(`Could not read PayPal order ${orderId} back; leaving it unapplied.`);
      return;
    }

    await this.applyCompletedOrder(order);
  }

  /**
   * Captures an order the buyer approved but nobody captured.
   *
   * Normally the browser gets there first and this is a no-op — the order is
   * already COMPLETED by the time the event arrives, and reading it back
   * applies it. The event earns its place on the flow where the browser never
   * came back.
   */
  private async captureApprovedOrder(event: PayPalWebhookEvent): Promise<void> {
    const orderId = event.resource?.id;

    if (!orderId) return;

    const payment = await this.ledger.paymentSnapshot(orderId);

    // Not an order this application opened, or one that is already settled.
    if (!payment || payment.status === 'PAID') return;

    const order = await this.paypal.captureOrder(orderId).catch(async (error: unknown) => {
      if (error instanceof PayPalApiError && error.hasIssue('ORDER_ALREADY_CAPTURED')) {
        return this.paypal.retrieveOrder(orderId);
      }

      this.logger.error(
        `Could not capture approved PayPal order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    });

    if (order) await this.applyCompletedOrder(order);
  }

  private async failFromCaptureEvent(event: PayPalWebhookEvent, reason: string): Promise<void> {
    const orderId = PayPalPaymentsService.orderIdOf(event);

    if (!orderId) return;

    await this.ledger.markFailed(orderId, reason);
  }

  /**
   * A refund names the capture it reverses, not the order.
   *
   * So the capture id written when the payment was taken is what leads back to
   * the payment row — and the refund's own id is what makes applying it twice a
   * no-op, exactly as it is for Revolut.
   */
  private async recordRefundFromWebhook(event: PayPalWebhookEvent): Promise<void> {
    const refundId = event.resource?.id;
    const captureId =
      event.resource?.supplementary_data?.related_ids?.capture_id ??
      PayPalPaymentsService.idFromLink(event.resource?.links, 'up', '/v2/payments/captures/');

    const amountMinor = fromPayPalAmount(event.resource?.amount?.value);

    if (!refundId || !captureId || amountMinor === null) {
      this.logger.warn(`PayPal refund ${refundId ?? '?'} is missing its capture or amount.`);
      return;
    }

    const intentId = await this.ledger.intentIdForTransaction(captureId);

    if (!intentId) {
      this.logger.warn(`PayPal refund ${refundId} names capture ${captureId}, which is not ours.`);
      return;
    }

    await this.ledger.applyRefund(intentId, refundId, amountMinor);
  }

  /** The order behind a capture event, however PayPal chose to name it. */
  private static orderIdOf(event: PayPalWebhookEvent): string | null {
    return (
      event.resource?.supplementary_data?.related_ids?.order_id ??
      PayPalPaymentsService.idFromLink(event.resource?.links, 'up', '/v2/checkout/orders/')
    );
  }

  /** The trailing id of the first link with this rel under this API path. */
  private static idFromLink(
    links: { rel?: string; href?: string }[] | undefined,
    rel: string,
    prefix: string,
  ): string | null {
    for (const link of links ?? []) {
      if (link.rel !== rel || !link.href?.includes(prefix)) continue;

      const id = link.href.split(prefix)[1]?.split(/[/?]/)[0];
      if (id) return id;
    }

    return null;
  }

  // --- refunds ---------------------------------------------------------------

  /**
   * Refunds through PayPal, then lets the resulting `PAYMENT.CAPTURE.REFUNDED`
   * webhook write the local record — so a refund made here and one made in the
   * PayPal dashboard travel exactly the same path and cannot disagree.
   */
  async refund(paymentId: string, amountMinor?: number): Promise<{ message: string }> {
    this.assertConfigured();

    const payment = await this.ledger.loadRefundablePayment(paymentId);
    const amount = this.ledger.refundableAmount(payment, amountMinor);

    if (!payment.transactionId) {
      /**
       * A PayPal refund is made against the capture, and a payment marked PAID
       * with no capture id recorded cannot be refunded automatically. It is
       * a state this code does not produce — `markPaid` writes the capture id —
       * but an older row, or one an operator edited by hand, can be in it.
       */
      throw new BusinessException(
        BusinessErrorCode.RefundNotAllowed,
        'That payment has no PayPal capture recorded, so it must be refunded from the PayPal dashboard.',
      );
    }

    await this.paypal.refundCapture(
      payment.transactionId,
      amount,
      payment.currency,
      payment.reference,
    );

    return { message: `Refund of ${(amount / 100).toFixed(2)} submitted to PayPal.` };
  }
}
