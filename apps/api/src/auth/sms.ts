import { Logger } from '@nestjs/common';
import { env } from '../config/env';

/*
 * SMS transports, ported from the TUMA platform (infra/transports.ts). Transports report failure
 * by returning a status, never by throwing, so callers always read the result.
 */

export interface SendResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  providerMessageId?: string;
  error?: string;
}

export interface SmsTransport {
  readonly name: string;
  readonly isDevelopment: boolean;
  send(to: string, body: string): Promise<SendResult>;
}

const SMS_TIMEOUT_MS = 10_000;

/**
 * "+260977123456" / "0977123456" / "977123456" → "260977123456". Null for anything that is not a
 * 9-digit Zambian number, because Zamtel would reject it anyway.
 */
export function zamtelMsisdn(phone: string): string | null {
  const cleaned = (phone ?? '').replace(/[\s()+-]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const national = cleaned.startsWith('260') ? cleaned.slice(3) : cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  if (!/^\d{9}$/.test(national)) return null;
  return `260${national}`;
}

/** Zamtel echoes the request in some responses; never let the api key reach a log. */
function scrub(text: string, apiKey: string): string {
  return (apiKey ? text.split(apiKey).join('[redacted]') : text).slice(0, 200);
}

/**
 * Zamtel answers 200 for rejected messages too (bad sender id, no credit, blocked number), so the
 * body decides. Response shapes differ, hence the defensive read: anything that does not
 * positively say it failed is taken as accepted.
 */
export function readZamtelBody(text: string, apiKey: string): SendResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return /fail|error|invalid|insufficient/i.test(text) ? { status: 'FAILED', error: scrub(text, apiKey) } : { status: 'SENT' };
  }
  const b = (parsed ?? {}) as Record<string, unknown>;
  const status = String(b.status ?? b.Status ?? '').toLowerCase();
  const messageId = b.messageId ?? b.message_id ?? b.id;
  if (status && !['success', 'sent', 'ok', 'queued', '0', '200'].includes(status)) {
    return { status: 'FAILED', error: scrub(String(b.message ?? b.error ?? text), apiKey) };
  }
  return { status: 'SENT', providerMessageId: messageId === undefined || messageId === null ? undefined : String(messageId) };
}

/** Zamtel Bulk SMS (GET send endpoint). Zambian numbers only. */
export class ZamtelSms implements SmsTransport {
  readonly name = 'zamtel-bulk-sms';
  readonly isDevelopment = false;
  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, body: string): Promise<SendResult> {
    const msisdn = zamtelMsisdn(to);
    if (!msisdn) return { status: 'FAILED', error: 'Not a valid Zambian mobile number' };
    const url =
      `${this.baseUrl.replace(/\/+$/, '')}/api_key/${encodeURIComponent(this.apiKey)}` +
      `/contacts/${msisdn}/senderId/${encodeURIComponent(this.senderId)}/message/${encodeURIComponent(body)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(SMS_TIMEOUT_MS) });
    } catch (err) {
      // The URL holds the api key, so only the reason is reported (fetch puts the URL in its message).
      return { status: 'FAILED', error: err instanceof Error && err.name === 'TimeoutError' ? 'Zamtel SMS timed out' : 'Zamtel SMS request failed' };
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) return { status: 'FAILED', error: `Zamtel SMS HTTP ${res.status}${text ? `: ${scrub(text, this.apiKey)}` : ''}` };
    return readZamtelBody(text, this.apiKey);
  }
}

/** Development only (refused in production): writes the message to the API log instead of sending. */
export class LogSms implements SmsTransport {
  readonly name = 'dev-log-sms';
  readonly isDevelopment = true;
  private readonly logger = new Logger('SMS');
  /** Last message per number, so tests can read the code without parsing logs. */
  readonly outbox = new Map<string, string>();
  async send(to: string, body: string): Promise<SendResult> {
    this.outbox.set(to, body);
    if (env().NODE_ENV !== 'test') this.logger.warn(`[dev SMS to ${to}] ${body}`);
    return { status: 'SENT', providerMessageId: 'dev' };
  }
}

export class NoSms implements SmsTransport {
  readonly name = 'none';
  readonly isDevelopment = false;
  async send(): Promise<SendResult> {
    return { status: 'SKIPPED', error: 'SMS is switched off (SMS_DRIVER=none)' };
  }
}

export const SMS_TRANSPORT = Symbol('SMS_TRANSPORT');

export function createSmsTransport(): SmsTransport {
  const e = env();
  if (e.SMS_DRIVER === 'zamtel') return new ZamtelSms(e.ZAMTEL_SMS_API_KEY, e.SMS_SENDER_ID, e.ZAMTEL_SMS_BASE_URL);
  if (e.SMS_DRIVER === 'dev') return new LogSms();
  return new NoSms();
}
