/**
 * Payment gateway boundary, ported from the TUMA platform's `PaymentProvider` (same contract,
 * trimmed to collections). Vicinity never sees card data or mobile-money PINs: the customer
 * approves on the gateway's own USSD/hosted flow. Success is only ever established from a
 * verified webhook or a server-side status lookup, never from the client.
 */
export type GatewayTxnStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface CreateCollectionInput {
  /** Our payment id. Lenco looks transactions up by this reference. */
  reference: string;
  /** Major units (ZMW), at most 2 decimals. */
  amount: number;
  currency: 'ZMW';
  payerPhone: string;
  description: string;
}

export interface GatewayEvent {
  /** Deterministic per outcome so redeliveries are deduplicated. */
  eventId: string;
  type: 'collection.succeeded' | 'collection.failed';
  reference: string;
  amount: number;
  currency: string;
  occurredAt: string;
  reason?: string;
}

export interface PaymentGateway {
  readonly name: string;
  readonly isSimulator: boolean;
  createCollection(input: CreateCollectionInput): Promise<{ reference: string; status: GatewayTxnStatus }>;
  getStatus(reference: string): Promise<{ status: GatewayTxnStatus; reason?: string }>;
  /**
   * Throws WebhookSignatureError on a bad signature. Returns null for an authentic event we do
   * not act on (transfers, test pings, still-pending updates); the controller acknowledges it.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): GatewayEvent | null;
}

export class WebhookSignatureError extends Error {}

/** Used when PAYMENT_PROVIDER=none: every money operation fails loudly; nothing pretends to work. */
export class UnconfiguredGateway implements PaymentGateway {
  readonly name = 'none';
  readonly isSimulator = false;
  createCollection(): never {
    throw new Error('No payment gateway is configured');
  }
  getStatus(): never {
    throw new Error('No payment gateway is configured');
  }
  verifyWebhook(): never {
    throw new WebhookSignatureError('No payment gateway is configured');
  }
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
