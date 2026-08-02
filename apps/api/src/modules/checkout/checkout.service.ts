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
   * Seats are claimed with a conditional UPDATE inside the transaction:
   *
   *   UPDATE tour_slots SET booked = booked + n WHERE id = ? AND booked + n <= capacity
   *
   * If the statement affects zero rows another traveller took the last seats
   * between page load and submit, and the whole transaction rolls back. Prisma
   * cannot express a column-to-column comparison, so this is raw SQL by
   * necessity — and it is what makes overselling impossible under concurrency.
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
            slot: { select: { id: true, date: true, time: true } },
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
     * Pay-on-arrival bookings are confirmed on creation and never expire.
     *
     * A card booking is only a 30-minute hold: it stays PENDING until the
     * Stripe webhook confirms it, and `expirePendingBookings` releases the
     * seats if that never happens. Cash has no such signal — nobody is going to
     * tell the server the traveller intends to turn up — so leaving it PENDING
     * would have the sweeper cancel every cash booking half an hour after it
     * was made. The seats are genuinely committed here; `paymentStatus` stays
     * PENDING until staff record the cash on the day.
     */
    const payByCash = dto.paymentMethod === 'CASH';
    const bookingStatus = payByCash ? 'CONFIRMED' : 'PENDING';
    const expiresAt = payByCash ? null : new Date(Date.now() + 30 * 60_000);

    const booking = await this.prisma.$transaction(async (tx) => {
      for (const item of priced) {
        const claimed = await tx.$executeRaw`
          UPDATE "tour_slots"
          SET "booked" = "booked" + ${item.quantity}, "updatedAt" = NOW()
          WHERE "id" = ${item.slotId}::uuid
            AND "booked" + ${item.quantity} <= "capacity"
        `;

        if (claimed === 0) {
          throw new BusinessException(
            BusinessErrorCode.SlotSoldOut,
            `${item.tour.title} sold out while you were checking out. Please choose another time.`,
          );
        }
      }

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
          status: bookingStatus,
          paymentStatus: 'PENDING',
          currency,
          subtotal,
          bookingFee: BOOKING_FEE_MINOR,
          total,
          // Unpaid card bookings release their seats after this instant; a cash
          // booking has no expiry, so the sweeper leaves it alone.
          expiresAt,
          items: {
            create: priced.map((item) => {
              const holders = dto.ticketHolders.slice(holderIndex, holderIndex + item.quantity);
              holderIndex += item.quantity;

              return {
                tourId: item.tourId,
                slotId: item.slotId,
                tourTitle: item.tour.title,
                date: item.slot.date,
                time: item.slot.time,
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
              method: payByCash ? 'CASH' : 'CARD',
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

    await this.mail
      .send({
        to: email,
        subject: payByCash
          ? `Your Pasta Roma Tour booking ${booking.reference} is confirmed`
          : `Your Pasta Roma Tour booking ${booking.reference}`,
        html: payByCash
          ? `
          <p>Hello ${dto.fullName},</p>
          <p>Your booking <strong>${booking.reference}</strong> is confirmed and your seats are reserved.</p>
          <p>Please bring <strong>${amountDue}</strong> in cash to the meeting point. Payment is taken there before the tour starts.</p>
        `
          : `
          <p>Hello ${dto.fullName},</p>
          <p>We're holding your booking <strong>${booking.reference}</strong>.</p>
          <p>Complete payment within 30 minutes to confirm it.</p>
        `,
        text: payByCash
          ? `Booking ${booking.reference} is confirmed. Please bring ${amountDue} in cash to the meeting point.`
          : `We're holding booking ${booking.reference}. Complete payment within 30 minutes to confirm it.`,
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
      status: bookingStatus,
      paymentMethod: payByCash ? 'CASH' : 'CARD',
      // Phase 9 continues with Stripe: this is where the PaymentIntent client
      // secret will be returned once STRIPE_SECRET_KEY is configured. A cash
      // booking never has one — there is nothing for Stripe to collect.
      paymentIntentClientSecret: null,
    };
  }
}
