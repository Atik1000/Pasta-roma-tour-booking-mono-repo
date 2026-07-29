import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { mailConfig } from '../../config/configuration';
import { isQueueEnabled, QueueName } from '../../queues/queue.constants';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { LogMailTransport, SmtpMailTransport } from './mail.transport';
import { MAIL_TRANSPORT, type MailTransport } from './mail.types';

// The queue and its processor only exist when Redis is configured.
const queueImports = isQueueEnabled() ? [BullModule.registerQueue({ name: QueueName.Mail })] : [];
const queueProviders = isQueueEnabled() ? [MailProcessor] : [];

@Global()
@Module({
  imports: queueImports,
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [mailConfig.KEY],
      useFactory: (config: ConfigType<typeof mailConfig>): MailTransport =>
        config.smtpUrl ? new SmtpMailTransport(config.smtpUrl) : new LogMailTransport(),
    },
    MailService,
    ...queueProviders,
  ],
  exports: [MailService],
})
export class MailModule {}
