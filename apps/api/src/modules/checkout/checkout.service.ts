import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { CurrencyCode } from '@pasta/types';
import { formatMoney } from '@pasta/utils';

import { adultPriceMinor } from '../../common/dto/currency-query.dto';
import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { BOOKING_FEE_MINOR } from '../cart/cart.service';
import { MailService } from '../mail/mail.service';
import type { CheckoutDto, CheckoutResultDto } from './dto/checkout.dto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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
     * Both offered methods settle away from the platform, so both confirm the
     * booking on creation and never expire.
     *
     * The alternative would be to leave them PENDING with a 30-minute hold, the
     * way a card booking waits on its Stripe webhook. But there is no such
     * signal here — nobody is going to tell the server that a traveller intends
     * to turn up and pay — so a hold would just have `expirePendingBookings`
     * cancel every one of these half an hour after it was made. The booking is
     * genuinely committed; `paymentStatus` stays PENDING until staff record the
     * money against the booking.
     */
    const method = dto.paymentMethod ?? 'CASH';
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
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          currency,
          subtotal,
          bookingFee: BOOKING_FEE_MINOR,
          total,
          // No expiry: neither method is a hold waiting on a payment signal.
          expiresAt: null,
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

    // Both bookings are confirmed; the two mails differ only in where the
    // traveller is told to settle up.
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
      // Neither offered method is collected by Stripe, so there is never an
      // intent to hand back. Restoring CARD to CHECKOUT_PAYMENT_METHODS is what
      // brings this field back into use.
      paymentIntentClientSecret: null,
    };
  }
}
