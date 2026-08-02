import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';

import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { stripeConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { MailService } from '../mail/mail.service';

import { STRIPE_CLIENT } from './stripe.provider';

/** Stripe's smallest unit matches the schema's, so no conversion is needed. */
const ZERO_DECIMAL_CURRENCIES = new Set(['jpy', 'krw']);

export interface PaymentIntentResult {
  clientSecret: string;
  publishableKey: string | null;
  amountMinor: number;
  currency: string;
}

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
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly mail: MailService,
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
  async createIntent(reference: string): Promise<PaymentIntentResult> {
    // Checked before anything touches the database: an environment with no
    // Stripe keys must answer 503 for this endpoint rather than fail later.
    const stripe = this.client();

    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      include: {
        customer: { select: { email: true, fullName: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    if (booking.status === 'CANCELLED') {
      throw new BusinessException(
        BusinessErrorCode.BookingNotCancellable,
        'That booking has been cancelled.',
      );
    }

    if (booking.paymentStatus === 'PAID') {
      throw new BusinessException(
        BusinessErrorCode.PaymentAlreadyCaptured,
        'That booking has already been paid.',
      );
    }

    if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
      throw new BusinessException(
        BusinessErrorCode.CartExpired,
        'That booking expired and its seats were released. Please book again.',
      );
    }

    const payment = booking.payments[0];

    /**
     * A pay-on-arrival booking has no card leg to open.
     *
     * Without this a crafted request could raise a PaymentIntent against a cash
     * booking, and a later webhook would mark it PAID while the money is still
     * expected in person — the takings would be short with nothing in the
     * record to show it.
     */
    if (payment?.method === 'CASH') {
      throw new BusinessException(
        BusinessErrorCode.PaymentAlreadyCaptured,
        'That booking is set to pay in cash at the meeting point, so there is nothing to pay online.',
      );
    }
    const amount = PaymentsService.toStripeAmount(booking.total, booking.currency);
    const currency = booking.currency.toLowerCase();

    let intent: Stripe.PaymentIntent | null = null;

    if (payment?.providerIntentId) {
      intent = await stripe.paymentIntents.retrieve(payment.providerIntentId).catch(() => null);

      // An intent that already succeeded or was cancelled cannot be reused.
      if (
        intent &&
        ![
          'requires_payment_method',
          'requires_confirmation',
          'requires_action',
          'processing',
        ].includes(intent.status)
      ) {
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

    await this.prisma.payment.upsert({
      where: { id: payment?.id ?? '00000000-0000-4000-8000-000000000000' },
      create: {
        bookingId: booking.id,
        method: 'CARD',
        status: 'PENDING',
        amount: booking.total,
        currency: booking.currency,
        providerIntentId: intent.id,
      },
      update: {
        providerIntentId: intent.id,
        amount: booking.total,
        status: 'PENDING',
      },
    });

    if (!intent.client_secret) {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'Stripe did not return a client secret. Please try again.',
      );
    }

    return {
      clientSecret: intent.client_secret,
      publishableKey: this.config.publishableKey ?? null,
      amountMinor: booking.total,
      currency: booking.currency,
    };
  }

  /**
   * Just enough for the confirmation page to stop spinning.
   *
   * Deliberately thin: a reference is printed on emails and screens, so this
   * must not reveal anything the holder does not already know — no name, no
   * address, no amount. Whether a reference is paid is the one fact the page
   * needs, and the traveller who just paid it already has it.
   */
  async publicStatus(reference: string): Promise<{
    reference: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string | null;
  }> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: {
        reference: true,
        status: true,
        paymentStatus: true,
        // The method the traveller chose a moment ago, so this discloses
        // nothing they do not already know — and the confirmation screen needs
        // it: a cash booking never becomes PAID online, so a page waiting for
        // that would sit there and then wrongly report the booking unpaid.
        payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { method: true } },
      },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    const { payments, ...rest } = booking;
    return { ...rest, paymentMethod: payments[0]?.method ?? null };
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
      case 'payment_intent.succeeded':
        await this.markPaid(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.markFailed(event.data.object);
        break;
      case 'charge.refunded':
        await this.recordRefund(event.data.object);
        break;
      default:
        // Everything else is acknowledged and ignored: returning an error would
        // make Stripe retry an event this application has no opinion about.
        this.logger.debug(`Ignoring Stripe event ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Confirms the booking behind a succeeded intent.
   *
   * Written to be replay-safe: Stripe retries webhooks, and the same event may
   * arrive several times. The update is conditional on the payment not already
   * being PAID, so a replay updates nothing and sends no second email.
   */
  private async markPaid(intent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId: intent.id },
      include: { booking: { select: { id: true, reference: true, status: true } } },
    });

    if (!payment) {
      this.logger.warn(`Received a succeeded intent ${intent.id} with no matching payment record.`);
      return;
    }

    if (payment.status === 'PAID') {
      this.logger.debug(`Intent ${intent.id} was already applied; ignoring the replay.`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          transactionId: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
          failureReason: null,
        },
      }),
      this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          // The seats are bought now, so the expiry sweeper must leave them alone.
          expiresAt: null,
        },
      }),
      this.prisma.bookingNote.create({
        data: { bookingId: payment.bookingId, body: `Payment captured (${intent.id}).` },
      }),
    ]);

    await this.sendConfirmation(payment.booking.reference);
  }

  private async markFailed(intent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId: intent.id },
      select: { id: true, bookingId: true, status: true },
    });

    if (!payment || payment.status === 'PAID') return;

    const reason =
      intent.last_payment_error?.message ?? 'The card was declined. Please try another card.';

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: reason },
      }),
      // The booking stays PENDING on purpose: the traveller can retry, and the
      // expiry sweeper releases the seats if they do not.
      this.prisma.bookingNote.create({
        data: { bookingId: payment.bookingId, body: `Payment failed: ${reason}` },
      }),
    ]);
  }

  /** Mirrors a refund made in the Stripe dashboard back into this database. */
  private async recordRefund(charge: Stripe.Charge): Promise<void> {
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
    if (!intentId) return;

    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId: intentId },
      select: { id: true, bookingId: true, amount: true },
    });

    if (!payment) return;

    const refunded = charge.amount_refunded;
    const fully = refunded >= payment.amount;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: refunded,
          refundedAt: new Date(),
          // A partial refund stays PAID: money was still captured, and
          // `refundedAmount` is what distinguishes the two cases.
          status: fully ? 'REFUNDED' : 'PAID',
        },
      }),
      this.prisma.bookingNote.create({
        data: {
          bookingId: payment.bookingId,
          body: `Refund recorded: ${(refunded / 100).toFixed(2)}${fully ? ' (full)' : ' (partial)'}.`,
        },
      }),
    ]);
  }

  // --- refunds ---------------------------------------------------------------

  /**
   * Refunds through Stripe, then lets the resulting `charge.refunded` webhook
   * write the local record — so a refund made here and one made in the Stripe
   * dashboard travel exactly the same path.
   */
  async refund(paymentId: string, amountMinor?: number): Promise<{ message: string }> {
    const stripe = this.client();

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { reference: true } } },
    });

    if (!payment) throw new NotFoundException('That payment could not be found.');

    if (payment.status !== 'PAID') {
      throw new BusinessException(
        BusinessErrorCode.RefundNotAllowed,
        'Only a captured payment can be refunded.',
      );
    }

    if (!payment.providerIntentId) {
      throw new BusinessException(
        BusinessErrorCode.RefundNotAllowed,
        'That payment has no Stripe reference, so it cannot be refunded automatically.',
      );
    }

    const remaining = payment.amount - payment.refundedAmount;
    const amount = amountMinor ?? remaining;

    if (amount <= 0 || amount > remaining) {
      throw new BusinessException(
        BusinessErrorCode.RefundNotAllowed,
        `At most ${(remaining / 100).toFixed(2)} remains refundable on this payment.`,
      );
    }

    await stripe.refunds.create(
      {
        payment_intent: payment.providerIntentId,
        amount: PaymentsService.toStripeAmount(amount, payment.currency),
      },
      // A retried request must not refund twice.
      { idempotencyKey: `refund-${payment.id}-${payment.refundedAmount}-${amount}` },
    );

    return { message: `Refund of ${(amount / 100).toFixed(2)} submitted to Stripe.` };
  }

  // --- confirmation ----------------------------------------------------------

  /** Best-effort: a mail failure must never undo a payment that succeeded. */
  private async sendConfirmation(reference: string): Promise<void> {
    try {
      const booking = await this.documents.loadBooking(reference);
      const message = this.documents.confirmationEmail(booking);
      const tickets = await this.documents.ticketPdf(reference);

      await this.mail.send({
        to: booking.customer.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: [
          {
            filename: `${booking.reference}-tickets.pdf`,
            content: tickets.toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Booking ${reference} was paid but its confirmation email failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
