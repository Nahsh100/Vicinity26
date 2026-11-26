import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuditService } from '../common/audit.service';
import { AuthGuard } from '../common/auth';
import { BadRequest, NotFound, Unauthorized } from '../common/errors';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

export type SocialProvider = 'GOOGLE' | 'APPLE';

export interface VerifiedIdentity {
  provider: SocialProvider;
  /** The provider's stable user id (`sub`). The only thing identities are matched on. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const ISSUERS: Record<SocialProvider, string[]> = {
  GOOGLE: ['https://accounts.google.com', 'accounts.google.com'],
  APPLE: ['https://appleid.apple.com'],
};
const JWKS_URLS: Record<SocialProvider, string> = {
  GOOGLE: 'https://www.googleapis.com/oauth2/v3/certs',
  APPLE: 'https://appleid.apple.com/auth/keys',
};

const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
export const clientIdsFor = (p: SocialProvider) => list(p === 'GOOGLE' ? env().GOOGLE_CLIENT_IDS : env().APPLE_CLIENT_IDS);

/**
 * Verifies Google / Apple ID tokens: RS256 signature against the provider's published keys
 * (fetched and cached by jose), issuer, audience (our client IDs) and expiry.
 */
@Injectable()
export class SocialTokenVerifier {
  private keys: Partial<Record<SocialProvider, JWTVerifyGetKey>> = {};

  /** Tests swap in local keys. */
  useKeys(provider: SocialProvider, keys: JWTVerifyGetKey) {
    this.keys[provider] = keys;
  }

  private keysFor(p: SocialProvider): JWTVerifyGetKey {
    return (this.keys[p] ??= createRemoteJWKSet(new URL(JWKS_URLS[p]), { cooldownDuration: 60_000 }));
  }

  async verify(provider: SocialProvider, idToken: string): Promise<VerifiedIdentity> {
    const audience = clientIdsFor(provider);
    if (!audience.length) throw NotFound();
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(idToken, this.keysFor(provider), { issuer: ISSUERS[provider], audience, algorithms: ['RS256'], clockTolerance: 60 }));
    } catch {
      throw Unauthorized('We could not verify that sign-in. Please try again.', 'INVALID_ID_TOKEN');
    }
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) throw Unauthorized('We could not verify that sign-in. Please try again.', 'INVALID_ID_TOKEN');
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    // Providers send this as a boolean or the string "true".
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : null;
    return { provider, subject: sub, email, emailVerified, name: name || null };
  }
}

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/**
 * Google / Apple sign-in. An identity is matched by (provider, sub). On first use it is linked to
 * the account with the same provider-verified email, or a new account is created.
 *
 * Takeover protection: if the matching account's email was never confirmed, someone may have
 * registered it before the real owner. Proving the email through Google/Apple confirms it and
 * removes the password and sessions set by whoever registered it (the owner can set a new
 * password with "Forgot password").
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger('SocialAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: SocialTokenVerifier,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly guard: AuthGuard,
  ) {}

  async signIn(providerKey: 'google' | 'apple', idToken: string, clientName: string | undefined, client: ClientInfo) {
    const provider: SocialProvider = providerKey === 'google' ? 'GOOGLE' : 'APPLE';
    const id = await this.verifier.verify(provider, idToken);
    const providerLabel = provider === 'GOOGLE' ? 'Google' : 'Apple';

    const result = await this.prisma.$transaction(async (tx) => {
      const linked = await tx.socialIdentity.findUnique({ where: { provider_subject: { provider, subject: id.subject } }, select: { id: true, userId: true } });
      if (linked) {
        await tx.socialIdentity.update({ where: { id: linked.id }, data: { lastUsedAt: new Date() } });
        return { userId: linked.userId, isNewUser: false, linkedNow: false, resetCredentials: false };
      }
      if (!id.email) throw BadRequest(`Your ${providerLabel} account did not share an email address. Sign in with your phone or email instead.`, 'EMAIL_REQUIRED');
      if (!id.emailVerified) throw BadRequest(`Confirm your email with ${providerLabel} first, then try again.`, 'EMAIL_UNVERIFIED');

      const existing = await tx.user.findUnique({ where: { email: id.email }, select: { id: true, emailVerifiedAt: true, status: true } });
      if (existing) {
        const resetCredentials = !existing.emailVerifiedAt;
        await tx.user.update({
          where: { id: existing.id },
          data: resetCredentials ? { emailVerifiedAt: new Date(), passwordHash: null } : {},
        });
        if (resetCredentials) await tx.refreshToken.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.socialIdentity.create({ data: { userId: existing.id, provider, subject: id.subject, email: id.email } });
        return { userId: existing.id, isNewUser: false, linkedNow: true, resetCredentials };
      }

      const user = await tx.user.create({
        data: {
          email: id.email,
          emailVerifiedAt: new Date(),
          // Apple sends the name only to the app (first sign-in); Google puts it in the token.
          fullName: (id.name ?? clientName ?? '').trim().slice(0, 120),
          notificationPreference: { create: {} },
        },
        select: { id: true },
      });
      await tx.socialIdentity.create({ data: { userId: user.id, provider, subject: id.subject, email: id.email } });
      return { userId: user.id, isNewUser: true, linkedNow: true, resetCredentials: false };
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: result.userId }, select: { status: true } });
    if (user.status !== 'ACTIVE') throw Unauthorized('This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
    if (result.resetCredentials) {
      this.guard.invalidate(result.userId);
      this.logger.warn(`Unconfirmed account ${result.userId} claimed via ${providerLabel}: password and sessions removed`);
    }
    await this.prisma.user.update({ where: { id: result.userId }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      actorId: result.userId,
      action: result.isNewUser ? `auth.${providerKey}_register` : result.linkedNow ? `auth.${providerKey}_linked` : `auth.${providerKey}_login`,
      targetType: 'User',
      targetId: result.userId,
      ip: client.ip,
    });
    return { ...(await this.auth.issueSession(result.userId, client)), isNewUser: result.isNewUser };
  }
}
