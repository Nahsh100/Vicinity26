import { Injectable } from '@nestjs/common';
import type { ContactEventInput, Enquiry, EnquiryInput, ListingSummary, ProviderSummary } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AuthUser } from '../common/auth';
import { BadRequest, NotFound } from '../common/errors';
import { keyset, Page, toPage } from '../common/response';
import { listingLocationJoin, listingSummaryColumns, toListingSummary, type ListingSummaryRow } from '../listings/listing.queries';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../organizations/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { queryProviderSummaries, toProviderSummary } from '../providers/provider.queries';

@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly access: AccessService,
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────── Favourites ─────────

  async saveProvider(user: AuthUser, providerId: string, notify = true) {
    const p = await this.prisma.provider.findFirst({ where: { id: providerId, status: 'ACTIVE', deletedAt: null }, select: { id: true, userId: true } });
    if (!p) throw NotFound('Provider');
    const existing = await this.prisma.favoriteProvider.findUnique({ where: { userId_providerId: { userId: user.id, providerId } } });
    await this.prisma.favoriteProvider.upsert({
      where: { userId_providerId: { userId: user.id, providerId } },
      create: { userId: user.id, providerId, notify },
      update: { notify },
    });
    if (!existing) await this.analytics.track('FAVORITE', providerId, { userId: user.id, ownerUserId: p.userId });
    return { saved: true, notify };
  }

  async unsaveProvider(user: AuthUser, providerId: string) {
    await this.prisma.favoriteProvider.deleteMany({ where: { userId: user.id, providerId } });
    return { saved: false };
  }

  async saveListing(user: AuthUser, listingId: string) {
    const l = await this.prisma.listing.findFirst({ where: { id: listingId, status: 'ACTIVE', deletedAt: null } });
    if (!l) throw NotFound('Listing');
    const m = await this.access.memberships(user.id);
    if (!this.access.canView(l, m, user.providerId)) throw NotFound('Listing');
    await this.prisma.favoriteListing.upsert({
      where: { userId_listingId: { userId: user.id, listingId } },
      create: { userId: user.id, listingId },
      update: {},
    });
    return { saved: true };
  }

  async unsaveListing(user: AuthUser, listingId: string) {
    await this.prisma.favoriteListing.deleteMany({ where: { userId: user.id, listingId } });
    return { saved: false };
  }

  async savedProviders(user: AuthUser, origin: { lat: number; lng: number } | null): Promise<(ProviderSummary & { notify: boolean })[]> {
    const favs = await this.prisma.favoriteProvider.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    if (!favs.length) return [];
    const rows = await queryProviderSummaries(this.prisma, { ids: favs.map((f) => f.providerId), origin, limit: 200 });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return favs
      .filter((f) => byId.has(f.providerId))
      .map((f) => ({ ...toProviderSummary(byId.get(f.providerId)!, this.media), isSaved: true, notify: f.notify }));
  }

  /** Saved listings the user can still see (visibility re-checked: leaving a group hides its listings). */
  async savedListings(user: AuthUser): Promise<ListingSummary[]> {
    const m = await this.access.memberships(user.id);
    const rows = await this.prisma.$queryRaw<ListingSummaryRow[]>`
      SELECT ${listingSummaryColumns(Prisma.sql`NULL::float`)}
        FROM "FavoriteListing" f
        JOIN "Listing" l ON l."id" = f."listingId"
        ${listingLocationJoin}
       WHERE f."userId" = ${user.id}::uuid AND l."deletedAt" IS NULL AND l."status" = 'ACTIVE' AND p."status" = 'ACTIVE'
         AND ${this.access.visibilitySql(m, user.providerId)}
       ORDER BY f."createdAt" DESC
       LIMIT 200`;
    const ids = new Set(rows.map((r) => r.id));
    return rows.map((r) => toListingSummary(r, this.media, { saved: ids }));
  }

  // ───────── Contact intent ─────────

  /**
   * Records that someone tapped call / WhatsApp / email. No conversation content or phone numbers
   * of the customer are stored; signed-out taps are counted anonymously.
   */
  async recordContact(viewer: AuthUser | undefined, providerId: string, input: ContactEventInput) {
    const p = await this.prisma.provider.findFirst({ where: { id: providerId, status: 'ACTIVE', deletedAt: null }, select: { id: true, userId: true } });
    if (!p) throw NotFound('Provider');
    if (input.listingId) {
      const l = await this.prisma.listing.findFirst({ where: { id: input.listingId, providerId } });
      if (!l) throw BadRequest('Listing does not belong to this provider');
    }
    if (viewer?.id === p.userId) return { recorded: false };
    await this.prisma.contactEvent.create({
      data: { providerId, listingId: input.listingId ?? null, userId: viewer?.id ?? null, channel: input.channel },
    });
    const type = input.channel === 'PHONE' ? 'CONTACT_PHONE' : input.channel === 'WHATSAPP' ? 'CONTACT_WHATSAPP' : input.channel === 'EMAIL' ? 'CONTACT_EMAIL' : null;
    if (type) await this.analytics.track(type, providerId, { listingId: input.listingId, userId: viewer?.id });
    return { recorded: true };
  }

  // ───────── Enquiries ─────────

  async createEnquiry(user: AuthUser, providerId: string, input: EnquiryInput & { contactPhone?: string }) {
    const p = await this.prisma.provider.findFirst({ where: { id: providerId, status: 'ACTIVE', deletedAt: null } });
    if (!p) throw NotFound('Provider');
    if (p.userId === user.id) throw BadRequest('You cannot send an enquiry to yourself');
    let listingTitle: string | null = null;
    if (input.listingId) {
      const l = await this.prisma.listing.findFirst({ where: { id: input.listingId, providerId, status: 'ACTIVE', deletedAt: null } });
      if (!l) throw BadRequest('Listing not found for this provider');
      const m = await this.access.memberships(user.id);
      if (!this.access.canView(l, m, user.providerId)) throw NotFound('Listing');
      listingTitle = l.title;
    }
    const recent = await this.prisma.enquiry.count({ where: { customerId: user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if (recent >= 20) throw BadRequest('You have sent many enquiries recently. Please wait a while.', 'RATE_LIMITED');

    const e = await this.prisma.enquiry.create({
      data: {
        providerId,
        listingId: input.listingId ?? null,
        customerId: user.id,
        message: input.message,
        contactPhone: input.contactPhone || null,
      },
      include: { customer: { select: { fullName: true } } },
    });
    await this.prisma.contactEvent.create({ data: { providerId, listingId: input.listingId ?? null, userId: user.id, channel: 'ENQUIRY' } });
    await this.analytics.track('ENQUIRY', providerId, { listingId: input.listingId, userId: user.id });
    await this.notifications.notify(p.userId, {
      category: 'ENQUIRY',
      title: 'New enquiry',
      body: `${e.customer.fullName}${listingTitle ? ` about "${listingTitle}"` : ''}: ${input.message.slice(0, 120)}`,
      data: { type: 'enquiry', enquiryId: e.id },
      dedupeKey: `enquiry:${e.id}`,
    });
    return { id: e.id, sent: true };
  }

  async providerEnquiries(providerId: string, q: { status?: 'NEW' | 'READ' | 'ARCHIVED'; cursor?: string; limit: number }): Promise<Page<Enquiry>> {
    const rows = await this.prisma.enquiry.findMany({
      where: { providerId, ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { customer: { select: { id: true, fullName: true, avatarMediaId: true } }, listing: { select: { id: true, title: true } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (e) => ({
      id: e.id,
      message: e.message,
      contactPhone: e.contactPhone,
      listing: e.listing,
      customer: { id: e.customer.id, fullName: e.customer.fullName, avatarUrl: this.media.url(e.customer.avatarMediaId) },
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async setEnquiryStatus(providerId: string, id: string, status: 'READ' | 'ARCHIVED') {
    const r = await this.prisma.enquiry.updateMany({ where: { id, providerId }, data: { status } });
    if (!r.count) throw NotFound('Enquiry');
    return { updated: true };
  }

  async myEnquiries(user: AuthUser) {
    const rows = await this.prisma.enquiry.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { provider: { select: { id: true, slug: true, displayName: true, logoMediaId: true } }, listing: { select: { id: true, title: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
      status: e.status,
      listing: e.listing,
      provider: { id: e.provider.id, slug: e.provider.slug, displayName: e.provider.displayName, logoUrl: this.media.url(e.provider.logoMediaId) },
    }));
  }
}
