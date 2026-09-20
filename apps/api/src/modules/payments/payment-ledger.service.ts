import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { MailService } from '../mail/mail.service';

/**
 * The bookkeeping half of taking a payment — everything that is true whichever
 * gateway the money went through.
 *
 * Stripe, Revolut and PayPal differ only in how the money is taken: which
 * booking may be charged, what a captured payment does to that booking, how a
 * replayed webhook must be ignored, and when the tickets go out are the same
 * rules whichever gateway took it. They live here once so the three providers
 * cannot drift apart on them — a second copy of "mark the booking paid" is a
 * second place for the expiry sweeper to be forgotten.
 */

export type PaymentProviderName = 'STRIPE' | 'REVOLUT' | 'PAYPAL';

/** A booking that may have a card payment opened against it. */
export interface PayableBooking {
  id: string;
  reference: string;
  total: number;
  currency: string;
  customer: { email: string; fullName: string };
  /** The most recent payment row, if this booking already has one. */
  payment: {
    id: string;
    method: string;
    provider: PaymentProviderName;
    providerIntentId: string | null;
  } | null;
}

@Injectable()
export class PaymentLedgerService {
  private readonly logger = new Logger(PaymentLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly mail: MailService,
  ) {}

  // --- starting a payment ----------------------------------------------------

  /**
   * The booking behind a reference, refusing every state that must not be
   * charged. Shared by both providers so neither can quietly permit one.
   */
  async loadPayableBooking(reference: string): Promise<PayableBooking> {
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

    const payment = booking.payments[0] ?? null;

    /**
     * A pay-on-arrival booking has no card leg to open.
     *
     * Without this a crafted request could raise a card payment against a cash
     * booking, and a later webhook would mark it PAID while the money is still
     * expected in person — the takings would be short with nothing in the
     * record to show it.
     */
    if (payment?.method === 'CASH' || payment?.method === 'PAY_LATER') {
      throw new BusinessException(
        BusinessErrorCode.PaymentAlreadyCaptured,
        'That booking is set to be settled in person, so there is nothing to pay online.',
      );
    }

    return {
      id: booking.id,
      reference: booking.reference,
      total: booking.total,
      currency: booking.currency,
      customer: booking.customer,
      payment: payment
        ? {
            id: payment.id,
            method: payment.method,
            provider: payment.provider as PaymentProviderName,
            providerIntentId: payment.providerIntentId,
          }
        : null,
    };
  }

  /**
   * Records the open payment against the booking.
   *
   * An upsert rather than a create: a traveller who reloads the payment page
   * must land back on the row they already have, not accumulate one per reload.
   */
  async recordPending(input: {
    bookingId: string;
    paymentId?: string;
    provider: PaymentProviderName;
    providerIntentId: string;
    amount: number;
    currency: string;
    /**
     * How the traveller is paying, as opposed to who is processing it. PayPal
     * is a wallet, not a card, and the distinction is what an operator reading
     * the booking needs: `provider` says which dashboard holds the money,
     * `method` says what the traveller actually used.
     */
    method?: 'CARD' | 'PAYPAL';
  }): Promise<void> {
    const method = input.method ?? 'CARD';

    await this.prisma.payment.upsert({
      // A uuid that cannot exist, so "no existing row" takes the create branch.
      where: { id: input.paymentId ?? '00000000-0000-4000-8000-000000000000' },
      create: {
        bookingId: input.bookingId,
        method,
        status: 'PENDING',
        provider: input.provider,
        amount: input.amount,
        currency: input.currency as never,
        providerIntentId: input.providerIntentId,
      },
      update: {
        method,
        provider: input.provider,
        providerIntentId: input.providerIntentId,
        amount: input.amount,
        status: 'PENDING',
      },
    });
  }

  // --- the confirmation page -------------------------------------------------

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

  // --- applying a gateway's verdict ------------------------------------------

  /**
   * Confirms the booking behind a captured payment.
   *
   * Written to be replay-safe: both gateways retry webhooks, and the same event
   * may arrive several times. The update is conditional on the payment not
   * already being PAID, so a replay updates nothing and sends no second email.
   */
  async markPaid(
    providerIntentId: string,
    detail: { transactionId?: string | null; note: string },
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId },
      include: { booking: { select: { id: true, reference: true, status: true } } },
    });

    if (!payment) {
      this.logger.warn(`Captured payment ${providerIntentId} has no matching payment record.`);
      return;
    }

    if (payment.status === 'PAID') {
      this.logger.debug(`Payment ${providerIntentId} was already applied; ignoring the replay.`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          transactionId: detail.transactionId ?? null,
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
        data: { bookingId: payment.bookingId, body: detail.note },
      }),
    ]);

    await this.sendConfirmation(payment.booking.reference);
  }

  async markFailed(providerIntentId: string, reason: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId },
      select: { id: true, bookingId: true, status: true },
    });

    // A late failure must never undo a capture that already succeeded.
    if (!payment || payment.status === 'PAID') return;

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

  /**
   * The payment holding a given gateway transaction, by its *own* id rather
   * than the intent's.
   *
   * PayPal reports a refund against the capture, not against the order this
   * application stored — so a refund event arrives naming something the
   * `providerIntentId` index has never seen, and the only way back to the
   * payment is the capture id written when it was taken.
   */
  async intentIdForTransaction(transactionId: string): Promise<string | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionId },
      select: { providerIntentId: true },
    });

    return payment?.providerIntentId ?? null;
  }

  /** What the gateway's webhook needs to check its own claim against. */
  async paymentSnapshot(providerIntentId: string): Promise<{
    amount: number;
    currency: string;
    status: string;
  } | null> {
    return this.prisma.payment.findUnique({
      where: { providerIntentId },
      select: { amount: true, currency: true, status: true },
    });
  }

  /**
   * The same snapshot reached from the booking side, with the gateway id the
   * booking is actually waiting on.
   *
   * PayPal is the one flow where the browser hands this server an id and asks
   * it to act: that id has to be checked against the one opened for *this*
   * booking before a capture is attempted, or a crafted request could settle a
   * booking with somebody else's order.
   */
  async paymentSnapshotForBooking(reference: string): Promise<{
    provider: PaymentProviderName;
    providerIntentId: string | null;
    amount: number;
    currency: string;
    status: string;
  } | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            provider: true,
            providerIntentId: true,
            amount: true,
            currency: true,
            status: true,
          },
        },
      },
    });

    const payment = booking?.payments[0];

    return payment ? { ...payment, provider: payment.provider as PaymentProviderName } : null;
  }

  /**
   * Adds one refund to a payment's running total, once.
   *
   * Stripe reports a cumulative `amount_refunded`, so `recordRefund` can simply
   * store it. Revolut instead raises a separate refund *order* per refund and
   * tells you its amount — a total only exists if this side keeps one, and a
   * replayed webhook would otherwise add the same refund twice. The refund's
   * own id is recorded alongside the total, and a second sighting of it is a
   * no-op.
   */
  async applyRefund(
    providerIntentId: string,
    refundReference: string,
    amountMinor: number,
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId },
      select: { id: true, refundedAmount: true, appliedRefundIds: true },
    });

    if (!payment) return;

    if (payment.appliedRefundIds.includes(refundReference)) {
      this.logger.debug(`Refund ${refundReference} was already applied; ignoring the replay.`);
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { appliedRefundIds: { push: refundReference } },
    });

    await this.recordRefund(providerIntentId, payment.refundedAmount + amountMinor);
  }

  /**
   * Mirrors a refund made in the gateway's own dashboard back into this
   * database. `refundedMinor` is the cumulative total, not one refund's amount.
   */
  async recordRefund(providerIntentId: string, refundedMinor: number): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerIntentId },
      select: { id: true, bookingId: true, amount: true },
    });

    if (!payment) return;

    const fully = refundedMinor >= payment.amount;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: refundedMinor,
          refundedAt: new Date(),
          // A partial refund stays PAID: money was still captured, and
          // `refundedAmount` is what distinguishes the two cases.
          status: fully ? 'REFUNDED' : 'PAID',
        },
      }),
      this.prisma.bookingNote.create({
        data: {
          bookingId: payment.bookingId,
          body: `Refund recorded: ${(refundedMinor / 100).toFixed(2)}${fully ? ' (full)' : ' (partial)'}.`,
        },
      }),
    ]);
  }

  // --- refunds ---------------------------------------------------------------

  /**
   * Which gateway holds a payment, and nothing else.
   *
   * Split out from `loadRefundablePayment` so routing can happen before any
   * business rule is applied: an environment with no credentials must answer
   * "not configured" for a refund, not "that payment cannot be refunded" —
   * the second is a statement about the payment, and it would be a lie.
   */
  async providerFor(paymentId: string): Promise<PaymentProviderName> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { provider: true },
    });

    if (!payment) throw new NotFoundException('That payment could not be found.');

    return payment.provider as PaymentProviderName;
  }

  /** The payment a refund may be made against, refusing every state that cannot. */
  async loadRefundablePayment(paymentId: string): Promise<{
    id: string;
    provider: PaymentProviderName;
    providerIntentId: string;
    /** The gateway's id for the money itself — a PayPal refund is made against it. */
    transactionId: string | null;
    /** The booking this belongs to, so a refund can be traced in the dashboard. */
    reference: string;
    currency: string;
    amount: number;
    refundedAmount: number;
  }> {
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
        'That payment has no gateway reference, so it cannot be refunded automatically.',
      );
    }

    return {
      id: payment.id,
      provider: payment.provider as PaymentProviderName,
      providerIntentId: payment.providerIntentId,
      transactionId: payment.transactionId,
      reference: payment.booking.reference,
      currency: payment.currency,
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
    };
  }

  /** How much of a payment may still be sent back, given what is asked for. */
  refundableAmount(
    payment: { amount: number; refundedAmount: number },
    requestedMinor?: number,
  ): number {
    const remaining = payment.amount - payment.refundedAmount;
    const amount = requestedMinor ?? remaining;

    if (amount <= 0 || amount > remaining) {
      throw new BusinessException(
        BusinessErrorCode.RefundNotAllowed,
        `At most ${(remaining / 100).toFixed(2)} remains refundable on this payment.`,
      );
    }

    return amount;
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
