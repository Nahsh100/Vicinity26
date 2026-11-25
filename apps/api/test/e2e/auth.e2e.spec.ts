import { auth, createApp, type Ctx, signUp } from './harness';

describe('Authentication', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createApp();
  });
  afterAll(async () => ctx.app.close());

  it('registers without choosing a role and returns a session', async () => {
    const r = await ctx.http.post('/api/v1/auth/register').send({ fullName: 'Ada Phiri', email: 'Ada@Test.local', password: 'Passw0rd!x', phone: '0971234567' }).expect(201);
    expect(r.body.data.user).toMatchObject({ email: 'ada@test.local', emailVerified: false, providerId: null, phone: '+260971234567' });
    expect(r.body.data.user).not.toHaveProperty('passwordHash');
    expect(r.body.data.tokens.refreshToken).toBeTruthy();
  });

  it('rejects duplicate emails and weak passwords with field details', async () => {
    await ctx.http.post('/api/v1/auth/register').send({ fullName: 'Ada', email: 'ada@test.local', password: 'Passw0rd!x' }).expect(409);
    const r = await ctx.http.post('/api/v1/auth/register').send({ fullName: 'B', email: 'not-an-email', password: 'short' }).expect(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(r.body.error.details)).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
  });

  it('logs in and rejects wrong passwords without revealing which part was wrong', async () => {
    await ctx.http.post('/api/v1/auth/login').send({ email: 'ada@test.local', password: 'Passw0rd!x' }).expect(200);
    const bad = await ctx.http.post('/api/v1/auth/login').send({ email: 'ada@test.local', password: 'nope' }).expect(401);
    const unknown = await ctx.http.post('/api/v1/auth/login').send({ email: 'ghost@test.local', password: 'nope' }).expect(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const u = await signUp(ctx);
    const r1 = await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(200);
    const rotated = r1.body.data.refreshToken;
    expect(rotated).not.toBe(u.refreshToken);
    // Reusing the first token is treated as theft: the whole family dies, including the new token.
    await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: rotated }).expect(401);
  });

  it('verifies email with the emailed single-use code', async () => {
    const u = await signUp(ctx, { verified: false });
    const mail = ctx.mail.outbox.filter((m) => m.to === u.email).pop()!;
    const code = /code in the app: (\S+)/.exec(mail.text)![1];
    await ctx.http.post('/api/v1/auth/verify-email').send({ token: code }).expect(200);
    await ctx.http.post('/api/v1/auth/verify-email').send({ token: code }).expect(400);
    const me = await ctx.http.get('/api/v1/auth/me').set(auth(u.token)).expect(200);
    expect(me.body.data.emailVerified).toBe(true);
  });

  it('resets the password and signs out other sessions', async () => {
    const u = await signUp(ctx);
    await ctx.http.post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(200);
    // Unknown emails get the same response.
    await ctx.http.post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.local' }).expect(200);
    const mail = ctx.mail.outbox.filter((m) => m.to === u.email && m.subject.includes('Reset')).pop()!;
    const code = /Reset code: (\S+)/.exec(mail.text)![1];
    await ctx.http.post('/api/v1/auth/reset-password').send({ token: code, password: 'NewPassw0rd' }).expect(200);
    await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: 'NewPassw0rd' }).expect(200);
  });

  it('rejects suspended accounts immediately', async () => {
    const u = await signUp(ctx);
    await ctx.prisma.user.update({ where: { id: u.userId }, data: { status: 'SUSPENDED' } });
    const { AuthGuard } = await import('../../src/common/auth');
    ctx.app.get(AuthGuard).invalidate(u.userId);
    await ctx.http.get('/api/v1/auth/me').set(auth(u.token)).expect(401);
    await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: 'Passw0rd!x' }).expect(401);
  });

  it('exports and deletes an account', async () => {
    const u = await signUp(ctx);
    const exp = await ctx.http.get('/api/v1/users/me/export').set(auth(u.token)).expect(200);
    expect(exp.body.data.user.email).toBe(u.email);
    await ctx.http.delete('/api/v1/users/me').set(auth(u.token)).expect(200);
    await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: 'Passw0rd!x' }).expect(401);
  });
});
