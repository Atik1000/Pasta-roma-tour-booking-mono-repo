import { Injectable, NotFoundException } from '@nestjs/common';

import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { AddCartItemDto, CartDto, CartItemDto } from './dto/cart.dto';

/** Guest carts live for two weeks; the hourly cron sweeps anything older. */
const CART_TTL_DAYS = 14;

/** Flat per-booking fee, matching the seeded `booking.feeMinor` setting. */
export const BOOKING_FEE_MINOR = 500;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private expiry(): Date {
    return new Date(Date.now() + CART_TTL_DAYS * 86_400_000);
  }

  /** Finds or creates the cart for this browser session. */
  private async resolveCart(sessionId: string): Promise<{ id: string }> {
    const existing = await this.prisma.cart.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (existing) {
      // Touch the expiry so an active shopper never loses their basket.
      await this.prisma.cart.update({
        where: { id: existing.id },
        data: { expiresAt: this.expiry() },
      });
      return existing;
    }

    return this.prisma.cart.create({
      data: { sessionId, expiresAt: this.expiry() },
      select: { id: true },
    });
  }

  async get(sessionId: string): Promise<CartDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { sessionId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            tour: {
              select: {
                slug: true,
                title: true,
                priceAdultEur: true,
                maxTicketsPerTour: true,
                location: { select: { name: true } },
              },
            },
            slot: { select: { date: true, time: true, capacity: true, booked: true } },
          },
        },
      },
    });

    const items: CartItemDto[] = (cart?.items ?? []).map((item) => ({
      id: item.id,
      tourSlug: item.tour.slug,
      title: item.tour.title,
      location: item.tour.location.name,
      date: item.slot.date.toISOString().slice(0, 10),
      time: item.slot.time,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceSnapshot,
      amountMinor: item.unitPriceSnapshot * item.quantity,
      currency: item.currency,
      remaining: Math.max(0, item.slot.capacity - item.slot.booked),
      maxTickets: item.tour.maxTicketsPerTour,
      // Surfaced rather than silently repriced — the traveller decides.
      priceChanged: item.unitPriceSnapshot !== item.tour.priceAdultEur,
    }));

    return CartService.summarise(items);
  }

  static summarise(items: CartItemDto[]): CartDto {
    const subtotalMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);
    const bookingFeeMinor = items.length > 0 ? BOOKING_FEE_MINOR : 0;

    return {
      items,
      totalTickets: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalMinor,
      bookingFeeMinor,
      totalMinor: subtotalMinor + bookingFeeMinor,
      currency: items[0]?.currency ?? 'EUR',
    };
  }

  async addItem(sessionId: string, dto: AddCartItemDto): Promise<CartDto> {
    const tour = await this.prisma.tour.findFirst({
      where: { slug: dto.slug, status: 'PUBLISHED', deletedAt: null },
      select: { id: true, priceAdultEur: true, maxTicketsPerTour: true },
    });

    if (!tour) {
      throw new NotFoundException('That tour could not be found.');
    }

    const slot = await this.prisma.tourSlot.findFirst({
      where: { id: dto.slotId, tourId: tour.id },
      select: { id: true, capacity: true, booked: true },
    });

    if (!slot) {
      throw new BusinessException(
        BusinessErrorCode.SlotUnavailable,
        'That departure is no longer available.',
      );
    }

    const cart = await this.resolveCart(sessionId);

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_slotId: { cartId: cart.id, slotId: slot.id } },
      select: { id: true, quantity: true },
    });

    const desired = (existing?.quantity ?? 0) + dto.quantity;

    if (desired > tour.maxTicketsPerTour) {
      throw new BusinessException(
        BusinessErrorCode.MaxTicketsExceeded,
        `You can book at most ${tour.maxTicketsPerTour} tickets for this tour.`,
      );
    }

    if (desired > slot.capacity - slot.booked) {
      throw new BusinessException(
        BusinessErrorCode.SlotSoldOut,
        'There are not enough seats left on that departure.',
      );
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: desired },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          tourId: tour.id,
          slotId: slot.id,
          quantity: dto.quantity,
          unitPriceSnapshot: tour.priceAdultEur,
          currency: 'EUR',
        },
      });
    }

    return this.get(sessionId);
  }

  async updateItem(sessionId: string, itemId: string, quantity: number): Promise<CartDto> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { sessionId } },
      include: {
        tour: { select: { maxTicketsPerTour: true } },
        slot: { select: { capacity: true, booked: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('That cart item could not be found.');
    }

    if (quantity > item.tour.maxTicketsPerTour) {
      throw new BusinessException(
        BusinessErrorCode.MaxTicketsExceeded,
        `You can book at most ${item.tour.maxTicketsPerTour} tickets for this tour.`,
      );
    }

    if (quantity > item.slot.capacity - item.slot.booked) {
      throw new BusinessException(
        BusinessErrorCode.SlotSoldOut,
        'There are not enough seats left on that departure.',
      );
    }

    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return this.get(sessionId);
  }

  async removeItem(sessionId: string, itemId: string): Promise<CartDto> {
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cart: { sessionId } } });
    return this.get(sessionId);
  }

  async clear(sessionId: string): Promise<CartDto> {
    await this.prisma.cartItem.deleteMany({ where: { cart: { sessionId } } });
    return this.get(sessionId);
  }
}
