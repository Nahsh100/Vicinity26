import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type { AuthTokens, CurrentUser, LoginInput, RegisterInput } from '@vicinity/shared';
import { env } from '../config/env';
import { AuditService } from '../common/audit.service';
import { AuthGuard, type AccessTokenPayload } from '../common/auth';
import { BadRequest, Conflict, Unauthorized } from '../common/errors';
import { randomToken, sha256 } from '../common/util';
import { MailService } from '../mail/mail.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { meSelect, toCurrentUser } from '../users/user.mapper';

const ARGON = { type: argon2.argon2id as 0 | 1 | 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };
/** Verified against when an email is unknown, so failed logins take the same time either way. */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= argon2.hash('not-a-real-password-0', ARGON));
const VERIFY_TTL_H = 48;
const RESET_TTL_MIN = 30;

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly guard: AuthGuard,
  ) {}

  async register(input: RegisterInput & { phone?: string }, client: ClientInfo) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw Conflict('An account with this email already exists', 'EMAIL_TAKEN');

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        phone: input.phone || null,
        passwordHash: await argon2.hash(input.password, ARGON),
        notificationPreference: { create: {} },
      },
      select: { id: true, email: true, fullName: true },
    });
    await this.sendVerification(user.id, email, user.fullName);
    await this.audit.log({ actorId: user.id, action: 'auth.register', targetType: 'User', targetId: user.id, ip: client.ip });
    return this.issueSession(user.id, client);
  }

  async login(input: LoginInput, client: ClientInfo) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true },
    });
    // Verify against a dummy hash when the user does not exist to keep timing similar.
    const hash = user?.passwordHash ?? (await getDummyHash());
    const ok = await argon2.verify(hash, input.password).catch(() => false);
    if (!user || !ok) throw Unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
    if (user.status !== 'ACTIVE') throw Unauthorized('This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'auth.login', targetType: 'User', targetId: user.id, ip: client.ip });
    return this.issueSession(user.id, client);
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated means it leaked:
   * the whole token family is revoked and the user must sign in again.
   */
  async refresh(refreshToken: string, client: ClientInfo) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!row) throw Unauthorized('Session expired. Sign in again.', 'INVALID_REFRESH_TOKEN');

    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ actorId: row.userId, action: 'auth.refresh_reuse_detected', targetType: 'User', targetId: row.userId, ip: client.ip });
      throw Unauthorized('Session expired. Sign in again.', 'REFRESH_TOKEN_REUSED');
    }
    if (row.expiresAt < new Date()) throw Unauthorized('Session expired. Sign in again.', 'INVALID_REFRESH_TOKEN');

    const user = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { status: true } });
    if (user?.status !== 'ACTIVE') throw Unauthorized('Your account is not active', 'ACCOUNT_INACTIVE');

    return this.prisma.$transaction(async (tx) => {
      // Conditional update guards against two concurrent refreshes with the same token.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) throw Unauthorized('Session expired. Sign in again.', 'REFRESH_TOKEN_REUSED');
      const next = await this.createRefreshToken(row.userId, row.familyId, client, tx);
      await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id } });
      return { ...(await this.accessToken(row.userId)), refreshToken: next.token } satisfies AuthTokens;
    });
  }

  async logout(refreshToken: string | undefined, userId: string) {
    if (refreshToken) {
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
      if (row && row.userId === userId) {
        await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.guard.invalidate(userId);
  }

  async verifyEmail(token: string) {
    const row = await this.consumeEmailToken(token, 'VERIFY_EMAIL');
    await this.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
    return { verified: true };
  }

  async resendVerification(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, fullName: true, emailVerifiedAt: true } });
    if (!u.email) throw BadRequest('Add an email address first', 'NO_EMAIL');
    if (u.emailVerifiedAt) return { sent: false, alreadyVerified: true };
    const recent = await this.prisma.emailToken.count({
      where: { userId, type: 'VERIFY_EMAIL', createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent) throw BadRequest('Please wait a minute before requesting another email', 'TOO_SOON');
    await this.sendVerification(userId, u.email, u.fullName);
    return { sent: true };
  }

  /** Always succeeds, so the endpoint cannot be used to discover which emails have accounts. */
  async forgotPassword(email: string, client: ClientInfo) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, fullName: true, status: true } });
    if (!u || u.status !== 'ACTIVE') return { sent: true };
    const token = await this.createEmailToken(u.id, 'RESET_PASSWORD', RESET_TTL_MIN * 60_000);
    const link = `${env().APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: email,
      subject: 'Reset your Vicinity password',
      text: `Hi ${u.fullName},\n\nUse this link to set a new password. It expires in ${RESET_TTL_MIN} minutes.\n\n${link}\n\nReset code: ${token}\n\nIf you did not ask for this, you can ignore this email.`,
    });
    await this.audit.log({ actorId: u.id, action: 'auth.password_reset_requested', targetType: 'User', targetId: u.id, ip: client.ip });
    return { sent: true };
  }

  async resetPassword(token: string, password: string, client: ClientInfo) {
    const row = await this.consumeEmailToken(token, 'RESET_PASSWORD');
    await this.prisma.user.update({
      where: { id: row.userId },
      // Proving control of the inbox also verifies the email.
      data: { passwordHash: await argon2.hash(password, ARGON), emailVerifiedAt: new Date() },
    });
    await this.logoutAll(row.userId);
    await this.audit.log({ actorId: row.userId, action: 'auth.password_reset', targetType: 'User', targetId: row.userId, ip: client.ip });
    return { reset: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!u.passwordHash) throw BadRequest('Your account signs in with your phone. To add a password, add an email and use Forgot password.', 'NO_PASSWORD');
    if (!(await argon2.verify(u.passwordHash, current))) throw BadRequest('Current password is incorrect', 'INVALID_PASSWORD');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, ARGON) } });
    await this.audit.log({ actorId: userId, action: 'auth.password_changed', targetType: 'User', targetId: userId });
    return { changed: true };
  }


  /** Adds (or replaces an unconfirmed) email on an account, e.g. one created with phone sign-in, and sends a confirmation. */
  async setEmail(userId: string, rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, fullName: true } });
    if (u.email === email) return this.me(userId);
    if (u.email && u.emailVerifiedAt) throw BadRequest('Your email is already confirmed. Contact support to change it.', 'EMAIL_LOCKED');
    const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw Conflict('An account with this email already exists', 'EMAIL_TAKEN');
    await this.prisma.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: null } });
    this.guard.invalidate(userId);
    await this.sendVerification(userId, email, u.fullName || 'there');
    await this.audit.log({ actorId: userId, action: 'auth.email_set', targetType: 'User', targetId: userId });
    return this.me(userId);
  }
  async me(userId: string): Promise<CurrentUser> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: meSelect });
    return toCurrentUser(u, this.media);
  }

  // ─── internals ───

  /** Access + refresh tokens and the current user. Also used by phone sign-in. */
  async issueSession(userId: string, client: ClientInfo) {
    const rt = await this.createRefreshToken(userId, randomUUID(), client);
    const tokens: AuthTokens = { ...(await this.accessToken(userId)), refreshToken: rt.token };
    return { tokens, user: await this.me(userId) };
  }

  private async accessToken(userId: string) {
    const ttl = env().JWT_ACCESS_TTL_SECONDS;
    const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttl });
    return { accessToken, accessTokenExpiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    client: ClientInfo,
    tx: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ) {
    const token = randomToken(48);
    const row = await tx.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86400_000),
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 250),
      },
      select: { id: true },
    });
    return { id: row.id, token };
  }

  private async createEmailToken(userId: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttlMs: number) {
    // Short, typeable codes for mobile; still 2^60 possibilities and single use with expiry.
    const token = randomToken(12);
    await this.prisma.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.emailToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return token;
  }

  private async consumeEmailToken(token: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token.trim()) } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
      throw BadRequest('This link or code is invalid or has expired', 'INVALID_TOKEN');
    }
    const claimed = await this.prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw BadRequest('This link or code has already been used', 'INVALID_TOKEN');
    return row;
  }

  private async sendVerification(userId: string, email: string, name: string) {
    const token = await this.createEmailToken(userId, 'VERIFY_EMAIL', VERIFY_TTL_H * 3600_000);
    const link = `${env().APP_PUBLIC_URL}/verify-email?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: email,
      subject: 'Confirm your email for Vicinity',
      text: `Hi ${name},\n\nWelcome to Vicinity. Confirm your email with this link:\n\n${link}\n\nOr enter this code in the app: ${token}\n\nThe link expires in ${VERIFY_TTL_H} hours.`,
    });
  }
}
