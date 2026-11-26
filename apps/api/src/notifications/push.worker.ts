import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTEMPTS = 5;
const BATCH = 100;

interface ClaimedRow {
  id: string;
  attempts: number;
  token: string;
  deviceTokenId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  notificationId: string;
  category: string;
}

/**
 * Delivers queued push notifications through Expo's push service.
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so several API instances can run the worker safely.
 * Failed sends retry with exponential backoff; unregistered device tokens are disabled.
 */
@Injectable()
export class PushWorker {
  private readonly logger = new Logger('PushWorker');
  private readonly expo = new Expo({ accessToken: env().EXPO_ACCESS_TOKEN || undefined });
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval('push-deliveries', 5000)
  async tick(): Promise<void> {
    if (this.running || !env().PUSH_ENABLED || env().NODE_ENV === 'test') return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (e) {
      this.logger.error(`push batch failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async processBatch(send: (m: ExpoPushMessage[]) => Promise<ExpoPushTicket[]> = (m) => this.expo.sendPushNotificationsAsync(m)): Promise<number> {
    // Claim a batch: push nextAttemptAt forward as a 2-minute lease so other workers skip these rows.
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      WITH claimed AS (
        SELECT d."id" FROM "NotificationDelivery" d
         WHERE d."status" = 'PENDING' AND d."nextAttemptAt" <= now()
         ORDER BY d."nextAttemptAt"
         LIMIT ${BATCH}
         FOR UPDATE SKIP LOCKED
      )
      UPDATE "NotificationDelivery" d
         SET "attempts" = d."attempts" + 1, "nextAttemptAt" = now() + interval '2 minutes', "updatedAt" = now()
        FROM claimed, "DeviceToken" t, "Notification" n
       WHERE d."id" = claimed."id" AND t."id" = d."deviceTokenId" AND n."id" = d."notificationId"
      RETURNING d."id", d."attempts", t."token", t."id" AS "deviceTokenId", n."id" AS "notificationId", n."title", n."body", n."data", n."category"::text`;
    if (!rows.length) return 0;

    const valid = rows.filter((r) => Expo.isExpoPushToken(r.token));
    const invalid = rows.filter((r) => !Expo.isExpoPushToken(r.token));
    for (const r of invalid) await this.fail(r, 'invalid push token', true);

    for (const chunk of this.expo.chunkPushNotifications(
      // notificationId lets the app mark it read when tapped; channelId matches the channel the app creates.
      valid.map((r) => ({ to: r.token, title: r.title, body: r.body, data: { ...r.data, category: r.category, notificationId: r.notificationId }, sound: 'default' as const, channelId: 'default' })),
    )) {
      const batchRows = valid.splice(0, chunk.length);
      let tickets: ExpoPushTicket[];
      try {
        tickets = await send(chunk);
      } catch (e) {
        for (const r of batchRows) await this.retryOrFail(r, (e as Error).message);
        continue;
      }
      for (let i = 0; i < batchRows.length; i++) {
        const r = batchRows[i]!;
        const t = tickets[i];
        if (t?.status === 'ok') {
          await this.prisma.notificationDelivery.update({ where: { id: r.id }, data: { status: 'SENT', ticketId: t.id, lastError: null } });
        } else if (t?.details?.error === 'DeviceNotRegistered') {
          await this.fail(r, 'DeviceNotRegistered', true);
        } else {
          await this.retryOrFail(r, t?.message ?? 'unknown push error');
        }
      }
    }
    return rows.length;
  }

  /** Every 15 minutes: read Expo receipts for sent tickets and disable tokens Expo reports as gone. */
  @Interval('push-receipts', 15 * 60_000)
  async checkReceipts(): Promise<void> {
    if (!env().PUSH_ENABLED || env().NODE_ENV === 'test') return;
    const sent = await this.prisma.notificationDelivery.findMany({
      where: { status: 'SENT', ticketId: { not: null }, updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      select: { id: true, ticketId: true, deviceTokenId: true },
      take: 1000,
    });
    for (const ids of this.expo.chunkPushNotificationReceiptIds(sent.map((s) => s.ticketId!))) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(ids);
        for (const [ticketId, rec] of Object.entries(receipts)) {
          const row = sent.find((s) => s.ticketId === ticketId);
          if (!row) continue;
          if (rec.status === 'ok') {
            await this.prisma.notificationDelivery.update({ where: { id: row.id }, data: { status: 'DELIVERED' } });
          } else {
            await this.prisma.notificationDelivery.update({ where: { id: row.id }, data: { status: 'FAILED', lastError: rec.message } });
            if (rec.details?.error === 'DeviceNotRegistered') {
              await this.prisma.deviceToken.update({ where: { id: row.deviceTokenId }, data: { disabledAt: new Date() } });
            }
          }
        }
      } catch (e) {
        this.logger.warn(`receipt check failed: ${(e as Error).message}`);
      }
    }
  }

  private async retryOrFail(r: ClaimedRow, error: string) {
    if (r.attempts >= MAX_ATTEMPTS) return this.fail(r, error, false);
    const backoffS = Math.min(3600, 30 * 2 ** (r.attempts - 1));
    await this.prisma.notificationDelivery.update({
      where: { id: r.id },
      data: { status: 'PENDING', lastError: error.slice(0, 300), nextAttemptAt: new Date(Date.now() + backoffS * 1000) },
    });
  }

  private async fail(r: ClaimedRow, error: string, disableToken: boolean) {
    await this.prisma.notificationDelivery.update({ where: { id: r.id }, data: { status: 'FAILED', lastError: error.slice(0, 300) } });
    if (disableToken) {
      await this.prisma.deviceToken.update({ where: { id: r.deviceTokenId }, data: { disabledAt: new Date(), failureCount: { increment: 1 } } });
    }
  }
}
