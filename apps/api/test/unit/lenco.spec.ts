import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { WebhookSignatureError } from '../../src/payments/gateway';
import { LencoGateway, lencoLocalPhone, lencoOperatorForPhone, mapLencoStatus } from '../../src/payments/lenco.gateway';
import { addMonths } from '../../src/payments/payments.service';

// Ported from the TUMA platform's Lenco adapter tests.
const env = { LENCO_API_URL: 'https://api.lenco.co/access/v2', LENCO_SEC_KEY: 'sec-key', LENCO_WEBHOOK_SIGNATURE_KEY: 'sig-key' };

describe('Lenco phone handling', () => {
  it('converts E.164 to the local form and detects the operator', () => {
    expect(lencoLocalPhone('+260971234567')).toBe('0971234567');
    expect(lencoOperatorForPhone('+260971234567')).toBe('airtel');
    expect(lencoOperatorForPhone('+260961234567')).toBe('mtn');
    expect(lencoOperatorForPhone('+260951234567')).toBe('zamtel');
    expect(lencoOperatorForPhone('+260911234567')).toBeNull();
  });

  it('maps gateway statuses', () => {
    expect(mapLencoStatus('successful')).toBe('SUCCEEDED');
    expect(mapLencoStatus('failed')).toBe('FAILED');
    expect(mapLencoStatus('pay-offline')).toBe('PENDING');
  });
});

describe('Lenco API calls', () => {
  it('initiates a collection in major units with our reference, never final at initiation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: 'successful' } }), { status: 200 }));
    const gw = new LencoGateway(env, fetchMock as unknown as typeof fetch);
    const res = await gw.createCollection({ reference: 'pay-1', amount: 150.5, currency: 'ZMW', payerPhone: '+260961234567', description: 'x' });
    expect(res).toEqual({ reference: 'pay-1', status: 'PENDING' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.lenco.co/access/v2/collections/mobile-money');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sec-key');
    expect(JSON.parse(String(init.body))).toMatchObject({ operator: 'mtn', phone: '0961234567', amount: 150.5, reference: 'pay-1', country: 'zm', bearer: 'merchant' });
  });

  it('refuses numbers that are not on a mobile money network', async () => {
    const gw = new LencoGateway(env, vi.fn() as unknown as typeof fetch);
    await expect(gw.createCollection({ reference: 'p', amount: 1, currency: 'ZMW', payerPhone: '+447700900123', description: 'x' })).rejects.toThrow(/supported mobile money/);
  });

  it('looks status up by our reference and surfaces gateway errors', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ data: { status: 'failed', reasonForFailure: 'Insufficient funds' } })));
    expect(await new LencoGateway(env, ok as unknown as typeof fetch).getStatus('pay-1')).toEqual({ status: 'FAILED', reason: 'Insufficient funds' });
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe('https://api.lenco.co/access/v2/collections/status/pay-1');
    const bad = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(new LencoGateway(env, bad as unknown as typeof fetch).getStatus('pay-1')).rejects.toThrow(/401/);
  });
});

describe('Lenco webhooks', () => {
  const gw = new LencoGateway(env, vi.fn() as unknown as typeof fetch);
  const data = { id: 'c1', reference: 'pay-1', status: 'successful', amount: '150.50', currency: 'ZMW', completedAt: '2026-10-22T10:00:00Z' };

  function sign(body: object, key = 'sig-key') {
    const raw = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha512', createHash('sha256').update(key).digest()).update(raw).digest('hex');
    return { raw, headers: { 'x-lenco-signature': signature } };
  }

  it('maps a signed successful collection', () => {
    const { raw, headers } = sign({ event: 'collection.successful', data });
    expect(gw.verifyWebhook(raw, headers)).toMatchObject({ type: 'collection.succeeded', reference: 'pay-1', amount: 150.5, currency: 'ZMW', eventId: 'collection.succeeded:c1' });
  });

  it('maps a failure with its reason', () => {
    const { raw, headers } = sign({ event: 'collection.failed', data: { ...data, status: 'failed', reasonForFailure: 'Insufficient funds' } });
    expect(gw.verifyWebhook(raw, headers)).toMatchObject({ type: 'collection.failed', reason: 'Insufficient funds' });
  });

  it('accepts the other plausible keying constructions and a sha512= prefix', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'collection.successful', data }));
    for (const signature of [
      createHmac('sha512', 'sig-key').update(raw).digest('hex'),
      createHmac('sha512', createHash('sha256').update('sig-key').digest('hex')).update(raw).digest('hex'),
    ]) {
      expect(gw.verifyWebhook(raw, { 'x-lenco-signature': signature })?.type).toBe('collection.succeeded');
      expect(gw.verifyWebhook(raw, { 'x-lenco-signature': `sha512=${signature}` })?.type).toBe('collection.succeeded');
    }
  });

  it('uses the API secret only when no signature key is configured', () => {
    const fallback = new LencoGateway({ ...env, LENCO_WEBHOOK_SIGNATURE_KEY: '' }, vi.fn() as unknown as typeof fetch);
    const signed = sign({ event: 'collection.successful', data }, 'sec-key');
    expect(fallback.verifyWebhook(signed.raw, signed.headers)?.type).toBe('collection.succeeded');
    expect(() => gw.verifyWebhook(signed.raw, signed.headers)).toThrow(WebhookSignatureError);
  });

  it('rejects missing, forged and tampered signatures', () => {
    const { raw, headers } = sign({ event: 'collection.successful', data });
    expect(() => gw.verifyWebhook(raw, {})).toThrow(WebhookSignatureError);
    expect(() => gw.verifyWebhook(raw, { 'x-lenco-signature': 'deadbeef' })).toThrow(WebhookSignatureError);
    const tampered = Buffer.from(raw.toString().replace('150.50', '1.00'));
    expect(() => gw.verifyWebhook(tampered, headers)).toThrow(WebhookSignatureError);
  });

  it('acknowledges authentic events it does not act on', () => {
    const ping = sign({ event: 'transfer.successful', data: {} });
    expect(gw.verifyWebhook(ping.raw, ping.headers)).toBeNull();
    const pending = sign({ event: 'collection.pending', data: { ...data, status: 'pending' } });
    expect(gw.verifyWebhook(pending.raw, pending.headers)).toBeNull();
  });
});

describe('subscription periods', () => {
  it('adds calendar months without overflowing short months', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-03-15T00:00:00Z'), 12).toISOString()).toBe('2027-03-15T00:00:00.000Z');
  });
});

describe('Zamtel SMS (ported from TUMA)', async () => {
  const { ZamtelSms, readZamtelBody, zamtelMsisdn } = await import('../../src/auth/sms');
  it('normalises Zambian numbers and rejects others', () => {
    expect(zamtelMsisdn('+260977123456')).toBe('260977123456');
    expect(zamtelMsisdn('0977123456')).toBe('260977123456');
    expect(zamtelMsisdn('977123456')).toBe('260977123456');
    expect(zamtelMsisdn('+447700900123')).toBeNull();
  });
  it('reads 200 bodies that report failure, and never leaks the api key', () => {
    expect(readZamtelBody('{"status":"success","messageId":42}', 'k')).toEqual({ status: 'SENT', providerMessageId: '42' });
    expect(readZamtelBody('{"status":"failed","message":"bad key secret-key"}', 'secret-key')).toEqual({ status: 'FAILED', error: 'bad key [redacted]' });
    expect(readZamtelBody('Insufficient credit', 'k').status).toBe('FAILED');
  });
  it('sends with the GET endpoint and reports network failures without the URL', async () => {
    const ok = vi.fn(async () => new Response('{"status":"success"}'));
    expect((await new ZamtelSms('secret-key', 'Vicinity', 'https://sms.test/send', ok as unknown as typeof fetch).send('0977123456', 'Hi 1')).status).toBe('SENT');
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe('https://sms.test/send/api_key/secret-key/contacts/260977123456/senderId/Vicinity/message/Hi%201');
    const down = vi.fn(async () => {
      throw new Error('fetch failed https://sms.test/send/api_key/secret-key');
    });
    const r = await new ZamtelSms('secret-key', 'Vicinity', 'https://sms.test/send', down as unknown as typeof fetch).send('0977123456', 'x');
    expect(r).toEqual({ status: 'FAILED', error: 'Zamtel SMS request failed' });
  });
});
