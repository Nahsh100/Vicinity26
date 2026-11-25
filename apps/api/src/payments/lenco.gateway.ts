import { Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env';
import { WebhookSignatureError, type CreateCollectionInput, type GatewayEvent, type GatewayTxnStatus, type PaymentGateway } from './gateway';

/*
 * Lenco V2 mobile-money collections (MTN, Airtel, Zamtel), ported from the TUMA platform's
 * `LencoPaymentProvider`. The payer approves a USSD prompt on their phone, so there is no
 * checkout URL. Outcomes arrive as signed webhooks at POST /api/v1/webhooks/payments/lenco,
 * with status polling (PaymentsService.reconcile) as the backstop.
 *
 * Lenco's status endpoint takes the reference *we* supplied, not its own lencoReference, so the
 * payment id is the reference. Refunds and payouts are not integrated (process those in the
 * Lenco dashboard).
 */

export const LENCO_SIGNATURE_HEADER = 'x-lenco-signature';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The HMAC constructions Lenco plausibly means by "HMAC-SHA512 of the body". They differ only in
 * how the secret becomes the key. Each still requires the secret, so accepting several does not
 * weaken verification. The first verified delivery logs which one matched: narrow this list to
 * that construction once it is known.
 */
const SIGNATURE_SCHEMES: { name: string; digest: (key: string, body: Buffer) => string }[] = [
  { name: 'sha512(key=sha256(secret) bytes)', digest: (k, b) => createHmac('sha512', createHash('sha256').update(k, 'utf8').digest()).update(b).digest('hex') },
  { name: 'sha512(key=secret)', digest: (k, b) => createHmac('sha512', k).update(b).digest('hex') },
  { name: 'sha512(key=sha256(secret) hex)', digest: (k, b) => createHmac('sha512', createHash('sha256').update(k, 'utf8').digest('hex')).update(b).digest('hex') },
];

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

type LencoOperator = 'airtel' | 'mtn' | 'zamtel';

/** "+260971234567" → "0971234567" (Lenco expects the local form). */
export function lencoLocalPhone(phone: string): string {
  let digits = phone.trim().replace(/[\s()+-]/g, '');
  if (digits.startsWith('260')) digits = digits.slice(3);
  return digits.startsWith('0') ? digits : `0${digits}`;
}

/** Zambian prefix → operator. Lenco needs the operator; we only collect the number. */
export function lencoOperatorForPhone(phone: string): LencoOperator | null {
  const local = lencoLocalPhone(phone);
  if (/^0(21|95|75)\d{7}$/.test(local)) return 'zamtel';
  if (/^0(97|77|57)\d{7}$/.test(local)) return 'airtel';
  if (/^0(96|76)\d{7}$/.test(local)) return 'mtn';
  return null;
}

export function mapLencoStatus(value: unknown): GatewayTxnStatus {
  const s = String(value ?? '').toLowerCase();
  if (s === 'successful' || s === 'success' || s === 'paid') return 'SUCCEEDED';
  if (s === 'failed') return 'FAILED';
  // "pending" and "pay-offline" (the payer has not answered the USSD prompt yet).
  return 'PENDING';
}

interface LencoCollection {
  id?: string;
  reference?: string;
  lencoReference?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
  reasonForFailure?: string | null;
  initiatedAt?: string;
  completedAt?: string | null;
}

export class LencoGateway implements PaymentGateway {
  readonly name = 'lenco';
  readonly isSimulator = false;
  private readonly logger = new Logger('Lenco');
  /** Which key/construction last verified a delivery, so it is logged once, not per event. */
  private verifiedScheme: string | null = null;

  constructor(
    private readonly env: Pick<Env, 'LENCO_API_URL' | 'LENCO_SEC_KEY' | 'LENCO_WEBHOOK_SIGNATURE_KEY'>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!env.LENCO_SEC_KEY) throw new Error('LENCO_SEC_KEY required');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.env.LENCO_API_URL.replace(/\/+$/, '')}${path}`;
    const res = await this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.env.LENCO_SEC_KEY.trim()}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Lenco ${init.method ?? 'GET'} ${path} returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return (await res.json()) as T;
  }

  async createCollection(input: CreateCollectionInput) {
    const operator = lencoOperatorForPhone(input.payerPhone);
    if (!operator) throw new Error('Phone number is not on a supported mobile money network');
    const body = await this.request<{ data?: LencoCollection }>('/collections/mobile-money', {
      method: 'POST',
      body: JSON.stringify({
        operator,
        phone: lencoLocalPhone(input.payerPhone),
        amount: input.amount,
        reference: input.reference,
        bearer: 'merchant',
        country: 'zm',
      }),
    });
    const status = mapLencoStatus(body.data?.status);
    // A collection is never final at initiation: wait for the webhook / status lookup.
    return { reference: input.reference, status: status === 'SUCCEEDED' ? ('PENDING' as const) : status };
  }

  async getStatus(reference: string) {
    const body = await this.request<{ data?: LencoCollection }>(`/collections/status/${encodeURIComponent(reference)}`);
    return { status: mapLencoStatus(body.data?.status), reason: body.data?.reasonForFailure ?? undefined };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent | null {
    const header = headers[LENCO_SIGNATURE_HEADER];
    if (typeof header !== 'string' || !header.trim()) throw new WebhookSignatureError('Missing signature');
    const received = header.trim().replace(/^sha512=/i, '');
    // Keys are trimmed: pasted into a dashboard, a trailing newline silently changes the digest.
    // The API secret is accepted as a signing key only while no dedicated key is configured (it
    // travels as a bearer token on every request, so it is the more exposed secret).
    const sigKey = this.env.LENCO_WEBHOOK_SIGNATURE_KEY?.trim();
    const key = sigKey ? { name: 'LENCO_WEBHOOK_SIGNATURE_KEY', value: sigKey } : { name: 'LENCO_SEC_KEY', value: this.env.LENCO_SEC_KEY.trim() };

    let matched: string | null = null;
    for (const scheme of SIGNATURE_SCHEMES) {
      if (safeEqual(received, scheme.digest(key.value, rawBody))) {
        matched = `${key.name} / ${scheme.name}`;
        break;
      }
    }
    if (!matched) throw new WebhookSignatureError('Invalid signature');
    if (this.verifiedScheme !== matched) {
      this.verifiedScheme = matched;
      this.logger.log(`Lenco webhook signature verified using ${matched}`);
    }

    let payload: { event?: string; data?: LencoCollection };
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as typeof payload;
    } catch {
      throw new WebhookSignatureError('Malformed event');
    }
    const event = String(payload.event ?? '').toLowerCase();
    const data = payload.data ?? {};
    if (!event.startsWith('collection.')) return null;
    const status = mapLencoStatus(event === 'collection.failed' ? 'failed' : (data.status ?? event.split('.')[1]));
    if (status === 'PENDING') return null;
    if (!data.reference) throw new WebhookSignatureError('Malformed event');
    const type = status === 'SUCCEEDED' ? 'collection.succeeded' : 'collection.failed';
    return {
      eventId: `${type}:${data.id ?? data.reference}`,
      type,
      reference: data.reference,
      amount: Number(data.amount),
      currency: (data.currency ?? 'ZMW').toUpperCase(),
      occurredAt: data.completedAt ?? data.initiatedAt ?? new Date().toISOString(),
      reason: data.reasonForFailure ?? undefined,
    };
  }
}
