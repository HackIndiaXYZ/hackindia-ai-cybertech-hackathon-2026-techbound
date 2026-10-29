import { config } from '../../config/index.js';
import { logger } from '../../infra/logger.js';

/**
 * Pluggable mail transport (plan §30 auth flows, Phase 5.2).
 *
 * Deliberately dependency-free: the app talks only to the `MailTransport`
 * interface, so a real provider (SMTP / SES / Postmark) can be dropped in behind
 * an ADR without touching callers. The two built-in transports never open a
 * network socket — `console` records that a message was produced (dev/test) and
 * `none` swallows it.
 *
 * Log hygiene (§25 / Phase 4E): a reset email body carries a single-use token, so
 * we log only the recipient and subject — never the body or any link it contains.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailTransport {
  send(msg: MailMessage): Promise<void>;
}

const consoleTransport: MailTransport = {
  async send(msg) {
    logger.info('mail_queued', { to: msg.to, subject: msg.subject, transport: 'console' });
  },
};

const nullTransport: MailTransport = {
  async send() {
    /* intentionally discards the message */
  },
};

let instance: MailTransport | null = null;

/** Returns the configured mail transport singleton. */
export function getMailTransport(): MailTransport {
  if (instance) return instance;
  instance = config.mail.transport === 'none' ? nullTransport : consoleTransport;
  return instance;
}

export function resetMailTransportForTests(): void {
  instance = null;
}
