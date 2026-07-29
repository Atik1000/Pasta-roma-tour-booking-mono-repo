import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { mailConfig } from '../../config/configuration';
import { MailJob, QueueName } from '../../queues/queue.constants';
import { MAIL_TRANSPORT, type MailTransport, type SendMailOptions } from './mail.types';

/**
 * The only way anything in the API sends mail.
 *
 * Delivery is queued when Redis is available, so a slow or failing SMTP server
 * never blocks a booking request; otherwise it falls back to sending inline.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(mailConfig.KEY) private readonly config: ConfigType<typeof mailConfig>,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Optional() @InjectQueue(QueueName.Mail) private readonly queue?: Queue,
  ) {}

  /** Enqueues a message, or sends it immediately when queues are disabled. */
  async send(options: SendMailOptions): Promise<void> {
    if (this.queue) {
      await this.queue.add(MailJob.Send, options);
      return;
    }

    await this.deliver(options);
  }

  /**
   * Performs the actual delivery. Called by the queue processor, or directly by
   * `send` when there is no queue.
   */
  async deliver(options: SendMailOptions): Promise<void> {
    try {
      await this.transport.send({ ...options, from: this.config.from });
    } catch (error) {
      this.logger.error(
        `Failed to deliver mail to ${options.to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
