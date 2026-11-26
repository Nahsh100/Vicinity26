import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { BadRequest, NotFound } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** In-app paths only (e.g. /search, /dashboard/plan), so a broadcast can never link to another site. */
const SAFE_APP_PATH = /^\/(?!\/)[A-Za-z0-9/_\-.?=&%]*$/;
const BATCH = 500;

export const broadcastAudience = z.enum(['ALL', 'CUSTOMERS', 'PROVIDERS', 'USERS']);
export const broadcastSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(300),
    /** SYSTEM: service announcement, reaches everyone. PROMOTION: only users who opted in to promotions. */
    category: z.enum(['SYSTEM', 'PROMOTION']),
    audience: broadcastAudience,
    userIds: z.array(z.string().uuid()).max(500).default([]),
    link: z
      .string()
      .trim()
      .max(200)
      .refine((v) => SAFE_APP_PATH.test(v), { message: 'Use an in-app path such as /search or /dashboard/plan' })
      .optional()
      .or(z.literal('').transform(() => undefined)),
    linkLabel: z.string().trim().max(24).optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((v, ctx) => {
    if (v.audience === 'USERS' && !v.userIds.length) ctx.addIssue({ code: 'custom', path: ['userIds'], message: 'Choose at least one user' });
  });
export type BroadcastInput = z.output<typeof broadcastSchema>;

/**
 * Admin broadcasts. Each recipient gets an ordinary notification through NotificationsService, so
 * their category preferences, push settings, quiet hours and daily limits apply exactly as for any
 * other notification. Sending runs in the background in batches; the dedupe key
 * `broadcast:<id>` makes a resumed send (e.g. after a restart) skip people already notified.
 */
@Injectable()
export class BroadcastService implements OnModuleInit {
  private readonly logger = new Logger('Broadcast');
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Resume broadcasts interrupted by a restart. */
  onModuleInit() {
    void this.prisma.adminBroadcast
      .findMany({ where: { status: 'SENDING' }, select: { id: true } })
      .then((rows) => rows.forEach((r) => void this.deliver(r.id)))
      .catch((e) => this.logger.error(`resume failed: ${(e as Error).message}`));
  }

  private audienceWhere(audience: z.infer<typeof broadcastAudience>, userIds: string[]): Prisma.UserWhereInput {
    const base: Prisma.UserWhereInput = { status: 'ACTIVE', deletedAt: null };
    switch (audience) {
      case 'CUSTOMERS':
        return { ...base, provider: null };
      case 'PROVIDERS':
        return { ...base, provider: { is: { deletedAt: null } } };
      case 'USERS':
        return { ...base, id: { in: userIds } };
      default:
        return base;
    }
  }

  async audienceCount(audience: z.infer<typeof broadcastAudience>, userIds: string[] = []) {
    return { count: await this.prisma.user.count({ where: this.audienceWhere(audience, userIds) }) };
  }

  async create(admin: AuthUser, input: BroadcastInput) {
    const userIds = input.audience === 'USERS' ? [...new Set(input.userIds)] : [];
    const { count } = await this.audienceCount(input.audience, userIds);
    if (!count) throw BadRequest('No active users match this audience', 'EMPTY_AUDIENCE');
    const b = await this.prisma.adminBroadcast.create({
      data: {
        createdById: admin.id,
        title: input.title,
        body: input.body,
        category: input.category,
        audience: input.audience,
        userIds,
        link: input.link ?? null,
        linkLabel: input.linkLabel ?? null,
        recipientCount: count,
      },
    });
    await this.audit.log({
      actorId: admin.id,
      action: 'admin.broadcast',
      targetType: 'AdminBroadcast',
      targetId: b.id,
      metadata: { audience: input.audience, category: input.category, recipients: count, title: input.title },
    });
    void this.deliver(b.id);
    return this.toDto(b);
  }

  /** Sends to every matching user in batches. Safe to call again for the same broadcast. */
  async deliver(id: string): Promise<void> {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      const b = await this.prisma.adminBroadcast.findUnique({ where: { id } });
      if (!b || b.status !== 'SENDING') return;
      const where = this.audienceWhere(b.audience, b.userIds);
      const data: Record<string, string> = { type: 'broadcast', broadcastId: b.id };
      if (b.link) data.link = b.link;
      if (b.linkLabel) data.linkLabel = b.linkLabel;
      let cursor: string | undefined;
      for (;;) {
        const users = await this.prisma.user.findMany({
          where: cursor ? { ...where, id: { ...(where.id as object), gt: cursor } } : where,
          select: { id: true },
          orderBy: { id: 'asc' },
          take: BATCH,
        });
        if (!users.length) break;
        for (const u of users) {
          await this.notifications
            .notify(u.id, { category: b.category, title: b.title, body: b.body, data, dedupeKey: `broadcast:${b.id}` })
            .catch((e) => this.logger.warn(`broadcast ${b.id} → ${u.id}: ${(e as Error).message}`));
        }
        cursor = users[users.length - 1]!.id;
        await this.updateDelivered(b.id);
        if (users.length < BATCH) break;
      }
      await this.updateDelivered(b.id);
      await this.prisma.adminBroadcast.update({ where: { id: b.id }, data: { status: 'SENT', completedAt: new Date() } });
    } catch (e) {
      this.logger.error(`broadcast ${id} failed: ${(e as Error).message}`);
      await this.prisma.adminBroadcast.update({ where: { id }, data: { status: 'FAILED', error: String((e as Error).message).slice(0, 500), completedAt: new Date() } }).catch(() => undefined);
    } finally {
      this.running.delete(id);
    }
  }

  private async updateDelivered(id: string) {
    const delivered = await this.prisma.notification.count({ where: { dedupeKey: `broadcast:${id}` } });
    await this.prisma.adminBroadcast.update({ where: { id }, data: { deliveredCount: delivered } });
  }

  async list() {
    const rows = await this.prisma.adminBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { createdBy: { select: { fullName: true, email: true } } },
    });
    return rows.map((r) => ({ ...this.toDto(r), sentBy: r.createdBy.fullName || r.createdBy.email || 'Admin' }));
  }

  async get(id: string) {
    const r = await this.prisma.adminBroadcast.findUnique({ where: { id } });
    if (!r) throw NotFound('Broadcast');
    return this.toDto(r);
  }

  private toDto(r: Prisma.AdminBroadcastGetPayload<object>) {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category,
      audience: r.audience,
      userCount: r.userIds.length,
      link: r.link,
      linkLabel: r.linkLabel,
      status: r.status,
      recipientCount: r.recipientCount,
      deliveredCount: r.deliveredCount,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    };
  }
}
