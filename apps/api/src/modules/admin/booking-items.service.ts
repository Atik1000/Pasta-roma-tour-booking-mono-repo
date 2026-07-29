import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { BOOKING_FEE_MINOR } from '../cart/cart.service';
import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

import type { AddBookingItemDto, UpdateBookingItemDto } from './dto/admin-write.dto';

type Tx = Prisma.TransactionClient;

/**
 * Editing what a booking contains, after it exists.
 *
 * Support staff add a tour a caller forgot, correct a quantity, or drop a
 * cancelled leg. Every one of those changes seats and money, so the same rules
 * checkout obeys apply here:
 *
 *   • seats are claimed with a conditional UPDATE, so two operators editing at
 *     once cannot push a departure past capacity
 *   • released seats are floored at zero, so a bad decrement can never make a
 *     departure look emptier than it is
 *   • the booking total is recomputed from its items rather than adjusted by a
 *     delta, so rounding can never drift
 *
 * The payment record is deliberately *not* rewritten. It records what was
 * actually captured; if an edit changes what is owed, the difference must stay
 * visible rather than being papered over. Each change leaves a note on the
 * booking so the history explains itself.
 */
@Injectable()
export class BookingItemsService {
  constructor(private readonly prisma: PrismaService) {}

  private static ticketCode(): string {
    return `TK-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  /** Loads a booking that is open to editing. */
  private async editableBooking(reference: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true, reference: true, status: true, currency: true },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    if (booking.status === 'CANCELLED') {
      throw new BusinessException(
        BusinessErrorCode.BookingNotCancellable,
        'That booking is cancelled. Reinstate it before changing what it contains.',
      );
    }

    return booking;
  }

  /**
   * Claims `quantity` seats on a slot, or refuses.
   *
   * Prisma cannot express a column-to-column comparison, so this is raw SQL:
   * the WHERE clause is the check, and zero affected rows means the seats were
   * taken between reading availability and writing it.
   */
  private async claimSeats(tx: Tx, slotId: string, quantity: number, tourTitle: string) {
    const claimed = await tx.$executeRaw`
      UPDATE "tour_slots"
      SET "booked" = "booked" + ${quantity}, "updatedAt" = NOW()
      WHERE "id" = ${slotId}::uuid
        AND "booked" + ${quantity} <= "capacity"
    `;

    if (claimed === 0) {
      throw new BusinessException(
        BusinessErrorCode.SlotSoldOut,
        `${tourTitle} does not have ${quantity} more seat(s) on that departure.`,
      );
    }
  }

  /** Returns seats to a slot. GREATEST guards against ever going negative. */
  private async releaseSeats(tx: Tx, slotId: string, quantity: number) {
    await tx.$executeRaw`
      UPDATE "tour_slots"
      SET "booked" = GREATEST("booked" - ${quantity}, 0), "updatedAt" = NOW()
      WHERE "id" = ${slotId}::uuid
    `;
  }

  /**
   * Recomputes subtotal and total from the items that now exist.
   *
   * The booking fee is charged once per booking, and a booking with nothing in
   * it owes nothing at all — otherwise removing the last tour would leave a
   * standing fee for no tours.
   */
  private async retotal(tx: Tx, bookingId: string) {
    const items = await tx.bookingItem.findMany({
      where: { bookingId },
      select: { amount: true },
    });

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const bookingFee = items.length > 0 ? BOOKING_FEE_MINOR : 0;

    await tx.booking.update({
      where: { id: bookingId },
      data: { subtotal, bookingFee, total: subtotal + bookingFee },
    });

    return { subtotal, bookingFee, total: subtotal + bookingFee };
  }

  private async note(tx: Tx, bookingId: string, body: string, userId?: string) {
    await tx.bookingNote.create({ data: { bookingId, body, authorId: userId ?? null } });
  }

  // --- add a tour ------------------------------------------------------------

  async addItem(reference: string, dto: AddBookingItemDto, userId?: string) {
    const booking = await this.editableBooking(reference);

    const slot = await this.prisma.tourSlot.findUnique({
      where: { id: dto.slotId },
      include: {
        tour: {
          select: {
            id: true,
            title: true,
            priceAdultEur: true,
            priceAdultUsd: true,
            maxTicketsPerTour: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!slot || slot.tour.deletedAt) {
      throw new NotFoundException('That departure could not be found.');
    }

    if (dto.quantity > slot.tour.maxTicketsPerTour) {
      throw new BusinessException(
        BusinessErrorCode.MaxTicketsExceeded,
        `${slot.tour.title} allows at most ${slot.tour.maxTicketsPerTour} tickets.`,
      );
    }

    // Price comes from the catalogue, never from the caller — an admin form is
    // still an untrusted input.
    const unitPrice =
      booking.currency === 'USD' ? slot.tour.priceAdultUsd : slot.tour.priceAdultEur;
    const amount = unitPrice * dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.bookingItem.findFirst({
        where: { bookingId: booking.id, slotId: slot.id },
        select: { id: true },
      });

      if (duplicate) {
        throw new BusinessException(
          BusinessErrorCode.DuplicateTimeSlot,
          'That departure is already on this booking. Change its quantity instead.',
        );
      }

      await this.claimSeats(tx, slot.id, dto.quantity, slot.tour.title);

      const item = await tx.bookingItem.create({
        data: {
          bookingId: booking.id,
          tourId: slot.tour.id,
          slotId: slot.id,
          tourTitle: slot.tour.title,
          date: slot.date,
          time: slot.time,
          quantity: dto.quantity,
          unitPrice,
          amount,
          tickets: {
            create: this.buildTickets(dto.holders, dto.quantity),
          },
        },
        select: { id: true },
      });

      const totals = await this.retotal(tx, booking.id);

      await this.note(
        tx,
        booking.id,
        `Added ${dto.quantity} × ${slot.tour.title} (${slot.date.toISOString().slice(0, 10)} ${slot.time}).`,
        userId,
      );

      return { id: item.id, ...totals };
    });
  }

  // --- change a tour ---------------------------------------------------------

  async updateItem(reference: string, itemId: string, dto: UpdateBookingItemDto, userId?: string) {
    const booking = await this.editableBooking(reference);

    const item = await this.prisma.bookingItem.findFirst({
      where: { id: itemId, bookingId: booking.id },
      include: {
        tickets: { orderBy: { createdAt: 'asc' } },
        tour: { select: { maxTicketsPerTour: true } },
      },
    });

    if (!item) throw new NotFoundException('That tour is not on this booking.');

    if (dto.quantity > item.tour.maxTicketsPerTour) {
      throw new BusinessException(
        BusinessErrorCode.MaxTicketsExceeded,
        `${item.tourTitle} allows at most ${item.tour.maxTicketsPerTour} tickets.`,
      );
    }

    const delta = dto.quantity - item.quantity;

    return this.prisma.$transaction(async (tx) => {
      if (delta > 0) {
        await this.claimSeats(tx, item.slotId, delta, item.tourTitle);
      } else if (delta < 0) {
        await this.releaseSeats(tx, item.slotId, -delta);
      }

      // The unit price stays as booked: a catalogue price change must not
      // silently reprice a booking somebody already agreed to.
      await tx.bookingItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity, amount: item.unitPrice * dto.quantity },
      });

      await this.reconcileTickets(tx, item, dto);

      const totals = await this.retotal(tx, booking.id);

      if (delta !== 0) {
        await this.note(
          tx,
          booking.id,
          `Changed ${item.tourTitle} from ${item.quantity} to ${dto.quantity} ticket(s).`,
          userId,
        );
      }

      return totals;
    });
  }

  /**
   * Brings the ticket rows in line with the new quantity.
   *
   * Surplus tickets are dropped from the end so the holders that were already
   * named keep their codes — reissuing every code on a quantity change would
   * invalidate tickets travellers have already downloaded.
   */
  private async reconcileTickets(
    tx: Tx,
    item: { id: string; tickets: { id: string }[] },
    dto: UpdateBookingItemDto,
  ) {
    const holders = dto.holders ?? [];

    for (const [index, ticket] of item.tickets.entries()) {
      const holder = holders[index];
      if (index >= dto.quantity) {
        await tx.ticket.delete({ where: { id: ticket.id } });
        continue;
      }
      if (holder) {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            holderFirstName: holder.firstName.trim(),
            holderLastName: holder.lastName.trim(),
          },
        });
      }
    }

    const missing = dto.quantity - item.tickets.length;

    if (missing > 0) {
      await tx.ticket.createMany({
        data: Array.from({ length: missing }, (_, offset) => {
          const holder = holders[item.tickets.length + offset];
          return {
            bookingItemId: item.id,
            holderFirstName: holder?.firstName.trim() || 'Guest',
            holderLastName: holder?.lastName.trim() || String(item.tickets.length + offset + 1),
            code: BookingItemsService.ticketCode(),
          };
        }),
      });
    }
  }

  // --- remove a tour ---------------------------------------------------------

  async removeItem(reference: string, itemId: string, userId?: string) {
    const booking = await this.editableBooking(reference);

    const item = await this.prisma.bookingItem.findFirst({
      where: { id: itemId, bookingId: booking.id },
      select: { id: true, slotId: true, quantity: true, tourTitle: true },
    });

    if (!item) throw new NotFoundException('That tour is not on this booking.');

    return this.prisma.$transaction(async (tx) => {
      await this.releaseSeats(tx, item.slotId, item.quantity);

      // Tickets cascade with the item.
      await tx.bookingItem.delete({ where: { id: item.id } });

      const totals = await this.retotal(tx, booking.id);

      await this.note(tx, booking.id, `Removed ${item.tourTitle} from this booking.`, userId);

      return totals;
    });
  }

  /** Pads with placeholders when fewer names were supplied than tickets. */
  private buildTickets(
    holders: AddBookingItemDto['holders'],
    quantity: number,
  ): { holderFirstName: string; holderLastName: string; code: string }[] {
    return Array.from({ length: quantity }, (_, index) => {
      const holder = holders?.[index];
      return {
        holderFirstName: holder?.firstName.trim() || 'Guest',
        holderLastName: holder?.lastName.trim() || String(index + 1),
        code: BookingItemsService.ticketCode(),
      };
    });
  }
}
