import { Injectable, Logger } from '@nestjs/common';
import type { AppNotification, NotificationCategory, NotificationPreferences } from '@vicinity/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { NotFound } from '../common/errors';
import { keyset, toPage } from '../common/response';
import { PrismaService } from '../prisma/prisma.service';

/** Always delivered in-app; cannot be switched off. */
const ESSENTIAL: NotificationCategory[] = ['ACCOUNT', 'SYSTEM'];
/** Defaults when the user has not chosen. Promotions are opt-in. */
const DEFAULT_CATEGORIES: Record<NotificationCategory, boolean> = {
  ACCOUNT: true,
  SYSTEM: true,
  BOOKING: true,
  MESSAGE: true,
  ENQUIRY: true,
  REVIEW: true,
  SAVED_PROVIDER: true,
  ORGANIZATION: true,
  DISCOVERY: true,
  PROMOTION: false,
};

export const preferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  categories: z.record(z.string(), z.boolean()).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

export const deviceSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
});

export interface NotifyInput {
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Prevents duplicates: a second notify with the same key for the same user is ignored. */
  dedupeKey?: string;
}

/** Minutes since midnight in Africa/Lusaka (UTC+2, no DST). */
const lusakaMinutes = (d: Date) => ((d.getUTCHours() + 2) % 24) * 60 + d.getUTCMinutes();
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function quietHoursEnd(now: Date, start: string | null, end: string | null): Date | null {
  if (!start || !end) return null;
  const n = lusakaMinutes(now);
  const s = toMin(start);
  const e = toMin(end);
  const inside = s <= e ? n >= s && n < e : n >= s || n < e;
  if (!inside) return null;
  const wait = (e - n + 1440) % 1440;
  return new Date(now.getTime() + wait * 60_000);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  /** Creates an in-app notification and queues push deliveries, respecting the user's preferences. */
  async notify(userId: string, input: NotifyInput): Promise<string | null> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const cats = { ...DEFAULT_CATEGORIES, ...((pref?.categories as Record<string, boolean>) ?? {}) };
    if (!ESSENTIAL.includes(input.category) && cats[input.category] === false) return null;

    let notificationId: string;
    try {
      const n = await this.prisma.notification.create({
        data: {
          userId,
          category: input.category,
          title: input.title.slice(0, 140),
          body: input.body.slice(0, 500),
          data: (input.data ?? {}) as Prisma.InputJsonValue,
          dedupeKey: input.dedupeKey,
        },
        select: { id: true },
      });
      notificationId = n.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      throw e;
    }

    const pushOn = pref?.pushEnabled ?? true;
    if (!pushOn) return notificationId;

    const devices = await this.prisma.deviceToken.findMany({ where: { userId, disabledAt: null }, select: { id: true } });
    if (!devices.length) return notificationId;

    const now = new Date();
    const startOfDay = new Date(now.getTime() - (lusakaMinutes(now) * 60_000));
    const sentToday = await this.prisma.notificationDelivery.count({
      where: { notification: { userId }, status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: startOfDay } },
    });
    const overLimit = !ESSENTIAL.includes(input.category) && sentToday >= (pref?.maxPushPerDay ?? 10);
    const deferUntil = ESSENTIAL.includes(input.category) ? null : quietHoursEnd(now, pref?.quietHoursStart ?? null, pref?.quietHoursEnd ?? null);

    await this.prisma.notificationDelivery.createMany({
      data: devices.map((d) => ({
        notificationId,
        deviceTokenId: d.id,
        status: overLimit ? 'SKIPPED' : 'PENDING',
        lastError: overLimit ? 'daily push limit reached' : null,
        nextAttemptAt: deferUntil ?? now,
      })),
    });
    return notificationId;
  }

  async notifyMany(userIds: string[], input: NotifyInput) {
    for (const id of [...new Set(userIds)]) {
      await this.notify(id, input).catch((e) => this.logger.error(`notify ${id}: ${(e as Error).message}`));
    }
  }

  async list(userId: string, q: { cursor?: string; limit: number; unreadOnly?: boolean; category?: NotificationCategory }) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(q.unreadOnly ? { readAt: null } : {}), ...(q.category ? { category: q.category } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (n): AppNotification => ({
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, string>,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.findFirst({ where: { id, userId } }))) throw NotFound('Notification');
    return { read: true };
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const p = await this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
    return {
      pushEnabled: p.pushEnabled,
      emailEnabled: p.emailEnabled,
      categories: { ...DEFAULT_CATEGORIES, ...(p.categories as Record<NotificationCategory, boolean>) },
      quietHoursStart: p.quietHoursStart,
      quietHoursEnd: p.quietHoursEnd,
    };
  }

  async updatePreferences(userId: string, input: z.infer<typeof preferencesSchema>) {
    const current = await this.getPreferences(userId);
    const categories = { ...current.categories };
    for (const [k, v] of Object.entries(input.categories ?? {})) {
      if (k in DEFAULT_CATEGORIES && !ESSENTIAL.includes(k as NotificationCategory)) {
        categories[k as NotificationCategory] = v;
      }
    }
    await this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        pushEnabled: input.pushEnabled,
        emailEnabled: input.emailEnabled,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        categories,
      },
    });
    return this.getPreferences(userId);
  }

  /** Registers (or re-assigns) a push token. A token belongs to one user at a time. */
  async registerDevice(userId: string, input: z.infer<typeof deviceSchema>) {
    await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform, lastSeenAt: new Date(), disabledAt: null, failureCount: 0 },
    });
    return { registered: true };
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { unregistered: true };
  }
}
