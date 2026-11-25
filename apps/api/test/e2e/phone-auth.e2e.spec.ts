import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LogSms, SMS_TRANSPORT } from '../../src/auth/sms';
import { auth, createApp, resetData, signUp, type Ctx } from './harness';

let ctx: Ctx;
let sms: LogSms;
const PHONE = '0971234567';
const E164 = '+260971234567';

beforeAll(async () => {
  ctx = await createApp();
  sms = ctx.app.get(SMS_TRANSPORT) as LogSms;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await resetData(ctx.prisma);
  sms.outbox.clear();
});

const codeFor = (phone = E164) => /(\d{6})/.exec(sms.outbox.get(phone) ?? '')?.[1] ?? '';
const start = (phone = PHONE) => ctx.http.post('/api/v1/auth/phone/start').send({ phone });
const verify = (code: string, phone = PHONE) => ctx.http.post('/api/v1/auth/phone/verify').send({ phone, code });
/** Lets the next code be requested without waiting for the 30 s resend cooldown. */
const skipCooldown = () => ctx.prisma.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });

describe('phone sign-in with SMS codes', () => {
  it('advertises the method and sends a 6-digit code without storing it', async () => {
    expect((await ctx.http.get('/api/v1/auth/methods').expect(200)).body.data).toMatchObject({ email: true, phone: true, codeLength: 6 });
    const r = await start().expect(200);
    expect(r.body.data).toMatchObject({ sent: true, codeLength: 6, resendInSeconds: 30, devMode: true });
    const code = codeFor();
    expect(code).toMatch(/^\d{6}$/);
    expect(sms.outbox.get(E164)).toContain('Vicinity sign-in code');
    const row = await ctx.prisma.otpChallenge.findFirstOrThrow({ include: { deliveries: true } });
    expect(row.codeHash).not.toContain(code);
    expect(row.deliveries[0]).toMatchObject({ channel: 'SMS', status: 'SENT' });
  });

  it('creates the account on first sign-in, then signs the same person in', async () => {
    await start().expect(200);
    const first = await verify(codeFor()).expect(200);
    expect(first.body.data.isNewUser).toBe(true);
    expect(first.body.data.user).toMatchObject({ phone: E164, phoneVerified: true, email: null, fullName: '', hasPassword: false });
    const token = first.body.data.tokens.accessToken as string;
    await ctx.http.patch('/api/v1/users/me').set(auth(token)).send({ fullName: 'Chanda Phiri' }).expect(200);

    await skipCooldown();
    await start().expect(200);
    const again = await verify(codeFor()).expect(200);
    expect(again.body.data.isNewUser).toBe(false);
    expect(again.body.data.user).toMatchObject({ id: first.body.data.user.id, fullName: 'Chanda Phiri' });
    // Refresh tokens work like any other session.
    await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: again.body.data.tokens.refreshToken }).expect(200);
  });

  it('codes are single-use, attempt-limited and replaced by a newer one', async () => {
    await start().expect(200);
    const code = codeFor();
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await verify(wrong).expect(422);
    expect(bad.body.error.code).toBe('OTP_INVALID');
    expect(bad.body.error.message).toContain('4 attempts left');
    for (let i = 0; i < 3; i++) await verify(wrong).expect(422);
    expect((await verify(wrong).expect(422)).body.error.code).toBe('OTP_LOCKED');
    // Even the right code is useless once locked.
    expect((await verify(code).expect(422)).body.error.code).toBe('OTP_NOT_FOUND');

    await skipCooldown();
    await start().expect(200);
    const old = codeFor();
    await skipCooldown();
    await start().expect(200);
    const fresh = codeFor();
    if (old !== fresh) await verify(old).expect(422);
    await verify(fresh).expect(200);
    expect((await verify(fresh).expect(422)).body.error.code).toBe('OTP_NOT_FOUND');
  });

  it('expired codes fail', async () => {
    await start().expect(200);
    await ctx.prisma.otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verify(codeFor()).expect(422)).body.error.code).toBe('OTP_EXPIRED');
  });

  it('enforces the resend cooldown and the per-number limit, and only accepts Zambian mobiles', async () => {
    await start().expect(200);
    expect((await start().expect(429)).body.error.code).toBe('OTP_COOLDOWN');
    for (let i = 0; i < 4; i++) {
      await skipCooldown();
      await start().expect(200);
    }
    await skipCooldown();
    expect((await start().expect(429)).body.error.code).toBe('OTP_RATE_LIMITED');
    await start('+447700900123').expect(400);
    await start('0211234567').expect(400);
  });

  it('suspended accounts cannot sign in by phone', async () => {
    await start().expect(200);
    const r = await verify(codeFor()).expect(200);
    await ctx.prisma.user.update({ where: { id: r.body.data.user.id }, data: { status: 'SUSPENDED' } });
    await skipCooldown();
    await start().expect(200);
    expect((await verify(codeFor()).expect(401)).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('an email account can verify a phone, then sign in with it; numbers stay unique', async () => {
    const u = await signUp(ctx, { name: 'Email User' });
    await ctx.http.post('/api/v1/auth/phone/link/start').set(auth(u.token)).send({ phone: PHONE }).expect(200);
    const linked = await ctx.http.post('/api/v1/auth/phone/link/verify').set(auth(u.token)).send({ phone: PHONE, code: codeFor() }).expect(200);
    expect(linked.body.data).toMatchObject({ phone: E164, phoneVerified: true, hasPassword: true });
    // The verified number is now locked against plain profile edits.
    expect((await ctx.http.patch('/api/v1/users/me').set(auth(u.token)).send({ phone: '0961234567' }).expect(400)).body.error.code).toBe('PHONE_LOCKED');

    await skipCooldown();
    await start().expect(200);
    const viaPhone = await verify(codeFor()).expect(200);
    expect(viaPhone.body.data).toMatchObject({ isNewUser: false, user: { id: u.userId } });

    const other = await signUp(ctx, { name: 'Other User' });
    expect((await ctx.http.post('/api/v1/auth/phone/link/start').set(auth(other.token)).send({ phone: PHONE }).expect(409)).body.error.code).toBe('PHONE_TAKEN');
  });

  it('a phone account can add an email', async () => {
    await start().expect(200);
    const r = await verify(codeFor()).expect(200);
    const token = r.body.data.tokens.accessToken as string;
    const me = await ctx.http.post('/api/v1/auth/email').set(auth(token)).send({ email: 'Chanda@Example.com' }).expect(200);
    expect(me.body.data).toMatchObject({ email: 'chanda@example.com', emailVerified: false });
    expect(ctx.mail).toBeDefined();
    const dup = await signUp(ctx, { name: 'Taken' });
    expect((await ctx.http.post('/api/v1/auth/email').set(auth(token)).send({ email: dup.email }).expect(409)).body.error.code).toBe('EMAIL_TAKEN');
  });
});
