import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SimulatorGateway, SIMULATOR_SIGNATURE_HEADER } from '../../src/payments/simulator.gateway';
import { adminToken, auth, createApp, makeProvider, resetData, type Ctx } from './harness';

let ctx: Ctx;
const sim = new SimulatorGateway(process.env.SIMULATOR_WEBHOOK_SECRET!);

beforeAll(async () => {
  ctx = await createApp();
});
afterAll(async () => {
  await ctx.app.close();
});

async function provider() {
  await resetData(ctx.prisma);
  return makeProvider(ctx, { name: 'Pay Test Studio', lat: -15.4, lng: 28.3, area: 'Rhodes Park' });
}

const checkout = (token: string, body: Record<string, unknown>) => ctx.http.post('/api/v1/payments/subscriptions').set(auth(token)).send(body);

/** Delivers a signed simulator webhook exactly as the gateway would (raw JSON body). */
function deliver(rawBody: string, signature: string) {
  return ctx.http.post('/api/v1/webhooks/payments/simulator').set('Content-Type', 'application/json').set(SIMULATOR_SIGNATURE_HEADER, signature).send(rawBody);
}

describe('plan purchases (simulator gateway)', () => {
  it('reports payments as available and starts a pending mobile-money payment', async () => {
    const p = await provider();
    const me = await ctx.http.get('/api/v1/subscriptions/me').set(auth(p.token)).expect(200);
    expect(me.body.data).toMatchObject({ paymentsAvailable: true, pendingPayment: null, plan: { code: 'FREE' } });

    const r = await checkout(p.token, { planCode: 'PRO', months: 3, phone: '0961234567' }).expect(201);
    expect(r.body.data).toMatchObject({ status: 'PENDING', amount: 450, months: 3, plan: { code: 'PRO' }, payerPhone: '096•••4567', simulated: true });

    // A double tap returns the same payment; a different purchase must wait.
    const again = await checkout(p.token, { planCode: 'PRO', months: 3, phone: '0961234567' }).expect(201);
    expect(again.body.data.id).toBe(r.body.data.id);
    const other = await checkout(p.token, { planCode: 'BUSINESS', months: 1, phone: '0961234567' }).expect(409);
    expect(other.body.error.code).toBe('PAYMENT_IN_PROGRESS');
  });

  it('validates plan, term and mobile-money number', async () => {
    const p = await provider();
    expect((await checkout(p.token, { planCode: 'FREE', months: 1, phone: '0961234567' }).expect(400)).body.error.code).toBe('INVALID_PLAN');
    await checkout(p.token, { planCode: 'PRO', months: 2, phone: '0961234567' }).expect(400);
    await checkout(p.token, { planCode: 'PRO', months: 1, phone: '+447700900123' }).expect(400);
  });

  it('applies a verified success once: subscription active, entitlements raised, payer notified', async () => {
    const p = await provider();
    const pay = (await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0971234567' }).expect(201)).body.data;
    const { rawBody, signature } = sim.settle(pay.id, 'SUCCEEDED', pay.amount);

    expect((await deliver(rawBody, signature).expect(200)).body.data).toEqual({ received: true, processed: true });
    // Redelivery of the same event: acknowledged, no second extension.
    expect((await deliver(rawBody, signature).expect(200)).body.data).toEqual({ received: true, processed: false });

    const got = await ctx.http.get(`/api/v1/payments/${pay.id}`).set(auth(p.token)).expect(200);
    expect(got.body.data).toMatchObject({ status: 'SUCCEEDED' });
    const me = (await ctx.http.get('/api/v1/subscriptions/me').set(auth(p.token)).expect(200)).body.data;
    expect(me.plan.code).toBe('PRO');
    expect(me.entitlements.maxListings).toBe(50);
    const days = (new Date(me.currentPeriodEnd).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(await ctx.prisma.providerSubscription.count({ where: { providerId: p.providerId } })).toBe(1);
    const n = await ctx.prisma.notification.findFirst({ where: { userId: p.userId, title: 'Payment received' } });
    expect(n?.body).toContain('Pro plan is active');

    // Renewing the same plan extends the period.
    const renew = (await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0971234567' }).expect(201)).body.data;
    const s2 = sim.settle(renew.id, 'SUCCEEDED', renew.amount);
    await deliver(s2.rawBody, s2.signature).expect(200);
    const me2 = (await ctx.http.get('/api/v1/subscriptions/me').set(auth(p.token)).expect(200)).body.data;
    expect(new Date(me2.currentPeriodEnd).getTime()).toBeGreaterThan(new Date(me.currentPeriodEnd).getTime() + 27 * 86_400_000);

  });

  it('upgrades with the unused value carried over', async () => {
    const p = await provider();
    const pro = (await checkout(p.token, { planCode: 'PRO', months: 3, phone: '0971234567' }).expect(201)).body.data;
    const a = sim.settle(pro.id, 'SUCCEEDED', pro.amount);
    await deliver(a.rawBody, a.signature).expect(200);
    const biz = (await checkout(p.token, { planCode: 'BUSINESS', months: 1, phone: '0971234567' }).expect(201)).body.data;
    const b = sim.settle(biz.id, 'SUCCEEDED', biz.amount);
    await deliver(b.rawBody, b.signature).expect(200);
    const me = (await ctx.http.get('/api/v1/subscriptions/me').set(auth(p.token)).expect(200)).body.data;
    expect(me.plan.code).toBe('BUSINESS');
    // ~90 days of Pro (150/month) ≈ 30 extra days of Business (450/month).
    const days = (new Date(me.currentPeriodEnd).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(55);
    expect(days).toBeLessThan(63);
    const down = await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0971234567' }).expect(400);
    expect(down.body.error.code).toBe('DOWNGRADE_NOT_ALLOWED');
  });

  it('records failures, frees the slot, and rejects forged or mismatched webhooks', async () => {
    const p = await provider();
    const pay = (await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0961234567' }).expect(201)).body.data;

    const forged = sim.settle(pay.id, 'SUCCEEDED', pay.amount);
    await deliver(forged.rawBody, forged.signature.replace(/v1=./, 'v1=0')).expect(401);
    await ctx.http.post('/api/v1/webhooks/payments/lenco').set('Content-Type', 'application/json').send('{}').expect(401);

    const failed = sim.settle(pay.id, 'FAILED', pay.amount, 'Insufficient funds');
    await deliver(failed.rawBody, failed.signature).expect(200);
    const got = (await ctx.http.get(`/api/v1/payments/${pay.id}`).set(auth(p.token)).expect(200)).body.data;
    expect(got).toMatchObject({ status: 'FAILED', failureReason: 'Not enough balance on the mobile money account' });

    // Slot freed: a new attempt is allowed. An underpayment is held for review, not applied.
    const retry = (await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0961234567' }).expect(201)).body.data;
    const under = sim.settle(retry.id, 'SUCCEEDED', 1);
    await deliver(under.rawBody, under.signature).expect(200);
    const row = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: retry.id } });
    expect(row.appliedAt).toBeNull();
    expect(row.failureReason).toMatch(/needs review/);
    expect((await ctx.http.get('/api/v1/subscriptions/me').set(auth(p.token)).expect(200)).body.data.plan.code).toBe('FREE');
  });

  it('lets the payer cancel, honours a late success, and keeps payments private', async () => {
    const p = await provider();
    const pay = (await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0961234567' }).expect(201)).body.data;
    const stranger = await makeProvider(ctx, { name: 'Other Shop', lat: -15.41, lng: 28.31, area: 'Woodlands' });
    await ctx.http.get(`/api/v1/payments/${pay.id}`).set(auth(stranger.token)).expect(404);

    expect((await ctx.http.post(`/api/v1/payments/${pay.id}/cancel`).set(auth(p.token)).expect(200)).body.data.status).toBe('CANCELLED');
    const late = sim.settle(pay.id, 'SUCCEEDED', pay.amount);
    await deliver(late.rawBody, late.signature).expect(200);
    expect((await ctx.http.get(`/api/v1/payments/${pay.id}`).set(auth(p.token)).expect(200)).body.data.status).toBe('SUCCEEDED');
    expect((await ctx.http.get('/api/v1/subscriptions/me').set(auth(p.token)).expect(200)).body.data.plan.code).toBe('PRO');

    const mine = await ctx.http.get('/api/v1/payments/mine').set(auth(p.token)).expect(200);
    expect(mine.body.data).toHaveLength(1);
    const admin = await adminToken(ctx);
    const list = await ctx.http.get('/api/v1/admin/payments').set(auth(admin)).expect(200);
    expect(list.body.data[0]).toMatchObject({ id: pay.id, applied: true, provider: { displayName: 'Pay Test Studio' } });
    await ctx.http.get('/api/v1/admin/payments').set(auth(p.token)).expect(403);
  });

  it('simulator approve endpoint goes through the signed ingest path', async () => {
    const p = await provider();
    const pay = (await checkout(p.token, { planCode: 'PRO', months: 1, phone: '0961234567' }).expect(201)).body.data;
    const r = await ctx.http.post(`/api/v1/payments/${pay.id}/simulate`).set(auth(p.token)).send({ outcome: 'SUCCEEDED' }).expect(200);
    expect(r.body.data.status).toBe('SUCCEEDED');
    expect(await ctx.prisma.paymentEvent.count()).toBe(1);
  });
});
