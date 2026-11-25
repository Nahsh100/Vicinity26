import { Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { TooMany, Unprocessable } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;
export type OtpPurpose = 'LOGIN' | 'PHONE_VERIFY';

/** Same policy as TUMA's LOGIN codes. */
export const OTP_POLICY = { length: 6, ttlSeconds: 300, maxAttempts: 5, resendCooldownSeconds: 30 } as const;
/** Codes sent per number, and per IP address, in a 15-minute window (every SMS costs money). */
const PER_PHONE_WINDOW = 5;
const PER_IP_WINDOW = 15;
const WINDOW_MS = 15 * 60_000;

export const randomNumericCode = (length: number) => Array.from({ length }, () => randomInt(0, 10)).join('');
export const hashOtp = (pepper: string, challengeId: string, code: string) => createHmac('sha256', pepper).update(`${challengeId}:${code}`).digest('hex');
const safeEqualHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export type OtpVerifyResult =
  | { ok: true; challengeId: string }
  | { ok: false; code: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_LOCKED' | 'OTP_NOT_FOUND'; attemptsLeft: number };

/**
 * One-time codes, ported from the TUMA platform's OtpService: random, short-lived, attempt-limited,
 * hashed at rest (HMAC with a server pepper and the challenge id), bound to purpose + phone (+ user).
 * The plaintext goes only to the SMS transport and is never stored or logged.
 */
@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  /** Invalidates open codes for the same purpose and number, then issues a new one. Returns the plaintext for delivery only. */
  async issue(input: { purpose: OtpPurpose; phone: string; userId?: string | null; ip?: string | null }) {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_MS);
    const [last, perPhone, perIp] = await Promise.all([
      this.prisma.otpChallenge.findFirst({ where: { purpose: input.purpose, phone: input.phone }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.prisma.otpChallenge.count({ where: { phone: input.phone, createdAt: { gt: since } } }),
      input.ip ? this.prisma.otpChallenge.count({ where: { requestIp: input.ip, createdAt: { gt: since } } }) : Promise.resolve(0),
    ]);
    if (last && now.getTime() - last.createdAt.getTime() < OTP_POLICY.resendCooldownSeconds * 1000) {
      throw TooMany(`Please wait ${OTP_POLICY.resendCooldownSeconds} seconds before requesting another code.`, 'OTP_COOLDOWN');
    }
    if (perPhone >= PER_PHONE_WINDOW || perIp >= PER_IP_WINDOW) throw TooMany('Too many codes requested. Try again in 15 minutes.', 'OTP_RATE_LIMITED');

    return this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: { purpose: input.purpose, phone: input.phone, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      const code = randomNumericCode(OTP_POLICY.length);
      const expiresAt = new Date(now.getTime() + OTP_POLICY.ttlSeconds * 1000);
      const created = await tx.otpChallenge.create({
        data: { purpose: input.purpose, phone: input.phone, userId: input.userId ?? null, codeHash: 'pending', expiresAt, maxAttempts: OTP_POLICY.maxAttempts, requestIp: input.ip ?? null },
        select: { id: true },
      });
      await tx.otpChallenge.update({ where: { id: created.id }, data: { codeHash: hashOtp(env().OTP_PEPPER, created.id, code) } });
      return { challengeId: created.id, code, expiresAt };
    });
  }

  /**
   * Verifies and consumes a code. The row is locked so concurrent guesses cannot exceed the
   * attempt limit. Run inside the transaction that performs the guarded action.
   */
  async verify(tx: Tx, where: { purpose: OtpPurpose; phone: string; userId?: string }, code: string): Promise<OtpVerifyResult> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OtpChallenge"
      WHERE purpose = ${where.purpose}::"OtpPurpose" AND phone = ${where.phone} AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL
      ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`;
    const id = rows[0]?.id;
    if (!id) return { ok: false, code: 'OTP_NOT_FOUND', attemptsLeft: 0 };
    const c = await tx.otpChallenge.findUniqueOrThrow({ where: { id } });
    const now = new Date();
    if (where.userId !== undefined && c.userId !== where.userId) return { ok: false, code: 'OTP_NOT_FOUND', attemptsLeft: 0 };
    if (c.expiresAt <= now) {
      await tx.otpChallenge.update({ where: { id }, data: { invalidatedAt: now } });
      return { ok: false, code: 'OTP_EXPIRED', attemptsLeft: 0 };
    }
    if (c.attempts >= c.maxAttempts) return { ok: false, code: 'OTP_LOCKED', attemptsLeft: 0 };
    const matches = new RegExp(`^\\d{${OTP_POLICY.length}}$`).test(code) && safeEqualHex(c.codeHash, hashOtp(env().OTP_PEPPER, id, code));
    if (!matches) {
      const attempts = c.attempts + 1;
      await tx.otpChallenge.update({ where: { id }, data: { attempts, invalidatedAt: attempts >= c.maxAttempts ? now : null } });
      return { ok: false, code: attempts >= c.maxAttempts ? 'OTP_LOCKED' : 'OTP_INVALID', attemptsLeft: Math.max(0, c.maxAttempts - attempts) };
    }
    await tx.otpChallenge.update({ where: { id }, data: { consumedAt: now, attempts: c.attempts + 1 } });
    return { ok: true, challengeId: id };
  }

  async invalidate(purpose: OtpPurpose, phone: string) {
    await this.prisma.otpChallenge.updateMany({ where: { purpose, phone, consumedAt: null, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
  }

  static toError(r: Exclude<OtpVerifyResult, { ok: true }>) {
    switch (r.code) {
      case 'OTP_EXPIRED':
        return Unprocessable('This code has expired. Request a new one.', 'OTP_EXPIRED');
      case 'OTP_LOCKED':
        return Unprocessable('Too many incorrect attempts. Request a new code.', 'OTP_LOCKED');
      case 'OTP_NOT_FOUND':
        return Unprocessable('No active code for this number. Request a new one.', 'OTP_NOT_FOUND');
      default:
        return Unprocessable(`Incorrect code. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left.`, 'OTP_INVALID', { attemptsLeft: [String(r.attemptsLeft)] });
    }
  }
}
