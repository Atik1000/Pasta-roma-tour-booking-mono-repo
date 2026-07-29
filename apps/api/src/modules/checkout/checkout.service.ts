import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

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
              select: { id: true, title: true, priceAdultEur: true, maxTicketsPerTour: true },
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

    // Reprice from the catalogue: a stale cart price is never charged.
    const priced = cart.items.map((item) => ({
      ...item,
      unitPrice: item.tour.priceAdultEur,
      amount: item.tour.priceAdultEur * item.quantity,
    }));

    const subtotal = priced.reduce((sum, item) => sum + item.amount, 0);
    const total = subtotal + BOOKING_FEE_MINOR;
    const email = dto.email.toLowerCase().trim();
    const reference = await this.nextReference();

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
          status: 'PENDING',
          paymentStatus: 'PENDING',
          currency: 'EUR',
          subtotal,
          bookingFee: BOOKING_FEE_MINOR,
          total,
          // Unpaid bookings release their seats after this instant.
          expiresAt: new Date(Date.now() + 30 * 60_000),
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
              method: 'CARD',
              status: 'PENDING',
              amount: total,
              currency: 'EUR',
            },
          },
        },
        select: { id: true, reference: true, total: true },
      });
    });

    // The cart only empties once the booking exists.
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    await this.mail
      .send({
        to: email,
        subject: `Your Pasta Roma Tour booking ${booking.reference}`,
        html: `
          <p>Hello ${dto.fullName},</p>
          <p>We're holding your booking <strong>${booking.reference}</strong>.</p>
          <p>Complete payment within 30 minutes to confirm it.</p>
        `,
        text: `We're holding booking ${booking.reference}. Complete payment within 30 minutes to confirm it.`,
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
      currency: 'EUR',
      status: 'PENDING',
      // Phase 9 continues with Stripe: this is where the PaymentIntent client
      // secret will be returned once STRIPE_SECRET_KEY is configured.
      paymentIntentClientSecret: null,
    };
  }
}
