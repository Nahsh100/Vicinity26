import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebhookSignatureError, type CreateCollectionInput, type GatewayEvent, type GatewayTxnStatus, type PaymentGateway } from './gateway';

export const SIMULATOR_SIGNATURE_HEADER = 'x-vicinity-sim-signature';
const TOLERANCE_SECONDS = 300;

/**
 * DEVELOPMENT/TEST ONLY (refused in production). Models an asynchronous mobile-money gateway:
 * collections stay PENDING until a developer approves or declines them, and outcomes are
 * delivered as HMAC-signed webhooks through the same verification path as Lenco. Moves no money.
 * State is in memory: restarting the API forgets open simulated collections (they then expire).
 */
export class SimulatorGateway implements PaymentGateway {
  readonly name = 'simulator';
  readonly isSimulator = true;
  private readonly txns = new Map<string, { amount: number; status: GatewayTxnStatus; reason?: string }>();

  constructor(private readonly secret: string) {
    if (secret.length < 16) throw new Error('SIMULATOR_WEBHOOK_SECRET required');
  }

  async createCollection(input: CreateCollectionInput) {
    this.txns.set(input.reference, { amount: input.amount, status: 'PENDING' });
    return { reference: input.reference, status: 'PENDING' as const };
  }

  async getStatus(reference: string) {
    const t = this.txns.get(reference);
    return { status: t?.status ?? ('PENDING' as const), reason: t?.reason };
  }

  sign(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
    return `t=${timestamp},v1=${createHmac('sha256', this.secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent {
    const header = headers[SIMULATOR_SIGNATURE_HEADER];
    if (typeof header !== 'string') throw new WebhookSignatureError('Missing signature');
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
    const ts = Number(parts.t);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) throw new WebhookSignatureError('Signature timestamp outside tolerance');
    const expected = createHmac('sha256', this.secret).update(`${ts}.${rawBody.toString('utf8')}`).digest('hex');
    if (!parts.v1 || !/^[a-f0-9]{64}$/.test(parts.v1) || !timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))) {
      throw new WebhookSignatureError('Invalid signature');
    }
    const body = JSON.parse(rawBody.toString('utf8')) as GatewayEvent;
    if (!body.eventId || !body.type || !body.reference) throw new WebhookSignatureError('Malformed event');
    return body;
  }

  /** Settles a simulated collection and returns the signed webhook to deliver. */
  settle(reference: string, outcome: 'SUCCEEDED' | 'FAILED', amount: number, reason?: string): { rawBody: string; signature: string } {
    this.txns.set(reference, { amount, status: outcome, reason });
    const event: GatewayEvent = {
      eventId: `SIMEVT-${randomUUID()}`,
      type: outcome === 'SUCCEEDED' ? 'collection.succeeded' : 'collection.failed',
      reference,
      amount,
      currency: 'ZMW',
      occurredAt: new Date().toISOString(),
      reason,
    };
    const rawBody = JSON.stringify(event);
    return { rawBody, signature: this.sign(rawBody) };
  }
}
