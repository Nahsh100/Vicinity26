import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { PaymentSummary } from '@vicinity/shared';
import type { z } from 'zod';
import type { planCheckoutSchema } from '@vicinity/shared';
import { Prisma, type Payment, type SubscriptionPlan } from '../generated/prisma/client';
import type { AuthUser } from '../common/auth';
import { BadRequest, Conflict, Forbidden, NotFound } from '../common/errors';
import { num } from '../common/util';
import { env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_GATEWAY, WebhookSignatureError, type GatewayEvent, type PaymentGateway } from './gateway';
import { lencoOperatorForPhone } from './lenco.gateway';

type PaymentRow = Payment & { plan: Pick<SubscriptionPlan, 'code' | 'name'> | null };
const DAY = 86_400_000;
/** A client polling GET /payments/:id triggers at most one gateway lookup per payment in this window. */
const LOOKUP_INTERVAL_MS = 10_000;

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCMonth(r.getUTCMonth() + months);
  // 31 Jan + 1 month → 28/29 Feb, not 3 Mar.
  if (r.getUTCDate() < day) r.setUTCDate(0);
  return r;
}

const maskPhone = (p: string | null) => (p ? `${p.replace(/^\+260/, '0').slice(0, 3)}•••${p.slice(-4)}` : null);
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Plan purchases with mobile money (Lenco), following the TUMA payments design:
 * 1. A Payment row is committed first (PENDING, one per provider), then the gateway is called
 *    outside the transaction. The payer approves a USSD prompt on their phone.
 * 2. The outcome arrives as a signed webhook (stored once in PaymentEvent) or is found by a
 *    status lookup. Both paths go through `applyOutcome`, which locks the row and applies the
 *    purchase exactly once (`appliedAt`). The client never decides success.
 * 3. Unanswered prompts expire after PAYMENT_TTL_MINUTES; a late success is still honoured.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_GATEWAY) readonly gateway: PaymentGateway,
  ) {}

  get available(): boolean {
    return this.gateway.name !== 'none';
  }

  toDto(p: PaymentRow): PaymentSummary {
    return {
      id: p.id,
      purpose: p.purpose as PaymentSummary['purpose'],
      status: p.status,
      amount: num(p.amount) ?? 0,
      currency: p.currency,
      gateway: p.gateway,
      simulated: p.gateway === 'simulator',
      plan: p.plan ? { code: p.plan.code, name: p.plan.name } : null,
      months: p.months,
      payerPhone: maskPhone(p.payerPhone),
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
      succeededAt: p.succeededAt?.toISOString() ?? null,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    };
  }

  private find(id: string) {
    return this.prisma.payment.findUnique({ where: { id }, include: { plan: { select: { code: true, name: true } } } });
  }

  async pendingFor(providerId: string): Promise<PaymentSummary | null> {
    const p = await this.prisma.payment.findFirst({ where: { providerId, status: 'PENDING' }, include: { plan: { select: { code: true, name: true } } } });
    return p ? this.toDto(p) : null;
  }

  // ── Checkout ──

  async checkoutPlan(user: AuthUser, input: z.output<typeof planCheckoutSchema>): Promise<PaymentSummary> {
    if (!this.available) throw Conflict('Online payments are not available yet', 'PAYMENTS_UNAVAILABLE');
    if (!user.providerId) throw Forbidden('Create a provider profile first');
    const providerId = user.providerId;
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: input.planCode.toUpperCase() } });
    const price = num(plan?.priceMonthly) ?? 0;
    if (!plan || !plan.isActive || price <= 0) throw BadRequest('That plan cannot be purchased', 'INVALID_PLAN');
    if (this.gateway.name === 'lenco' && !lencoOperatorForPhone(input.phone)) throw BadRequest('Enter an MTN, Airtel or Zamtel number', 'UNSUPPORTED_NETWORK');

    // Downgrades wait for the current period to end (paid time is never silently lost).
    const current = await this.activeSubscription(providerId);
    if (current && current.planId !== plan.id && (num(current.plan.priceMonthly) ?? 0) > price) {
      throw BadRequest(`You can switch to ${plan.name} after your ${current.plan.name} plan ends on ${current.currentPeriodEnd.toISOString().slice(0, 10)}.`, 'DOWNGRADE_NOT_ALLOWED');
    }

    const open = await this.prisma.payment.findFirst({ where: { providerId, status: 'PENDING' }, include: { plan: { select: { code: true, name: true } } } });
    if (open) {
      // A double tap returns the same payment; anything else must wait or cancel it first.
      if (open.planId === plan.id && open.months === input.months && open.payerPhone === input.phone) return this.toDto(open);
      throw Conflict('A payment is already waiting for approval. Approve or cancel it first.', 'PAYMENT_IN_PROGRESS');
    }

    let payment: Payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            providerId,
            payerId: user.id,
            amount: money(price * input.months),
            currency: plan.currency,
            gateway: this.gateway.name,
            purpose: 'SUBSCRIPTION',
            method: 'MOBILE_MONEY',
            payerPhone: input.phone,
            planId: plan.id,
            months: input.months,
            expiresAt: new Date(Date.now() + env().PAYMENT_TTL_MINUTES * 60_000),
          },
        });
        // The gateway reference is our own id (Lenco looks collections up by the reference we send).
        return tx.payment.update({ where: { id: created.id }, data: { gatewayRef: created.id } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw Conflict('A payment is already waiting for approval. Approve or cancel it first.', 'PAYMENT_IN_PROGRESS');
      }
      throw e;
    }

    // External call after commit, never inside a DB transaction.
    try {
      const res = await this.gateway.createCollection({
        reference: payment.id,
        amount: num(payment.amount)!,
        currency: 'ZMW',
        payerPhone: input.phone,
        description: `Vicinity ${plan.name} plan, ${input.months} month${input.months > 1 ? 's' : ''}`,
      });
      if (res.status === 'FAILED') await this.fail(payment.id, 'The payment could not be started. Check the number and try again.');
    } catch (err) {
      this.logger.warn(`Gateway rejected collection ${payment.id}: ${(err as Error).message}`);
      await this.fail(payment.id, 'The payment could not be started. Check the number and try again.');
    }
    return this.toDto((await this.find(payment.id))!);
  }

  private async fail(id: string, reason: string) {
    await this.prisma.payment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: reason } });
  }

  private activeSubscription(providerId: string) {
    return this.prisma.providerSubscription.findFirst({
      where: { providerId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: new Date() } },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
  }

  // ── Reads ──

  private canSee(user: AuthUser, p: Payment) {
    return p.payerId === user.id || p.providerId === user.providerId || user.adminPermissions.has('monetization.manage');
  }

  async get(user: AuthUser, id: string): Promise<PaymentSummary> {
    let p = await this.find(id);
    if (!p || !this.canSee(user, p)) throw NotFound('Payment');
    // The payer's app polls this while they approve the prompt: look the status up (rate-limited)
    // so the screen settles even before or without a webhook.
    if (p.status === 'PENDING' && p.gateway === this.gateway.name && (!p.lastCheckedAt || Date.now() - p.lastCheckedAt.getTime() > LOOKUP_INTERVAL_MS)) {
      await this.lookup(p);
      p = (await this.find(id))!;
    }
    return this.toDto(p);
  }

  async mine(user: AuthUser): Promise<PaymentSummary[]> {
    if (!user.providerId) return [];
    const rows = await this.prisma.payment.findMany({
      where: { providerId: user.providerId },
      include: { plan: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toDto(r));
  }

  async cancel(user: AuthUser, id: string): Promise<PaymentSummary> {
    const p = await this.find(id);
    if (!p || !this.canSee(user, p)) throw NotFound('Payment');
    if (p.status !== 'PENDING') throw Conflict('Only a payment waiting for approval can be cancelled', 'NOT_PENDING');
    await this.prisma.payment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CANCELLED', failureReason: 'Cancelled before approval' } });
    // If the payer approves the prompt anyway, the late success is still applied (applyOutcome).
    return this.toDto((await this.find(id))!);
  }

  async adminList(status?: string): Promise<(PaymentSummary & { provider: { id: string; displayName: string; slug: string }; applied: boolean })[]> {
    const rows = await this.prisma.payment.findMany({
      where: status ? { status: status as Payment['status'] } : {},
      include: { plan: { select: { code: true, name: true } }, provider: { select: { id: true, displayName: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({ ...this.toDto(r), provider: r.provider, applied: !!r.appliedAt }));
  }

  async adminRefresh(id: string): Promise<PaymentSummary> {
    const p = await this.find(id);
    if (!p) throw NotFound('Payment');
    if (['PENDING', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(p.status) && p.gateway === this.gateway.name) await this.lookup(p, true);
    return this.toDto((await this.find(id))!);
  }

  // ── Outcomes ──

  /** Server-side status lookup. Never throws: a gateway outage just leaves the payment pending. */
  private async lookup(p: Payment, force = false): Promise<void> {
    await this.prisma.payment.update({ where: { id: p.id }, data: { lastCheckedAt: new Date() } });
    try {
      const s = await this.gateway.getStatus(p.gatewayRef ?? p.id);
      if (s.status === 'SUCCEEDED') await this.applyOutcome(p.gatewayRef ?? p.id, 'SUCCEEDED', {});
      else if (s.status === 'FAILED') await this.applyOutcome(p.gatewayRef ?? p.id, 'FAILED', { reason: s.reason });
      else if (!force && p.status === 'PENDING' && p.expiresAt && p.expiresAt < new Date()) {
        await this.prisma.payment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'EXPIRED', failureReason: 'The approval prompt was not answered in time' } });
      }
    } catch (err) {
      this.logger.warn(`Status lookup failed for ${p.id}: ${(err as Error).message}`);
    }
  }

  /** Verifies, stores once, applies. Returns false for duplicates and ignorable events. */
  async ingest(gatewayName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    if (gatewayName !== this.gateway.name) throw new WebhookSignatureError('Unknown gateway');
    let event: GatewayEvent | null;
    try {
      event = this.gateway.verifyWebhook(rawBody, headers);
    } catch (err) {
      this.logger.warn(`Rejected ${gatewayName} webhook: ${(err as Error).message}`);
      throw err;
    }
    if (!event) return false;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "PaymentEvent" (gateway, "eventId", type, "gatewayRef", payload)
      VALUES (${gatewayName}, ${event.eventId}, ${event.type}, ${event.reference}, ${JSON.stringify(event)}::jsonb)
      ON CONFLICT (gateway, "eventId") DO NOTHING RETURNING id`;
    let eventRowId = rows[0]?.id;
    if (!eventRowId) {
      const existing = await this.prisma.paymentEvent.findUnique({ where: { gateway_eventId: { gateway: gatewayName, eventId: event.eventId } } });
      if (!existing || existing.processedAt) return false; // processed replay: acknowledge, no side effects
      eventRowId = existing.id;
    }
    try {
      await this.applyOutcome(event.reference, event.type === 'collection.succeeded' ? 'SUCCEEDED' : 'FAILED', {
        amount: event.amount,
        currency: event.currency,
        reason: event.reason,
      });
      await this.prisma.paymentEvent.update({ where: { id: eventRowId }, data: { processedAt: new Date(), error: null } });
      return true;
    } catch (err) {
      await this.prisma.paymentEvent.update({ where: { id: eventRowId }, data: { error: String((err as Error).message).slice(0, 500) } });
      throw err;
    }
  }

  /**
   * The single place a payment's outcome is applied. Locks the row; idempotent through
   * `appliedAt`; a success that arrives after expiry or cancellation is still honoured (the
   * payer's money moved). An amount mismatch is recorded for review and not applied.
   */
  async applyOutcome(reference: string, outcome: 'SUCCEEDED' | 'FAILED', o: { amount?: number; currency?: string; reason?: string }): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Payment" WHERE gateway = ${this.gateway.name} AND "gatewayRef" = ${reference} FOR UPDATE`;
      if (!locked[0]) {
        this.logger.warn(`Outcome for unknown payment reference ${reference} ignored`);
        return null;
      }
      const p = await tx.payment.findUniqueOrThrow({ where: { id: locked[0].id }, include: { plan: true } });
      if (outcome === 'FAILED') {
        if (p.status !== 'PENDING') return null;
        await tx.payment.update({ where: { id: p.id }, data: { status: 'FAILED', failureReason: friendlyFailure(o.reason) } });
        return { kind: 'failed' as const, p };
      }
      if (p.appliedAt) return null;
      const expected = num(p.amount)!;
      if ((o.amount !== undefined && Math.abs(o.amount - expected) > 0.005) || (o.currency && o.currency !== p.currency)) {
        await tx.payment.update({
          where: { id: p.id },
          data: { status: 'SUCCEEDED', succeededAt: p.succeededAt ?? new Date(), failureReason: `Paid ${o.currency ?? ''} ${o.amount} but ${p.currency} ${expected} was expected: needs review` },
        });
        this.logger.error(`Amount mismatch on payment ${p.id}: got ${o.amount} ${o.currency}, expected ${expected} ${p.currency}`);
        return null;
      }
      const until = p.purpose === 'SUBSCRIPTION' ? await this.extendSubscription(tx, p) : null;
      await tx.payment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED', succeededAt: p.succeededAt ?? new Date(), appliedAt: new Date(), failureReason: null } });
      return { kind: 'succeeded' as const, p, until };
    });
    if (!result?.p.payerId) return;
    const planName = result.p.plan?.name ?? 'plan';
    if (result.kind === 'succeeded') {
      await this.notifications.notify(result.p.payerId, {
        category: 'ACCOUNT',
        title: 'Payment received',
        body: `Your ${planName} plan is active${result.until ? ` until ${result.until.toISOString().slice(0, 10)}` : ''}. Thank you!`,
        data: { type: 'payment', id: result.p.id },
        dedupeKey: `payment:${result.p.id}:ok`,
      });
    } else {
      await this.notifications.notify(result.p.payerId, {
        category: 'ACCOUNT',
        title: 'Payment not completed',
        body: `Your ${planName} payment did not go through. You have not been charged; you can try again.`,
        data: { type: 'payment', id: result.p.id },
        dedupeKey: `payment:${result.p.id}:failed`,
      });
    }
  }

  /**
   * Same plan: the period is extended. Upgrade: the new plan starts now and the unused value of
   * the old plan is converted into extra days on the new one. Returns the new period end.
   */
  private async extendSubscription(tx: Prisma.TransactionClient, p: Payment & { plan: SubscriptionPlan | null }): Promise<Date> {
    if (!p.plan || !p.months) throw new Error(`Payment ${p.id} has no plan`);
    const now = new Date();
    const current = await tx.providerSubscription.findFirst({
      where: { providerId: p.providerId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (current && current.planId === p.plan.id) {
      const end = addMonths(current.currentPeriodEnd, p.months);
      await tx.providerSubscription.update({ where: { id: current.id }, data: { currentPeriodEnd: end, status: 'ACTIVE', cancelAtPeriodEnd: false } });
      return end;
    }
    let end = addMonths(now, p.months);
    if (current) {
      const oldDaily = (num(current.plan.priceMonthly) ?? 0) / 30;
      const newDaily = (num(p.plan.priceMonthly) ?? 0) / 30;
      const leftoverDays = (current.currentPeriodEnd.getTime() - now.getTime()) / DAY;
      if (oldDaily > 0 && newDaily > 0 && leftoverDays > 0) end = new Date(end.getTime() + Math.floor((leftoverDays * oldDaily) / newDaily) * DAY);
      await tx.providerSubscription.update({ where: { id: current.id }, data: { status: 'CANCELLED', currentPeriodEnd: now } });
    }
    await tx.providerSubscription.create({ data: { providerId: p.providerId, planId: p.plan.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end } });
    return end;
  }

  /** Backstop for missed webhooks: look up pending payments and expire unanswered prompts. */
  @Cron('30 * * * * *', { name: 'payments-reconcile' })
  async reconcile(): Promise<void> {
    if (!this.available) return;
    const cutoff = new Date(Date.now() - 60_000);
    const pending = await this.prisma.payment.findMany({
      where: { status: 'PENDING', gateway: this.gateway.name, createdAt: { lt: cutoff }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    for (const p of pending) await this.lookup(p);
  }
}

function friendlyFailure(reason?: string): string {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('insufficient')) return 'Not enough balance on the mobile money account';
  if (r.includes('timeout') || r.includes('expired')) return 'The approval prompt timed out';
  if (r.includes('cancel') || r.includes('declin') || r.includes('reject')) return 'The payment was declined on the phone';
  return reason ? `The payment did not go through (${reason.slice(0, 120)})` : 'The payment did not go through';
}
