import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { databaseConfig } from '../config/configuration';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The Prisma client, wired to Postgres through the driver adapter that
 * Prisma 7 requires. One instance is shared across the application.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>) {
    if (!config.url) {
      throw new Error('DATABASE_URL is required to start the API.');
    }

    super({
      adapter: new PrismaPg({ connectionString: config.url }),
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap round-trip used by the readiness probe. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(
        `Database ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Truncates every table. Test-only: refuses to run outside NODE_ENV=test so a
   * misfired call can never wipe a real database.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() is only available when NODE_ENV=test.');
    }

    const tables = await this.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    const quoted = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
    if (quoted) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
    }
  }
}
