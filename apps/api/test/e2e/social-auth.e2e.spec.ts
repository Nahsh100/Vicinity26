import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SocialTokenVerifier } from '../../src/auth/social.service';
import { createApp, relogin, resetData, signUp, type Ctx } from './harness';

let ctx: Ctx;
let googleKey: KeyLike;
let appleKey: KeyLike;
let strangerKey: KeyLike;
const GOOGLE_AUD = 'test-web-client.apps.googleusercontent.com';

beforeAll(async () => {
  ctx = await createApp();
  const g = await generateKeyPair('RS256');
  const a = await generateKeyPair('RS256');
  strangerKey = (await generateKeyPair('RS256')).privateKey;
  googleKey = g.privateKey;
  appleKey = a.privateKey;
  const verifier = ctx.app.get(SocialTokenVerifier);
  verifier.useKeys('GOOGLE', createLocalJWKSet({ keys: [{ ...(await exportJWK(g.publicKey)), kid: 'g1', alg: 'RS256' }] }));
  verifier.useKeys('APPLE', createLocalJWKSet({ keys: [{ ...(await exportJWK(a.publicKey)), kid: 'a1', alg: 'RS256' }] }));
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await resetData(ctx.prisma);
});

async function googleToken(claims: Record<string, unknown>, opts: { key?: KeyLike; aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT({ email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'g1' })
    .setIssuer(opts.iss ?? 'https://accounts.google.com')
    .setAudience(opts.aud ?? GOOGLE_AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(opts.key ?? googleKey);
}

async function appleToken(claims: Record<string, unknown>) {
  return new SignJWT({ email_verified: 'true', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'a1' })
    .setIssuer('https://appleid.apple.com')
    .setAudience('zm.vicinity.app')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(appleKey);
}

const social = (body: Record<string, unknown>) => ctx.http.post('/api/v1/auth/social').send(body);

describe('Google / Apple sign-in', () => {
  it('advertises the configured providers', async () => {
    expect((await ctx.http.get('/api/v1/auth/methods').expect(200)).body.data).toMatchObject({ google: true, apple: true });
  });

  it('creates an account on first Google sign-in, then signs the same person in by sub', async () => {
    const t = await googleToken({ sub: 'g-123', email: 'Thandiwe@Gmail.com', name: 'Thandiwe Banda' });
    const first = await social({ provider: 'google', idToken: t }).expect(200);
    expect(first.body.data.isNewUser).toBe(true);
    expect(first.body.data.user).toMatchObject({ email: 'thandiwe@gmail.com', emailVerified: true, fullName: 'Thandiwe Banda', hasPassword: false, linkedProviders: ['GOOGLE'] });

    // Same Google account, even if its email changed since: matched by sub.
    const again = await social({ provider: 'google', idToken: await googleToken({ sub: 'g-123', email: 'new-address@gmail.com' }) }).expect(200);
    expect(again.body.data).toMatchObject({ isNewUser: false, user: { id: first.body.data.user.id } });
    await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: again.body.data.tokens.refreshToken }).expect(200);
  });

  it('links to an existing confirmed account with the same email and keeps its password', async () => {
    const u = await signUp(ctx, { name: 'Existing User' });
    const r = await social({ provider: 'google', idToken: await googleToken({ sub: 'g-777', email: u.email }) }).expect(200);
    expect(r.body.data).toMatchObject({ isNewUser: false, user: { id: u.userId, hasPassword: true, linkedProviders: ['GOOGLE'] } });
    await relogin(ctx, u.email); // password sign-in still works
  });

  it('claiming an unconfirmed account removes the squatter password and sessions', async () => {
    const squatter = await signUp(ctx, { name: 'Squatter', verified: false });
    const r = await social({ provider: 'google', idToken: await googleToken({ sub: 'g-owner', email: squatter.email }) }).expect(200);
    expect(r.body.data.user).toMatchObject({ id: squatter.userId, emailVerified: true, hasPassword: false });
    await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: squatter.refreshToken }).expect(401);
    await ctx.http.post('/api/v1/auth/login').send({ email: squatter.email, password: 'Passw0rd!x' }).expect(401);
  });

  it('Apple: name comes from the app on first sign-in; string email_verified and relay emails work', async () => {
    const t = await appleToken({ sub: '001234.abcd', email: 'x7k2@privaterelay.appleid.com' });
    const r = await social({ provider: 'apple', idToken: t, fullName: 'Mwila Zulu' }).expect(200);
    expect(r.body.data).toMatchObject({ isNewUser: true, user: { email: 'x7k2@privaterelay.appleid.com', fullName: 'Mwila Zulu', linkedProviders: ['APPLE'] } });
    // Later sign-ins carry no name and must not wipe it.
    const again = await social({ provider: 'apple', idToken: await appleToken({ sub: '001234.abcd' }) }).expect(200);
    expect(again.body.data.user.fullName).toBe('Mwila Zulu');
  });

  it('rejects tokens that fail verification', async () => {
    const bad = async (token: string) => expect((await social({ provider: 'google', idToken: token }).expect(401)).body.error.code).toBe('INVALID_ID_TOKEN');
    await bad(await googleToken({ sub: 'x', email: 'a@b.co' }, { aud: 'someone-elses-client' }));
    await bad(await googleToken({ sub: 'x', email: 'a@b.co' }, { iss: 'https://evil.example' }));
    await bad(await googleToken({ sub: 'x', email: 'a@b.co' }, { exp: '-5m' }));
    await bad(await googleToken({ sub: 'x', email: 'a@b.co' }, { key: strangerKey }));
    // An Apple token is not a Google token.
    await bad(await appleToken({ sub: 'x', email: 'a@b.co' }));
    await bad('not-a-jwt-at-all-xxxxxxxxxxxx');
  });

  it('requires a verified email for a new account, and blocks suspended accounts', async () => {
    expect((await social({ provider: 'google', idToken: await googleToken({ sub: 'u1', email: 'u@x.co', email_verified: false }) }).expect(400)).body.error.code).toBe('EMAIL_UNVERIFIED');
    expect((await social({ provider: 'apple', idToken: await appleToken({ sub: 'u2' }) }).expect(400)).body.error.code).toBe('EMAIL_REQUIRED');

    const r = await social({ provider: 'google', idToken: await googleToken({ sub: 'u3', email: 'susp@x.co' }) }).expect(200);
    await ctx.prisma.user.update({ where: { id: r.body.data.user.id }, data: { status: 'SUSPENDED' } });
    expect((await social({ provider: 'google', idToken: await googleToken({ sub: 'u3', email: 'susp@x.co' }) }).expect(401)).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});
