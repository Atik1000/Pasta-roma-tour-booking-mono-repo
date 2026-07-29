import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QueueName } from '../../queues/queue.constants';
import { MailService } from './mail.service';
import type { SendMailOptions } from './mail.types';

/** Drains the mail queue. Retries and backoff are configured on the queue root. */
@Processor(QueueName.Mail)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<SendMailOptions>): Promise<void> {
    await this.mail.deliver(job.data);
    this.logger.debug(`Delivered mail job ${job.id} to ${job.data.to}`);
  }
}
