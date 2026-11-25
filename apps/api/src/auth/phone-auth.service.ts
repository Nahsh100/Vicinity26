import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../common/audit.service';
import { AuthGuard } from '../common/auth';
import { Conflict, NotFound, Unauthorized, Unavailable } from '../common/errors';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { meSelect, toCurrentUser } from '../users/user.mapper';
import { MediaService } from '../media/media.service';
import { AuthService } from './auth.service';
import { OTP_POLICY, OtpService, type OtpPurpose } from './otp.service';
import { SMS_TRANSPORT, type SendResult, type SmsTransport } from './sms';

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/**
 * Phone sign-in with SMS codes, following the TUMA platform's design:
 * - one routine issues and delivers a code and records every delivery attempt (never the code);
 * - a code that could not be delivered is invalidated rather than left live;
 * - the start endpoint never reveals whether a number has an account;
 * - the first successful sign-in with a new number creates the account (the app then asks for a name).
 */
@Injectable()
export class PhoneAuthService {
  private readonly logger = new Logger('PhoneAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly guard: AuthGuard,
    private readonly media: MediaService,
    @Inject(SMS_TRANSPORT) private readonly sms: SmsTransport,
  ) {}

  get enabled(): boolean {
    return env().PHONE_OTP_AUTH;
  }

  /** Absent rather than forbidden when switched off, so a misconfigured deployment cannot be probed. */
  assertEnabled() {
    if (!this.enabled) throw NotFound();
  }

  private async issueAndDeliver(purpose: OtpPurpose, phone: string, userId: string | null, ip?: string) {
    const issued = await this.otp.issue({ purpose, phone, userId, ip });
    const text = `Your Vicinity ${purpose === 'LOGIN' ? 'sign-in' : 'verification'} code is ${issued.code}. It expires in ${OTP_POLICY.ttlSeconds / 60} minutes. Never share it.`;
    // Android's SMS Retriever matches a message that *ends* with the app hash.
    const body = env().SMS_APP_HASH ? `${text}\n${env().SMS_APP_HASH}` : text;
    let result: SendResult;
    try {
      result = await this.sms.send(phone, body);
    } catch (err) {
      result = { status: 'FAILED', error: err instanceof Error ? err.message : 'unknown' };
    }
    await this.prisma.otpDelivery
      .create({ data: { challengeId: issued.challengeId, channel: 'SMS', status: result.status, providerMessageId: result.providerMessageId ?? null, error: result.error ?? null } })
      // Losing the record must not lose a message that already went out.
      .catch(() => undefined);
    if (result.status !== 'SENT') {
      this.logger.error(`Could not send a ${purpose} code: ${result.error ?? result.status}`);
      await this.otp.invalidate(purpose, phone);
      throw Unavailable('We could not send your code. Try again in a moment.', 'DELIVERY_FAILED');
    }
    return { sent: true, expiresAt: issued.expiresAt.toISOString(), resendInSeconds: OTP_POLICY.resendCooldownSeconds, codeLength: OTP_POLICY.length, devMode: this.sms.isDevelopment };
  }

  // ── Sign-in / sign-up ──

  async start(phone: string, client: ClientInfo) {
    this.assertEnabled();
    return this.issueAndDeliver('LOGIN', phone, null, client.ip);
  }

  async verify(phone: string, code: string, client: ClientInfo) {
    this.assertEnabled();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const r = await this.otp.verify(tx, { purpose: 'LOGIN', phone }, code);
      if (!r.ok) return { error: OtpService.toError(r) };
      let user = await tx.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } }, select: { id: true, status: true } });
      let isNewUser = false;
      if (!user) {
        user = await tx.user.create({
          // Name is collected right after sign-in (the app shows a "What's your name?" step).
          data: { phone, phoneVerifiedAt: new Date(), fullName: '', notificationPreference: { create: {} } },
          select: { id: true, status: true },
        });
        isNewUser = true;
      }
      return { user, isNewUser };
    });
    // Outside the transaction so a failed guess still counts against the code.
    if ('error' in outcome) throw outcome.error;
    const { user, isNewUser } = outcome;
    if (user.status !== 'ACTIVE') throw Unauthorized('This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: isNewUser ? 'auth.phone_register' : 'auth.phone_login', targetType: 'User', targetId: user.id, ip: client.ip });
    return { ...(await this.auth.issueSession(user.id, client)), isNewUser };
  }

  // ── Adding or changing the sign-in number of a signed-in account ──

  async linkStart(userId: string, phone: string, client: ClientInfo) {
    this.assertEnabled();
    const taken = await this.prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } }, select: { id: true } });
    if (taken) throw Conflict('This number is already used by another Vicinity account', 'PHONE_TAKEN');
    return this.issueAndDeliver('PHONE_VERIFY', phone, userId, client.ip);
  }

  async linkVerify(userId: string, phone: string, code: string) {
    this.assertEnabled();
    try {
      const r = await this.prisma.$transaction(async (tx) => {
        const res = await this.otp.verify(tx, { purpose: 'PHONE_VERIFY', phone, userId }, code);
        if (res.ok) await tx.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: new Date() } });
        return res;
      });
      if (!r.ok) throw OtpService.toError(r);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw Conflict('This number is already used by another Vicinity account', 'PHONE_TAKEN');
      throw e;
    }
    this.guard.invalidate(userId);
    await this.audit.log({ actorId: userId, action: 'auth.phone_verified', targetType: 'User', targetId: userId });
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: meSelect });
    return toCurrentUser(u, this.media);
  }
}
