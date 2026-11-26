import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BroadcastService } from '../../src/admin/broadcast.service';
import { adminToken, auth, createApp, makeProvider, resetData, signUp, type Ctx } from './harness';

let ctx: Ctx;
let admin: string;

beforeAll(async () => {
  ctx = await createApp();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await resetData(ctx.prisma);
  admin = await adminToken(ctx);
});

/** Sending runs in the background: wait until the broadcast is finished. */
async function settled(id: string) {
  for (let i = 0; i < 100; i++) {
    const b = await ctx.prisma.adminBroadcast.findUniqueOrThrow({ where: { id } });
    if (b.status !== 'SENDING') return b;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('broadcast did not finish');
}

const send = (token: string, body: Record<string, unknown>) => ctx.http.post('/api/v1/admin/notifications/broadcasts').set(auth(token)).send(body);

describe('admin broadcasts', () => {
  it('counts audiences and sends an announcement to everyone', async () => {
    const a = await signUp(ctx, { name: 'Customer A' });
    const p = await makeProvider(ctx, { name: 'Broadcast Shop', lat: -15.4, lng: 28.3, area: 'Woodlands' });
    const total = await ctx.prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }); // includes the seeded admin

    const all = await ctx.http.get('/api/v1/admin/notifications/audience?audience=ALL').set(auth(admin)).expect(200);
    expect(all.body.data.count).toBe(total);
    expect((await ctx.http.get('/api/v1/admin/notifications/audience?audience=PROVIDERS').set(auth(admin)).expect(200)).body.data.count).toBe(1);

    const r = await send(admin, { title: 'Scheduled maintenance', body: 'Vicinity will be offline 02:00–02:30 tonight.', category: 'SYSTEM', audience: 'ALL', link: '/help', linkLabel: 'Learn more' }).expect(201);
    expect(r.body.data).toMatchObject({ status: 'SENDING', recipientCount: total });
    const done = await settled(r.body.data.id);
    expect(done).toMatchObject({ status: 'SENT', deliveredCount: total });

    const n = await ctx.http.get('/api/v1/notifications').set(auth(a.token)).expect(200);
    expect(n.body.data[0]).toMatchObject({ category: 'SYSTEM', title: 'Scheduled maintenance', data: { type: 'broadcast', link: '/help', linkLabel: 'Learn more' } });
    expect(await ctx.prisma.notification.count({ where: { userId: p.userId, dedupeKey: `broadcast:${r.body.data.id}` } })).toBe(1);

    const history = await ctx.http.get('/api/v1/admin/notifications/broadcasts').set(auth(admin)).expect(200);
    expect(history.body.data[0]).toMatchObject({ id: r.body.data.id, status: 'SENT', title: 'Scheduled maintenance' });
  });

  it('targets segments and chosen users; promotions reach only users who opted in', async () => {
    const a = await signUp(ctx, { name: 'Opted In' });
    const b = await signUp(ctx, { name: 'Default Prefs' });
    await makeProvider(ctx, { name: 'Segment Shop', lat: -15.4, lng: 28.3, area: 'Woodlands' });
    await ctx.http.put('/api/v1/notifications/preferences').set(auth(a.token)).send({ categories: { PROMOTION: true } }).expect(200);

    const promo = await send(admin, { title: 'Weekend offer', body: 'Free listing boost this weekend.', category: 'PROMOTION', audience: 'CUSTOMERS' }).expect(201);
    const done = await settled(promo.body.data.id);
    expect(done.deliveredCount).toBeLessThan(done.recipientCount);
    expect(await ctx.prisma.notification.count({ where: { userId: a.userId, title: 'Weekend offer' } })).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: b.userId, title: 'Weekend offer' } })).toBe(0);

    const chosen = await send(admin, { title: 'Hello Default', body: 'Just for you.', category: 'SYSTEM', audience: 'USERS', userIds: [b.userId] }).expect(201);
    await settled(chosen.body.data.id);
    expect(await ctx.prisma.notification.count({ where: { title: 'Hello Default' } })).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: b.userId, title: 'Hello Default' } })).toBe(1);
  });

  it('validates input and permissions', async () => {
    const user = await signUp(ctx, { name: 'Not Admin' });
    await send(user.token, { title: 'x', body: 'y', category: 'SYSTEM', audience: 'ALL' }).expect(403);
    await send(admin, { title: 'x', body: 'y', category: 'SYSTEM', audience: 'ALL', link: 'https://evil.example/login' }).expect(400);
    await send(admin, { title: 'x', body: 'y', category: 'SYSTEM', audience: 'ALL', link: '//evil.example/login' }).expect(400);
    await send(admin, { title: 'x', body: 'y', category: 'SYSTEM', audience: 'USERS', userIds: [] }).expect(400);
    await send(admin, { title: 'x', body: 'y', category: 'ACCOUNT', audience: 'ALL' }).expect(400);
    expect((await send(admin, { title: 'x', body: 'y', category: 'SYSTEM', audience: 'USERS', userIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400)).body.error.code).toBe('EMPTY_AUDIENCE');
    const log = await ctx.prisma.auditLog.count({ where: { action: 'admin.broadcast' } });
    expect(log).toBe(0);
  });

  it('resuming an interrupted broadcast does not notify anyone twice', async () => {
    const a = await signUp(ctx, { name: 'Resume User' });
    const r = await send(admin, { title: 'Resume test', body: 'Only once.', category: 'SYSTEM', audience: 'USERS', userIds: [a.userId] }).expect(201);
    await settled(r.body.data.id);
    // Simulate a restart mid-send: mark it SENDING again and resume.
    await ctx.prisma.adminBroadcast.update({ where: { id: r.body.data.id }, data: { status: 'SENDING' } });
    await ctx.app.get(BroadcastService).deliver(r.body.data.id);
    expect(await ctx.prisma.notification.count({ where: { userId: a.userId, title: 'Resume test' } })).toBe(1);
    expect((await ctx.prisma.adminBroadcast.findUniqueOrThrow({ where: { id: r.body.data.id } })).status).toBe('SENT');
  });
});
