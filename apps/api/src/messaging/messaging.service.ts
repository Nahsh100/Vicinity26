import { Injectable } from '@nestjs/common';
import type { ChatMessage, ConversationSummary, MessageInput } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../common/auth';
import { BadRequest, Forbidden, NotFound } from '../common/errors';
import { decodeCursor, encodeCursor, Page } from '../common/response';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

const conversationInclude = {
  customer: { select: { id: true, fullName: true, avatarMediaId: true, phone: true, status: true } },
  provider: { select: { id: true, userId: true, slug: true, displayName: true, logoMediaId: true, verificationStatus: true, phone: true } },
} satisfies Prisma.ConversationInclude;

/**
 * Customer ↔ provider messaging. A conversation is unique per (customer, provider). Participants are
 * the customer user and the user who owns the provider. Clients poll for new messages; the service is
 * written so a push/SSE transport can be added without changing the data model.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Opens (or returns) the customer's conversation with a provider. */
  async open(user: AuthUser, providerId: string): Promise<ConversationSummary> {
    const p = await this.prisma.provider.findFirst({ where: { id: providerId, status: 'ACTIVE', deletedAt: null } });
    if (!p) throw NotFound('Provider');
    if (p.userId === user.id) throw BadRequest('You cannot message your own business');
    const c = await this.getOrCreate(this.prisma, user.id, providerId);
    return this.summary(c.id, user);
  }

  async getOrCreate(tx: Tx, customerId: string, providerId: string) {
    return tx.conversation.upsert({
      where: { customerId_providerId: { customerId, providerId } },
      create: { customerId, providerId },
      update: {},
    });
  }

  async list(user: AuthUser, q: { cursor?: string; limit: number; filter?: 'all' | 'unread' | 'bookings' }): Promise<Page<ConversationSummary>> {
    const c = decodeCursor<{ t: string; id: string }>(q.cursor);
    const mine: Prisma.ConversationWhereInput = {
      OR: [{ customerId: user.id }, ...(user.providerId ? [{ providerId: user.providerId }] : [])],
    };
    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [
          mine,
          { messages: { some: {} } },
          ...(q.filter === 'bookings' ? [{ bookings: { some: { status: { in: ['REQUESTED', 'RESCHEDULE_PROPOSED', 'CONFIRMED'] as ('REQUESTED' | 'RESCHEDULE_PROPOSED' | 'CONFIRMED')[] } } } }] : []),
          ...(c ? [{ OR: [{ lastMessageAt: { lt: new Date(c.t) } }, { lastMessageAt: new Date(c.t), id: { lt: c.id } }] }] : []),
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: conversationInclude,
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    let items = await Promise.all(page.map((r) => this.toSummary(r, user)));
    if (q.filter === 'unread') items = items.filter((i) => i.unreadCount > 0);
    const last = page[page.length - 1];
    return new Page(items, hasMore && last ? encodeCursor({ t: last.lastMessageAt.toISOString(), id: last.id }) : null);
  }

  async summary(id: string, user: AuthUser): Promise<ConversationSummary> {
    const r = await this.prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
    if (!r) throw NotFound('Conversation');
    this.assertParticipant(r, user);
    return this.toSummary(r, user);
  }

  async messages(id: string, user: AuthUser, q: { cursor?: string; limit: number; after?: string }) {
    const conv = await this.prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
    if (!conv) throw NotFound('Conversation');
    this.assertParticipant(conv, user);
    const c = decodeCursor<{ t: string; id: string }>(q.cursor);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(q.after ? { createdAt: { gt: new Date(q.after) } } : {}),
        ...(c ? { OR: [{ createdAt: { lt: new Date(c.t) } }, { createdAt: new Date(c.t), id: { lt: c.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: { media: true, sender: { select: { fullName: true } } },
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    const items: ChatMessage[] = page.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      media: m.media && m.media.status === 'READY' ? this.media.ref(m.media) : null,
      bookingId: m.bookingId,
      mine: m.senderId === user.id,
      senderName: m.sender?.fullName ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
    return new Page(items, hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null);
  }

  async send(id: string, user: AuthUser, input: MessageInput & { body: string }) {
    const conv = await this.prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
    if (!conv) throw NotFound('Conversation');
    const role = this.assertParticipant(conv, user);
    if (input.mediaId) await this.media.assertUsable(user.id, [input.mediaId], ['LISTING', 'PORTFOLIO', 'REVIEW', 'PROVIDER_GALLERY']);
    const recent = await this.prisma.message.count({ where: { senderId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= 30) throw BadRequest('You are sending messages too quickly', 'RATE_LIMITED');

    const body = input.body.trim();
    const msg = await this.post(this.prisma, id, { senderId: user.id, kind: input.mediaId ? 'IMAGE' : 'TEXT', body: body || 'Photo', mediaId: input.mediaId ?? null });
    // Sending implies having read the thread.
    await this.prisma.conversation.update({ where: { id }, data: role === 'CUSTOMER' ? { customerLastReadAt: new Date() } : { providerLastReadAt: new Date() } });

    const recipientId = role === 'CUSTOMER' ? conv.provider.userId : conv.customerId;
    const senderName = role === 'CUSTOMER' ? conv.customer.fullName : conv.provider.displayName;
    await this.notifications.notify(recipientId, {
      category: 'MESSAGE',
      title: senderName,
      body: body ? body.slice(0, 140) : 'Sent a photo',
      data: { type: 'message', conversationId: id },
      // One alert per conversation per 5 minutes; the unread badge still counts every message.
      dedupeKey: `msg:${id}:${Math.floor(Date.now() / 300_000)}`,
    });
    return { id: msg.id, createdAt: msg.createdAt.toISOString() };
  }

  /** Writes a message and bumps the conversation. Used for user messages and booking system events. */
  async post(tx: Tx, conversationId: string, m: { senderId: string | null; kind: 'TEXT' | 'IMAGE' | 'SYSTEM'; body: string; mediaId?: string | null; bookingId?: string | null }) {
    const msg = await tx.message.create({
      data: { conversationId, senderId: m.senderId, kind: m.kind, body: m.body.slice(0, 2000), mediaId: m.mediaId ?? null, bookingId: m.bookingId ?? null },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: msg.createdAt, lastMessagePreview: m.body.slice(0, 140) },
    });
    return msg;
  }

  async markRead(id: string, user: AuthUser) {
    const conv = await this.prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
    if (!conv) throw NotFound('Conversation');
    const role = this.assertParticipant(conv, user);
    await this.prisma.conversation.update({ where: { id }, data: role === 'CUSTOMER' ? { customerLastReadAt: new Date() } : { providerLastReadAt: new Date() } });
    return { read: true };
  }

  async unreadTotal(user: AuthUser) {
    const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Message" m
        JOIN "Conversation" c ON c."id" = m."conversationId"
       WHERE m."kind" <> 'SYSTEM' AND m."senderId" IS DISTINCT FROM ${user.id}::uuid
         AND (
              (c."customerId" = ${user.id}::uuid AND m."createdAt" > coalesce(c."customerLastReadAt", 'epoch'))
           ${user.providerId ? Prisma.sql`OR (c."providerId" = ${user.providerId}::uuid AND m."createdAt" > coalesce(c."providerLastReadAt", 'epoch'))` : Prisma.empty}
         )`;
    return { count: n };
  }

  // ───────── helpers ─────────

  private assertParticipant(c: { customerId: string; provider: { userId: string } }, user: AuthUser): 'CUSTOMER' | 'PROVIDER' {
    if (c.customerId === user.id) return 'CUSTOMER';
    if (c.provider.userId === user.id) return 'PROVIDER';
    throw Forbidden('You are not part of this conversation');
  }

  private async toSummary(r: Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>, user: AuthUser): Promise<ConversationSummary> {
    const role = r.customerId === user.id ? 'CUSTOMER' : 'PROVIDER';
    const lastRead = role === 'CUSTOMER' ? r.customerLastReadAt : r.providerLastReadAt;
    const [unreadCount, booking] = await Promise.all([
      this.prisma.message.count({ where: { conversationId: r.id, kind: { not: 'SYSTEM' }, senderId: { not: user.id }, createdAt: { gt: lastRead ?? new Date(0) } } }),
      this.prisma.booking.findFirst({
        where: { conversationId: r.id, status: { in: ['REQUESTED', 'RESCHEDULE_PROPOSED', 'CONFIRMED'] } },
        orderBy: { scheduledAt: 'asc' },
        include: { listing: { select: { title: true } } },
      }),
    ]);
    const counterpart =
      role === 'CUSTOMER'
        ? {
            id: r.provider.id,
            name: r.provider.displayName,
            avatarUrl: this.media.url(r.provider.logoMediaId),
            verified: r.provider.verificationStatus === 'VERIFIED',
            providerSlug: r.provider.slug,
            phone: r.provider.phone || null,
          }
        : {
            id: r.customer.id,
            name: r.customer.status === 'DELETED' ? 'Deleted user' : r.customer.fullName,
            avatarUrl: this.media.url(r.customer.avatarMediaId),
            verified: false,
            providerSlug: null,
            phone: r.customer.phone,
          };
    return {
      id: r.id,
      myRole: role,
      counterpart,
      lastMessageAt: r.lastMessageAt.toISOString(),
      lastMessagePreview: r.lastMessagePreview,
      unreadCount,
      activeBooking: booking
        ? { id: booking.id, title: booking.listing?.title ?? 'Booking', scheduledAt: booking.scheduledAt.toISOString(), status: booking.status }
        : null,
    };
  }
}
