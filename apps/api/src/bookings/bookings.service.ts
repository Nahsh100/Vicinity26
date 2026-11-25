import { Injectable } from '@nestjs/common';
import type { Booking, TimeSlot } from '@vicinity/shared';
import { z } from 'zod';
import { bookingRequestSchema } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../common/auth';
import { BadRequest, Conflict, Forbidden, NotFound } from '../common/errors';
import { decodeCursor, encodeCursor, Page } from '../common/response';
import { num } from '../common/util';
import { MediaService } from '../media/media.service';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../organizations/access.service';
import { PrismaService } from '../prisma/prisma.service';

const OPEN = ['REQUESTED', 'RESCHEDULE_PROPOSED', 'CONFIRMED'] as const;
const LUSAKA_OFFSET_MIN = 120; // Africa/Lusaka is UTC+2 all year.
const MIN_LEAD_MIN = 30;
const MAX_AHEAD_DAYS = 90;
const SLOT_STEP_MIN = 30;

const include = {
  listing: { select: { id: true, title: true, priceType: true, price: true } },
  provider: {
    select: {
      id: true,
      userId: true,
      slug: true,
      displayName: true,
      logoMediaId: true,
      phone: true,
      whatsapp: true,
      verificationStatus: true,
      ratingAverage: true,
      ratingCount: true,
      locations: { where: { isPrimary: true }, select: { area: true }, take: 1 },
    },
  },
  customer: { select: { id: true, fullName: true, avatarMediaId: true, phone: true, status: true } },
} satisfies Prisma.BookingInclude;
type Row = Prisma.BookingGetPayload<{ include: typeof include }>;

export function formatLusaka(d: Date): string {
  return d.toLocaleString('en-GB', { timeZone: 'Africa/Lusaka', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Booking requests. Lifecycle:
 *   REQUESTED ─provider accepts─▶ CONFIRMED ─provider completes─▶ COMPLETED
 *       │ provider declines ▶ DECLINED          either party cancels ▶ CANCELLED
 *       └─ either party proposes a new time ▶ RESCHEDULE_PROPOSED ─other party accepts▶ CONFIRMED
 * Every transition posts a system message in the customer↔provider conversation and notifies the other side.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly messaging: MessagingService,
    private readonly notifications: NotificationsService,
    private readonly access: AccessService,
  ) {}

  async create(user: AuthUser, input: z.output<typeof bookingRequestSchema>): Promise<Booking> {
    const provider = await this.prisma.provider.findFirst({ where: { id: input.providerId, status: 'ACTIVE', deletedAt: null } });
    if (!provider) throw NotFound('Provider');
    if (provider.userId === user.id) throw BadRequest('You cannot book your own business');

    const when = new Date(input.scheduledAt);
    if (when.getTime() < Date.now() + MIN_LEAD_MIN * 60_000) throw BadRequest(`Choose a time at least ${MIN_LEAD_MIN} minutes from now`, 'TOO_SOON');
    if (when.getTime() > Date.now() + MAX_AHEAD_DAYS * 86400_000) throw BadRequest(`Bookings can be made up to ${MAX_AHEAD_DAYS} days ahead`, 'TOO_FAR');
    if (input.location === 'AT_CUSTOMER' && provider.serviceMode === 'AT_LOCATION') throw BadRequest('This provider only serves customers at their own location', 'NO_HOME_VISITS');
    if (input.location === 'AT_PROVIDER' && provider.serviceMode === 'MOBILE') throw BadRequest('This provider comes to you: add your address', 'MOBILE_ONLY');

    let duration = 60;
    let listing: { id: string; title: string; price: Prisma.Decimal | null; currency: string } | null = null;
    if (input.listingId) {
      const l = await this.prisma.listing.findFirst({
        where: { id: input.listingId, providerId: provider.id, status: 'ACTIVE', deletedAt: null },
        include: { serviceDetails: true },
      });
      if (!l) throw BadRequest('That service is not available from this provider', 'INVALID_LISTING');
      const m = await this.access.memberships(user.id);
      if (!this.access.canView(l, m, user.providerId)) throw NotFound('Listing');
      if (l.type !== 'SERVICE') throw BadRequest('Products are ordered by contacting the seller, not booked', 'NOT_BOOKABLE');
      duration = Math.min(1440, Math.max(15, l.serviceDetails?.durationMinutes ?? 60));
      listing = l;
    }

    const open = await this.prisma.booking.count({ where: { customerId: user.id, providerId: provider.id, status: { in: [...OPEN] } } });
    if (open >= 5) throw BadRequest('You already have several open bookings with this provider', 'TOO_MANY_OPEN');
    await this.assertNoClash(provider.id, when, duration);

    const booking = await this.prisma.$transaction(async (tx) => {
      const conv = await this.messaging.getOrCreate(tx, user.id, provider.id);
      const b = await tx.booking.create({
        data: {
          customerId: user.id,
          providerId: provider.id,
          listingId: listing?.id ?? null,
          conversationId: conv.id,
          scheduledAt: when,
          durationMinutes: duration,
          location: input.location,
          address: input.location === 'AT_CUSTOMER' ? (input.address ?? null) : null,
          note: input.note || null,
          quotedPrice: listing?.price ?? null,
          currency: listing?.currency ?? 'ZMW',
        },
      });
      await this.messaging.post(tx, conv.id, {
        senderId: null,
        kind: 'SYSTEM',
        body: `Booking requested: ${listing?.title ?? 'Service'} on ${formatLusaka(when)}${input.note ? ` — “${input.note.slice(0, 200)}”` : ''}`,
        bookingId: b.id,
      });
      return b;
    });

    await this.notifications.notify(provider.userId, {
      category: 'BOOKING',
      title: 'New booking request',
      body: `${listing?.title ?? 'A service'} on ${formatLusaka(when)}`,
      data: { type: 'booking', bookingId: booking.id },
      dedupeKey: `booking-req:${booking.id}`,
    });
    return this.get(booking.id, user);
  }

  async list(user: AuthUser, q: { role: 'customer' | 'provider'; scope: 'upcoming' | 'past'; cursor?: string; limit: number }) {
    if (q.role === 'provider' && !user.providerId) throw Forbidden('Create a provider profile first');
    const now = new Date();
    const who: Prisma.BookingWhereInput = q.role === 'provider' ? { providerId: user.providerId! } : { customerId: user.id };
    const scope: Prisma.BookingWhereInput =
      q.scope === 'upcoming'
        ? { status: { in: [...OPEN] }, scheduledAt: { gte: new Date(now.getTime() - 12 * 3600_000) } }
        : { OR: [{ status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] } }, { scheduledAt: { lt: new Date(now.getTime() - 12 * 3600_000) } }] };
    const c = decodeCursor<{ t: string; id: string }>(q.cursor);
    const asc = q.scope === 'upcoming';
    const rows = await this.prisma.booking.findMany({
      where: {
        AND: [
          who,
          scope,
          ...(c
            ? [{ OR: [{ scheduledAt: asc ? { gt: new Date(c.t) } : { lt: new Date(c.t) } }, { scheduledAt: new Date(c.t), id: asc ? { gt: c.id } : { lt: c.id } }] }]
            : []),
        ],
      },
      orderBy: [{ scheduledAt: asc ? 'asc' : 'desc' }, { id: asc ? 'asc' : 'desc' }],
      take: q.limit + 1,
      include,
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    const [upcoming, past] = await Promise.all([
      this.prisma.booking.count({ where: { AND: [who, { status: { in: [...OPEN] }, scheduledAt: { gte: new Date(now.getTime() - 12 * 3600_000) } }] } }),
      this.prisma.booking.count({ where: { AND: [who, { OR: [{ status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] } }, { scheduledAt: { lt: new Date(now.getTime() - 12 * 3600_000) } }] }] } }),
    ]);
    const items = await Promise.all(page.map((r) => this.toBooking(r, user)));
    return new Page(items, hasMore && last ? encodeCursor({ t: last.scheduledAt.toISOString(), id: last.id }) : null, { counts: { upcoming, past } });
  }

  async get(id: string, user: AuthUser): Promise<Booking> {
    const r = await this.prisma.booking.findUnique({ where: { id }, include });
    if (!r) throw NotFound('Booking');
    this.role(r, user);
    return this.toBooking(r, user);
  }

  async accept(id: string, user: AuthUser) {
    const r = await this.load(id);
    const role = this.role(r, user);
    if (r.status === 'REQUESTED') {
      if (role !== 'PROVIDER') throw Forbidden('Only the provider can confirm a booking request');
      await this.assertNoClash(r.providerId, r.scheduledAt, r.durationMinutes, r.id);
      await this.transition(r, user, { status: 'CONFIRMED', confirmedAt: new Date() }, `Booking confirmed for ${formatLusaka(r.scheduledAt)}`, 'Booking confirmed');
    } else if (r.status === 'RESCHEDULE_PROPOSED') {
      if (r.proposedById === user.id) throw BadRequest('Waiting for the other side to accept your proposed time', 'AWAITING_OTHER_PARTY');
      const when = r.proposedScheduledAt!;
      await this.assertNoClash(r.providerId, when, r.durationMinutes, r.id);
      await this.transition(
        r,
        user,
        { status: 'CONFIRMED', scheduledAt: when, proposedScheduledAt: null, proposedById: null, confirmedAt: new Date() },
        `New time accepted: ${formatLusaka(when)}`,
        'New time confirmed',
      );
    } else {
      throw BadRequest('This booking cannot be confirmed now', 'INVALID_STATE');
    }
    return this.get(id, user);
  }

  async decline(id: string, user: AuthUser, reason?: string) {
    const r = await this.load(id);
    const role = this.role(r, user);
    if (r.status === 'REQUESTED') {
      if (role !== 'PROVIDER') throw Forbidden('Only the provider can decline. Cancel your request instead.');
      await this.transition(r, user, { status: 'DECLINED', statusReason: reason || null }, `Booking declined${reason ? `: ${reason}` : ''}`, 'Booking declined');
    } else if (r.status === 'RESCHEDULE_PROPOSED' && r.proposedById !== user.id) {
      // Declining a proposed time keeps the original booking as it was.
      await this.transition(
        r,
        user,
        { status: r.confirmedAt ? 'CONFIRMED' : 'REQUESTED', proposedScheduledAt: null, proposedById: null },
        `Proposed time declined. The booking stays on ${formatLusaka(r.scheduledAt)}`,
        'New time declined',
      );
    } else {
      throw BadRequest('This booking cannot be declined now', 'INVALID_STATE');
    }
    return this.get(id, user);
  }

  async reschedule(id: string, user: AuthUser, scheduledAt: string, reason?: string) {
    const r = await this.load(id);
    this.role(r, user);
    if (!OPEN.includes(r.status as (typeof OPEN)[number])) throw BadRequest('This booking can no longer be changed', 'INVALID_STATE');
    const when = new Date(scheduledAt);
    if (when.getTime() < Date.now() + MIN_LEAD_MIN * 60_000) throw BadRequest(`Choose a time at least ${MIN_LEAD_MIN} minutes from now`, 'TOO_SOON');
    if (when.getTime() > Date.now() + MAX_AHEAD_DAYS * 86400_000) throw BadRequest(`Choose a time within ${MAX_AHEAD_DAYS} days`, 'TOO_FAR');
    await this.transition(
      r,
      user,
      { status: 'RESCHEDULE_PROPOSED', proposedScheduledAt: when, proposedById: user.id, statusReason: reason || null },
      `New time proposed: ${formatLusaka(when)}${reason ? ` — ${reason}` : ''}`,
      'New time proposed',
    );
    return this.get(id, user);
  }

  async cancel(id: string, user: AuthUser, reason?: string) {
    const r = await this.load(id);
    this.role(r, user);
    if (!OPEN.includes(r.status as (typeof OPEN)[number])) throw BadRequest('This booking is already closed', 'INVALID_STATE');
    await this.transition(
      r,
      user,
      { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.id, statusReason: reason || null },
      `Booking cancelled${reason ? `: ${reason}` : ''}`,
      'Booking cancelled',
    );
    return this.get(id, user);
  }

  async complete(id: string, user: AuthUser) {
    const r = await this.load(id);
    if (this.role(r, user) !== 'PROVIDER') throw Forbidden('Only the provider can mark a booking as done');
    if (r.status !== 'CONFIRMED') throw BadRequest('Only confirmed bookings can be completed', 'INVALID_STATE');
    if (r.scheduledAt.getTime() > Date.now()) throw BadRequest('You can mark it done after the scheduled time', 'NOT_YET');
    await this.transition(r, user, { status: 'COMPLETED', completedAt: new Date() }, 'Marked as completed. Thank you for using Vicinity!', 'Booking completed — leave a review');
    return this.get(id, user);
  }

  /** Bookable start times for one day (Africa/Lusaka) from the provider's working hours, minus confirmed bookings. */
  async slots(providerId: string, date: string, listingId?: string): Promise<{ date: string; durationMinutes: number; slots: TimeSlot[] }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw BadRequest('Use the date format YYYY-MM-DD');
    const provider = await this.prisma.provider.findFirst({ where: { id: providerId, status: 'ACTIVE', deletedAt: null }, include: { availability: true } });
    if (!provider) throw NotFound('Provider');
    let duration = 60;
    if (listingId) {
      const sd = await this.prisma.serviceDetails.findUnique({ where: { listingId } });
      duration = Math.min(1440, Math.max(15, sd?.durationMinutes ?? 60));
    }
    // Midnight Lusaka of the requested day, as UTC.
    const dayStartUtc = new Date(`${date}T00:00:00Z`).getTime() - LUSAKA_OFFSET_MIN * 60_000;
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const windows = provider.availability.filter((a) => a.dayOfWeek === dow);
    const busy = await this.prisma.booking.findMany({
      where: { providerId, status: 'CONFIRMED', scheduledAt: { gte: new Date(dayStartUtc - 86400_000), lt: new Date(dayStartUtc + 2 * 86400_000) } },
      select: { scheduledAt: true, durationMinutes: true },
    });
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const slots: TimeSlot[] = [];
    for (const w of windows.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      for (let m = toMin(w.startTime); m + duration <= toMin(w.endTime); m += SLOT_STEP_MIN) {
        const start = dayStartUtc + m * 60_000;
        const end = start + duration * 60_000;
        const clash = busy.some((b) => start < b.scheduledAt.getTime() + b.durationMinutes * 60_000 && b.scheduledAt.getTime() < end);
        slots.push({ start: new Date(start).toISOString(), available: !clash && start >= Date.now() + MIN_LEAD_MIN * 60_000 });
      }
    }
    return { date, durationMinutes: duration, slots };
  }

  // ───────── internals ─────────

  private async load(id: string) {
    const r = await this.prisma.booking.findUnique({ where: { id }, include });
    if (!r) throw NotFound('Booking');
    return r;
  }

  private role(r: Row, user: AuthUser): 'CUSTOMER' | 'PROVIDER' {
    if (r.customerId === user.id) return 'CUSTOMER';
    if (r.provider.userId === user.id) return 'PROVIDER';
    throw NotFound('Booking');
  }

  private async assertNoClash(providerId: string, start: Date, duration: number, exceptId?: string) {
    const end = new Date(start.getTime() + duration * 60_000);
    const [clash] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Booking"
       WHERE "providerId" = ${providerId}::uuid AND "status" = 'CONFIRMED'
         ${exceptId ? Prisma.sql`AND "id" <> ${exceptId}::uuid` : Prisma.empty}
         AND "scheduledAt" < ${end} AND "scheduledAt" + ("durationMinutes" * interval '1 minute') > ${start}
       LIMIT 1`;
    if (clash) throw Conflict('That time is already booked. Choose another slot.', 'SLOT_TAKEN');
  }

  private async transition(r: Row, actor: AuthUser, data: Prisma.BookingUpdateInput, systemText: string, notifyTitle: string) {
    await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency: only apply if the status has not changed since we read it.
      const updated = await tx.booking.updateMany({ where: { id: r.id, status: r.status, updatedAt: r.updatedAt }, data: data as Prisma.BookingUpdateManyMutationInput });
      if (updated.count !== 1) throw Conflict('This booking was just updated. Refresh and try again.', 'STALE_BOOKING');
      const convId = r.conversationId ?? (await this.messaging.getOrCreate(tx, r.customerId, r.providerId)).id;
      if (!r.conversationId) await tx.booking.update({ where: { id: r.id }, data: { conversationId: convId } });
      await this.messaging.post(tx, convId, { senderId: null, kind: 'SYSTEM', body: systemText, bookingId: r.id });
    });
    const recipient = actor.id === r.customerId ? r.provider.userId : r.customerId;
    await this.notifications.notify(recipient, {
      category: 'BOOKING',
      title: notifyTitle,
      body: `${r.listing?.title ?? 'Booking'} · ${systemText}`.slice(0, 200),
      data: { type: 'booking', bookingId: r.id },
    });
  }

  private async toBooking(r: Row, user: AuthUser): Promise<Booking> {
    const role = this.role(r, user);
    const canReview =
      role === 'CUSTOMER' && r.status === 'COMPLETED'
        ? !(await this.prisma.review.findUnique({ where: { authorId_providerId: { authorId: user.id, providerId: r.providerId } }, select: { id: true } }))
        : false;
    return {
      id: r.id,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      durationMinutes: r.durationMinutes,
      location: r.location,
      address: r.address,
      note: r.note,
      quotedPrice: num(r.quotedPrice),
      currency: r.currency,
      proposedScheduledAt: r.proposedScheduledAt?.toISOString() ?? null,
      proposedByMe: !!r.proposedById && r.proposedById === user.id,
      statusReason: r.statusReason,
      listing: r.listing ? { id: r.listing.id, title: r.listing.title, priceType: r.listing.priceType, price: num(r.listing.price) } : null,
      provider: {
        id: r.provider.id,
        slug: r.provider.slug,
        name: r.provider.displayName,
        avatarUrl: this.media.url(r.provider.logoMediaId),
        phone: r.provider.phone || null,
        whatsapp: r.provider.whatsapp,
        verified: r.provider.verificationStatus === 'VERIFIED',
        ratingAverage: num(r.provider.ratingAverage) ?? 0,
        ratingCount: r.provider.ratingCount,
        area: r.provider.locations[0]?.area ?? null,
      },
      customer: {
        id: r.customer.id,
        name: r.customer.status === 'DELETED' ? 'Deleted user' : r.customer.fullName,
        avatarUrl: this.media.url(r.customer.avatarMediaId),
        // The provider sees the customer's phone only for active bookings.
        phone: role === 'PROVIDER' && OPEN.includes(r.status as (typeof OPEN)[number]) ? r.customer.phone : null,
      },
      myRole: role,
      conversationId: r.conversationId,
      canReview,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
