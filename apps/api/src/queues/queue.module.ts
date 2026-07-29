import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { redisConfig } from '../config/configuration';
import { isQueueEnabled } from './queue.constants';

/**
 * BullMQ root configuration.
 *
 * Registered only when `REDIS_URL` is set. Without Redis the API still boots
 * and producers fall back to running their work inline — see `MailService`.
 */
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    if (!isQueueEnabled()) {
      new Logger(QueueModule.name).warn(
        'REDIS_URL is not set — background queues are disabled and jobs will run inline.',
      );
      return { module: QueueModule };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          inject: [redisConfig.KEY],
          useFactory: (redis: ConfigType<typeof redisConfig>) => ({
            connection: { url: redis.url },
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2_000 },
              removeOnComplete: { age: 3_600, count: 1_000 },
              removeOnFail: { age: 24 * 3_600 },
            },
          }),
        }),
      ],
      exports: [BullModule],
    };
  }
}
