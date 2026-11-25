import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends email over SMTP. Without SMTP_HOST (development) messages are written to the log and kept
 * in an in-memory outbox that the e2e tests read. In production SMTP_HOST is required.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter | null;
  /** Development/test only. */
  readonly outbox: MailMessage[] = [];

  constructor() {
    const e = env();
    if (e.SMTP_HOST) {
      this.transport = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_PORT === 465,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      });
    } else {
      if (e.NODE_ENV === 'production') throw new Error('SMTP_HOST must be set in production');
      this.transport = null;
    }
  }

  async send(msg: MailMessage): Promise<void> {
    if (!this.transport) {
      this.outbox.push(msg);
      if (this.outbox.length > 100) this.outbox.shift();
      if (env().NODE_ENV !== 'test') this.logger.log(`[dev mail] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: env().MAIL_FROM, ...msg });
    } catch (e) {
      this.logger.error(`Failed to send "${msg.subject}" to ${msg.to}: ${(e as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
