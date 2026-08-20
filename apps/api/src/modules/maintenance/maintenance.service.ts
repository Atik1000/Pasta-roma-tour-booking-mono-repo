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
   * Closes out unpaid bookings whose payment window has passed.
   *
   * This used to be about inventory — an abandoned checkout sat on seats nobody
   * was going to use. With departures gone there are no seats to reclaim, so
   * what is left is housekeeping: a booking nobody paid for should not sit in
   * the panel as PENDING for ever.
   */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'expire-pending-bookings' })
  async expirePendingBookings(): Promise<void> {
    const { count } = await this.prisma.booking.updateMany({
      where: {
        status: 'PENDING',
        paymentStatus: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (count > 0) {
      this.logger.log(`Expired ${count} unpaid bookings.`);
    }
  }
}
