import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../database/prisma.service';
import { TokenService } from '../auth/token.service';

/**
 * Scheduled housekeeping.
 *
 * Every job is idempotent and safe to run concurrently on multiple instances:
 * each one narrows by a time window and updates only rows still in the state
 * it is clearing.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Drops expired and long-revoked refresh tokens so the table stays small. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'purge-refresh-tokens' })
  async purgeRefreshTokens(): Promise<void> {
    const count = await this.tokens.purgeExpired();
    if (count > 0) {
      this.logger.log(`Purged ${count} expired refresh tokens.`);
    }
  }

  /** Removes abandoned guest carts. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'purge-carts' })
  async purgeExpiredCarts(): Promise<void> {
    const { count } = await this.prisma.cart.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      this.logger.log(`Removed ${count} expired carts.`);
    }
  }

  /**
   * Releases seats held by unpaid bookings whose payment window has closed, so
   * inventory is not locked up by abandoned checkouts.
   */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'expire-pending-bookings' })
  async expirePendingBookings(): Promise<void> {
    const stale = await this.prisma.booking.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      select: { id: true, items: { select: { slotId: true, quantity: true } } },
    });

    if (stale.length === 0) return;

    for (const booking of stale) {
      await this.prisma.$transaction([
        this.prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        }),
        ...booking.items.map((item) =>
          this.prisma.tourSlot.update({
            where: { id: item.slotId },
            data: { booked: { decrement: item.quantity } },
          }),
        ),
      ]);
    }

    this.logger.log(`Expired ${stale.length} unpaid bookings and released their seats.`);
  }
}
