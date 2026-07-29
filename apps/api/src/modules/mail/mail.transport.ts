import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import type { MailTransport, SendMailOptions } from './mail.types';

/** Delivers mail over SMTP. */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(smtpUrl: string) {
    this.transporter = createTransport(smtpUrl);
  }

  async send(options: SendMailOptions & { from: string }): Promise<void> {
    await this.transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });
  }
}

/**
 * Development fallback used when `SMTP_URL` is unset: writes the message to the
 * log instead of sending it, so flows that depend on mail remain testable.
 */
export class LogMailTransport implements MailTransport {
  private readonly logger = new Logger('MailTransport');

  send(options: SendMailOptions & { from: string }): Promise<void> {
    this.logger.log(
      `[not sent — no SMTP configured] to=${options.to} subject="${options.subject}"`,
    );
    return Promise.resolve();
  }
}
