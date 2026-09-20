import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { CurrencyCode } from '@pasta/types';
import { formatMoney } from '@pasta/utils';

import { adultPriceMinor } from '../../common/dto/currency-query.dto';
import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { BOOKING_FEE_MINOR } from '../cart/cart.service';
import { MailService } from '../mail/mail.service';
import { PayPalClient } from '../payments/paypal/paypal.client';
import {
  CHECKOUT_PAYMENT_METHODS,
  type CheckoutDto,
  type CheckoutPaymentMethod,
  type CheckoutResultDto,
} from './dto/checkout.dto';

/**
 * How long a booking waiting on an online payment holds its place.
 *
 * Matches the 30 minutes the payment page tells the traveller, and is what
 * `expirePendingBookings` sweeps against. Methods that settle off-platform get
 * no expiry at all — see the note in `create`.
 */
const ONLINE_PAYMENT_WINDOW_MS = 30 * 60_000;

/** Methods that are collected here rather than settled away from the platform. */
const ONLINE_METHODS = new Set<CheckoutPaymentMethod>(['PAYPAL']);

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly paypal: PayPalClient,
  ) {}

  /**
   * Which methods this deployment is currently offering.
   *
   * An online gateway appears only once it is configured. Offering one that
   * cannot take money is how `CARD` used to produce bookings that dead-ended on
   * a 503 payment screen and were swept away half an hour later — and the
   * browser has no other way to know, because the credentials deliberately
   * never leave the server.
   */
  availableMethods(): CheckoutPaymentMethod[] {
    return CHECKOUT_PAYMENT_METHODS.filter(
      (method) => method !== 'PAYPAL' || this.paypal.isEnabled,
    );
  }

  /** `BK-2024-0521`, unique per year. */
  private async nextReference(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.booking.count({
      where: { reference: { startsWith: `BK-${year}-` } },
    });
    return `BK-${year}-${String(count + 501).padStart(4, '0')}`;
  }

  private static ticketCode(): string {
    return `TK-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  /**
   * Turns a cart into a booking.
   *
   * Nothing is reserved on the way through. Tours run on demand rather than on
   * a schedule, so there is no finite pool of seats for two travellers to race
   * each other for — the conditional `UPDATE tour_slots … WHERE booked + n <=
   * capacity` that used to guard this transaction has nothing left to guard.
   * The only ceiling is `maxTicketsPerTour`, and the cart enforces that as each
   * line is built.
   */
  async create(sessionId: string, dto: CheckoutDto): Promise<CheckoutResultDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { sessionId },
      include: {
        items: {
          include: {
            tour: {
              select: {
                id: true,
                title: true,
                priceAdultEur: true,
                priceAdultUsd: true,
                maxTicketsPerTour: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BusinessException(BusinessErrorCode.CartEmpty, 'Your cart is empty.');
    }

    // The holder names must line up with the tickets being bought.
    const expectedHolders = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    if (dto.ticketHolders.length !== expectedHolders) {
      throw new BusinessException(
        BusinessErrorCode.CartEmpty,
        `Provide a name for each of the ${expectedHolders} tickets.`,
      );
    }

    /**
     * The basket is single-currency by construction — adding an item or
     * switching currency re-prices every line — so the first item names the
     * currency this booking is taken and charged in.
     */
    const currency: CurrencyCode = cart.items[0]?.currency ?? CurrencyCode.EUR;

    // Reprice from the catalogue: a stale cart price is never charged.
    const priced = cart.items.map((item) => {
      const unitPrice = adultPriceMinor(item.tour, currency);
      return { ...item, unitPrice, amount: unitPrice * item.quantity };
    });

    const subtotal = priced.reduce((sum, item) => sum + item.amount, 0);
    const total = subtotal + BOOKING_FEE_MINOR;
    const email = dto.email.toLowerCase().trim();
    const reference = await this.nextReference();

    /**
     * `CASH` and `PAY_LATER` settle away from the platform, so both confirm the
     * booking on creation and never expire.
     *
     * The alternative would be to leave them PENDING with a 30-minute hold, the
     * way an online booking waits on its gateway. But there is no such signal
     * here — nobody is going to tell the server that a traveller intends to
     * turn up and pay — so a hold would just have `expirePendingBookings`
     * cancel every one of these half an hour after it was made. The booking is
     * genuinely committed; `paymentStatus` stays PENDING until staff record the
     * money against the booking.
     *
     * `PAYPAL` is the opposite case and gets the hold: there *is* a signal
     * coming, and a booking nobody paid for should not sit in the panel as
     * confirmed for ever. It stays PENDING until PayPal's capture — or its
     * webhook — says the money moved.
     */
    const method = dto.paymentMethod ?? 'CASH';

    /**
     * Refused here rather than on the payment page.
     *
     * By the time a traveller reaches `/checkout/pay` the booking exists, and
     * an unconfigured gateway would leave it sitting there until the sweeper
     * cancelled it. Nothing is written if the money cannot be collected.
     */
    if (ONLINE_METHODS.has(method) && !this.paypal.isEnabled) {
      throw new BusinessException(
        BusinessErrorCode.PaymentFailed,
        'Online payment is not available at the moment. Please choose another way to pay.',
      );
    }

    const requiresPayment = ONLINE_METHODS.has(method);
    const payAtMeetingPoint = method === 'CASH';

    const booking = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { email },
        create: { email, fullName: dto.fullName.trim() },
        update: { fullName: dto.fullName.trim() },
      });

      let holderIndex = 0;

      return tx.booking.create({
        data: {
          reference,
          customerId: customer.id,
          status: requiresPayment ? 'PENDING' : 'CONFIRMED',
          paymentStatus: 'PENDING',
          currency,
          subtotal,
          bookingFee: BOOKING_FEE_MINOR,
          total,
          // An off-platform method is not a hold waiting on a payment signal,
          // so it gets no expiry; an online one does.
          expiresAt: requiresPayment ? new Date(Date.now() + ONLINE_PAYMENT_WINDOW_MS) : null,
          items: {
            create: priced.map((item) => {
              const holders = dto.ticketHolders.slice(holderIndex, holderIndex + item.quantity);
              holderIndex += item.quantity;

              return {
                tourId: item.tourId,
                tourTitle: item.tour.title,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
                tickets: {
                  create: holders.map((holder) => ({
                    holderFirstName: holder.firstName.trim(),
                    holderLastName: holder.lastName.trim(),
                    code: CheckoutService.ticketCode(),
                  })),
                },
              };
            }),
          },
          payments: {
            create: {
              method,
              status: 'PENDING',
              // The gateway is named up front so the payment page can tell
              // "opened with PayPal" from "opened with whatever came before",
              // and so an operator reading the row knows which dashboard holds
              // it before a capture has even been attempted.
              ...(requiresPayment ? { provider: 'PAYPAL' as const } : {}),
              amount: total,
              currency,
            },
          },
        },
        select: { id: true, reference: true, total: true },
      });
    });

    // The cart only empties once the booking exists.
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    const amountDue = formatMoney(total, currency);

    /**
     * An online booking is not confirmed yet, so it gets no confirmation mail.
     *
     * The real one — with the tickets attached — is sent by `PaymentLedger`
     * when the payment lands. Sending "your booking is confirmed" here would
     * mean every abandoned PayPal checkout left a traveller holding a mail for
     * a booking the sweeper cancelled half an hour later.
     */
    if (requiresPayment) {
      return {
        reference: booking.reference,
        bookingId: booking.id,
        totalMinor: booking.total,
        currency,
        status: 'PENDING',
        paymentMethod: method,
        paymentIntentClientSecret: null,
        requiresPayment: true,
      };
    }

    // Both remaining bookings are confirmed; the two mails differ only in where
    // the traveller is told to settle up.
    const settlement = payAtMeetingPoint
      ? `Please bring <strong>${amountDue}</strong> in cash to the meeting point. Payment is taken there before the tour starts.`
      : `<strong>${amountDue}</strong> is due before the tour starts. We will be in touch to arrange payment.`;

    const settlementText = payAtMeetingPoint
      ? `Please bring ${amountDue} in cash to the meeting point.`
      : `${amountDue} is due before the tour starts; we will be in touch to arrange payment.`;

    await this.mail
      .send({
        to: email,
        subject: `Your Pasta Roma Tour booking ${booking.reference} is confirmed`,
        html: `
          <p>Hello ${dto.fullName},</p>
          <p>Your booking <strong>${booking.reference}</strong> is confirmed. We will be in touch to arrange a time that suits you.</p>
          <p>${settlement}</p>
        `,
        text: `Booking ${booking.reference} is confirmed. ${settlementText}`,
      })
      .catch((error: unknown) => {
        // A mail failure must not undo a booking the traveller already made.
        this.logger.error(
          `Booking ${booking.reference} created but its email failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return {
      reference: booking.reference,
      bookingId: booking.id,
      totalMinor: booking.total,
      currency,
      status: 'CONFIRMED',
      paymentMethod: method,
      // Neither remaining method is collected by Stripe, so there is never an
      // intent to hand back. Restoring CARD to CHECKOUT_PAYMENT_METHODS is what
      // brings this field back into use; PayPal returns above and opens its
      // order on the payment page instead, where the amount is re-read.
      paymentIntentClientSecret: null,
      requiresPayment: false,
    };
  }
}
