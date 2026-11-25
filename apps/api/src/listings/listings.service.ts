import { Injectable } from '@nestjs/common';
import { listingBaseSchema, refineListing, type ListingDetail, type ListingInput, type ListingSummary } from '@vicinity/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AuthUser } from '../common/auth';
import { BadRequest, NotFound } from '../common/errors';
import { decodeCursor, encodeCursor, Page } from '../common/response';
import { num } from '../common/util';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../organizations/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { originSql, type Origin } from '../providers/provider.queries';
import { ProvidersService } from '../providers/providers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { listingLocationJoin, listingSummaryColumns, toListingSummary, type ListingSummaryRow } from './listing.queries';

type ListingData = z.output<typeof listingBaseSchema>;

/** 0–100. Nudges providers toward complete listings and feeds search ranking. */
export function qualityScore(l: { title: string; description?: string | null; mediaCount: number; priceType: string; price?: number | null; keywords: string[]; hasLocation: boolean }): number {
  let s = 0;
  if (l.mediaCount >= 1) s += 25;
  if (l.mediaCount >= 3) s += 10;
  if ((l.description ?? '').length >= 60) s += 20;
  if (l.priceType !== 'QUOTE' && l.price != null) s += 15;
  if (l.keywords.length >= 2) s += 10;
  if (l.hasLocation) s += 10;
  if (l.title.length >= 10) s += 10;
  return Math.min(100, s);
}

const detailInclude = {
  category: true,
  provider: true,
  serviceDetails: true,
  productDetails: true,
  organization: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  media: { orderBy: { sortOrder: 'asc' as const }, include: { media: true } },
} satisfies Prisma.ListingInclude;

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly access: AccessService,
    private readonly providers: ProvidersService,
    private readonly subs: SubscriptionsService,
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, providerId: string, input: ListingData): Promise<ListingDetail> {
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    if (provider.status === 'SUSPENDED') throw BadRequest('This profile is suspended', 'PROVIDER_SUSPENDED');

    const max = await this.subs.limit(providerId, 'maxListings');
    const current = await this.prisma.listing.count({ where: { providerId, deletedAt: null, status: { not: 'ARCHIVED' } } });
    if (current >= max) throw BadRequest(`Your plan allows ${max} active listings. Archive one or upgrade.`, 'LIMIT_REACHED');

    await this.validateRefs(user, providerId, input);
    const mediaIds = await this.media.assertUsable(user.id, input.mediaIds, ['LISTING', 'PROVIDER_GALLERY', 'PORTFOLIO']);
    const hasLocation = (await this.prisma.providerLocation.count({ where: { providerId } })) > 0;
    const goLive = input.publish && provider.status === 'ACTIVE';

    const listing = await this.prisma.listing.create({
      data: {
        providerId,
        ...this.columns(input),
        status: goLive ? 'ACTIVE' : 'DRAFT',
        publishedAt: goLive ? new Date() : null,
        qualityScore: qualityScore({ ...input, mediaCount: mediaIds.length, hasLocation }),
        media: { create: mediaIds.map((mediaId, i) => ({ mediaId, sortOrder: i })) },
        ...(input.type === 'SERVICE'
          ? { serviceDetails: { create: { durationMinutes: input.durationMinutes ?? null } } }
          : {
              productDetails: {
                create: {
                  stockStatus: input.stockStatus ?? 'IN_STOCK',
                  pickupAvailable: input.pickupAvailable ?? true,
                  deliveryAvailable: input.deliveryAvailable ?? false,
                  deliveryRadiusKm: input.deliveryRadiusKm ?? null,
                },
              },
            }),
      },
    });
    if (!provider.primaryCategoryId) {
      await this.prisma.provider.update({ where: { id: providerId }, data: { primaryCategoryId: input.categoryId } });
    }
    if (goLive && listing.visibility === 'PUBLIC') await this.notifyFollowers(providerId, provider.displayName, listing.id, listing.title);
    return this.detail(listing.id, user, null, { track: false });
  }

  async update(user: AuthUser, providerId: string, id: string, patch: Partial<ListingData>): Promise<ListingDetail> {
    const current = await this.prisma.listing.findFirst({
      where: { id, providerId, deletedAt: null },
      include: { serviceDetails: true, productDetails: true, media: { select: { mediaId: true } } },
    });
    if (!current) throw NotFound('Listing');
    if (current.status === 'REMOVED') throw BadRequest('This listing was removed by moderators', 'LISTING_REMOVED');
    if (patch.type && patch.type !== current.type) throw BadRequest('A listing cannot change between product and service', 'TYPE_IMMUTABLE');

    const merged: ListingData = {
      type: current.type,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description ?? '',
      categoryId: patch.categoryId ?? current.categoryId,
      priceType: patch.priceType ?? current.priceType,
      price: patch.price !== undefined ? patch.price : num(current.price),
      priceMax: patch.priceMax !== undefined ? patch.priceMax : num(current.priceMax),
      currency: patch.currency ?? current.currency,
      unit: patch.unit ?? current.unit ?? '',
      keywords: patch.keywords ?? current.keywords,
      locationId: patch.locationId !== undefined ? patch.locationId : current.locationId,
      visibility: patch.visibility ?? current.visibility,
      organizationId: patch.organizationId !== undefined ? patch.organizationId : current.organizationId,
      groupId: patch.groupId !== undefined ? patch.groupId : current.groupId,
      isAvailable: patch.isAvailable ?? current.isAvailable,
      durationMinutes: patch.durationMinutes !== undefined ? patch.durationMinutes : (current.serviceDetails?.durationMinutes ?? null),
      stockStatus: patch.stockStatus ?? current.productDetails?.stockStatus ?? null,
      pickupAvailable: patch.pickupAvailable ?? current.productDetails?.pickupAvailable,
      deliveryAvailable: patch.deliveryAvailable ?? current.productDetails?.deliveryAvailable,
      deliveryRadiusKm: patch.deliveryRadiusKm !== undefined ? patch.deliveryRadiusKm : num(current.productDetails?.deliveryRadiusKm ?? null),
      mediaIds: patch.mediaIds ?? current.media.map((m) => m.mediaId),
      publish: true,
    };
    const check = listingBaseSchema.superRefine(refineListing).safeParse(merged);
    if (!check.success) {
      const details: Record<string, string[]> = {};
      for (const i of check.error.issues) (details[i.path.join('.') || '_'] ??= []).push(i.message);
      throw BadRequest('Some fields need attention', 'VALIDATION_FAILED', details);
    }
    await this.validateRefs(user, providerId, merged);
    const mediaIds = patch.mediaIds ? await this.media.assertUsable(user.id, patch.mediaIds, ['LISTING', 'PROVIDER_GALLERY', 'PORTFOLIO']) : null;
    const hasLocation = (await this.prisma.providerLocation.count({ where: { providerId } })) > 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id },
        data: {
          ...this.columns(merged),
          qualityScore: qualityScore({ ...merged, mediaCount: merged.mediaIds.length, hasLocation }),
        },
      });
      if (mediaIds) {
        await tx.listingMedia.deleteMany({ where: { listingId: id } });
        await tx.listingMedia.createMany({ data: mediaIds.map((mediaId, i) => ({ listingId: id, mediaId, sortOrder: i })) });
      }
      if (current.type === 'SERVICE') {
        await tx.serviceDetails.upsert({
          where: { listingId: id },
          create: { listingId: id, durationMinutes: merged.durationMinutes ?? null },
          update: { durationMinutes: merged.durationMinutes ?? null },
        });
      } else {
        const pd = {
          stockStatus: merged.stockStatus ?? 'IN_STOCK',
          pickupAvailable: merged.pickupAvailable ?? true,
          deliveryAvailable: merged.deliveryAvailable ?? false,
          deliveryRadiusKm: merged.deliveryRadiusKm ?? null,
        } as const;
        await tx.productDetails.upsert({ where: { listingId: id }, create: { listingId: id, ...pd }, update: pd });
      }
    });
    return this.detail(id, user, null, { track: false });
  }

  async setStatus(user: AuthUser, providerId: string, id: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    const l = await this.prisma.listing.findFirst({ where: { id, providerId, deletedAt: null }, include: { provider: true } });
    if (!l) throw NotFound('Listing');
    if (l.status === 'REMOVED') throw BadRequest('This listing was removed by moderators', 'LISTING_REMOVED');
    if (status === 'ACTIVE' && l.provider.status !== 'ACTIVE') {
      throw BadRequest('Publish your provider profile to make listings live', 'PROVIDER_NOT_ACTIVE');
    }
    await this.prisma.listing.update({
      where: { id },
      data: { status, publishedAt: status === 'ACTIVE' && !l.publishedAt ? new Date() : undefined },
    });
    return this.detail(id, user, null, { track: false });
  }

  async remove(providerId: string, id: string) {
    const r = await this.prisma.listing.updateMany({ where: { id, providerId, deletedAt: null }, data: { status: 'ARCHIVED', deletedAt: new Date() } });
    if (!r.count) throw NotFound('Listing');
    return { deleted: true };
  }

  /** Public detail; enforces organization/group visibility and records a view. */
  async detail(id: string, viewer: AuthUser | undefined, origin: Origin | null, opts: { track?: boolean } = {}): Promise<ListingDetail> {
    const l = await this.prisma.listing.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    if (!l) throw NotFound('Listing');
    const isOwner = !!viewer?.providerId && viewer.providerId === l.providerId;
    if (!isOwner) {
      if (l.status !== 'ACTIVE' || l.provider.status !== 'ACTIVE' || l.provider.deletedAt) throw NotFound('Listing');
      const m = await this.access.memberships(viewer?.id);
      if (!this.access.canView(l, m, viewer?.providerId ?? null)) throw NotFound('Listing');
    }

    const locs = await this.providers.locationRows(l.providerId);
    const loc = locs.find((x) => x.id === l.locationId) ?? locs[0] ?? null;
    let distance: number | null = null;
    if (origin && loc) {
      const [d] = await this.prisma.$queryRaw<{ d: number }[]>`
        SELECT ST_Distance(ST_SetSRID(ST_MakePoint(${loc.publicLng}, ${loc.publicLat}), 4326)::geography, ${originSql(origin)}) AS d`;
      distance = d ? Math.round(d.d) : null;
    }
    const saved = viewer ? await this.prisma.favoriteListing.findUnique({ where: { userId_listingId: { userId: viewer.id, listingId: id } } }) : null;
    if (opts.track !== false) await this.analytics.track('LISTING_VIEW', l.providerId, { listingId: id, userId: viewer?.id, ownerUserId: l.provider.userId });

    return {
      id: l.id,
      type: l.type,
      title: l.title,
      description: l.description,
      priceType: l.priceType,
      price: num(l.price),
      priceMax: num(l.priceMax),
      currency: l.currency,
      unit: l.unit,
      status: l.status,
      visibility: l.visibility,
      isAvailable: l.isAvailable,
      coverUrl: l.media[0] ? this.media.url(l.media[0].mediaId) : null,
      category: { id: l.category.id, slug: l.category.slug, name: l.category.name, icon: l.category.icon, color: l.category.color, parentId: l.category.parentId },
      provider: {
        id: l.provider.id,
        slug: l.provider.slug,
        displayName: l.provider.displayName,
        logoUrl: this.media.url(l.provider.logoMediaId),
        verificationStatus: l.provider.verificationStatus,
        ratingAverage: num(l.provider.ratingAverage) ?? 0,
        ratingCount: l.provider.ratingCount,
        phone: l.provider.phone || null,
        whatsapp: l.provider.whatsapp,
        serviceMode: l.provider.serviceMode,
      },
      area: loc?.area ?? null,
      city: loc?.city ?? null,
      distanceMeters: distance,
      position: loc ? { lat: loc.publicLat, lng: loc.publicLng } : null,
      isSponsored: false,
      isSaved: !!saved,
      createdAt: l.createdAt.toISOString(),
      keywords: l.keywords,
      media: l.media.map((m) => this.media.ref(m.media)),
      durationMinutes: l.serviceDetails?.durationMinutes ?? null,
      stockStatus: l.productDetails?.stockStatus ?? null,
      pickupAvailable: l.productDetails?.pickupAvailable ?? null,
      deliveryAvailable: l.productDetails?.deliveryAvailable ?? null,
      deliveryRadiusKm: num(l.productDetails?.deliveryRadiusKm ?? null),
      organization: l.organization,
      group: l.group,
      location: loc
        ? { id: loc.id, label: loc.label, area: loc.area, city: loc.city, lat: loc.publicLat, lng: loc.publicLng, isApproximate: !loc.showExactLocation, addressLine: loc.showExactLocation ? loc.addressLine : null, isPrimary: loc.isPrimary }
        : null,
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  /** The owner's listings, any status. */
  async mine(providerId: string, q: { status?: string; cursor?: string; limit: number }) {
    return this.page(
      Prisma.sql`l."providerId" = ${providerId}::uuid AND l."deletedAt" IS NULL ${q.status ? Prisma.sql`AND l."status" = ${q.status}::"ListingStatus"` : Prisma.empty}`,
      q,
    );
  }

  /** A provider's live listings that the viewer may see. */
  async forProvider(providerId: string, viewer: AuthUser | undefined, q: { type?: 'SERVICE' | 'PRODUCT'; cursor?: string; limit: number }) {
    const m = await this.access.memberships(viewer?.id);
    const saved = viewer
      ? new Set((await this.prisma.favoriteListing.findMany({ where: { userId: viewer.id, listing: { providerId } }, select: { listingId: true } })).map((f) => f.listingId))
      : undefined;
    return this.page(
      Prisma.sql`l."providerId" = ${providerId}::uuid AND l."deletedAt" IS NULL AND l."status" = 'ACTIVE'
        AND p."status" = 'ACTIVE' AND ${this.access.visibilitySql(m, viewer?.providerId ?? null)}
        ${q.type ? Prisma.sql`AND l."type" = ${q.type}::"ListingType"` : Prisma.empty}`,
      q,
      saved,
    );
  }

  private async page(where: Prisma.Sql, q: { cursor?: string; limit: number }, saved?: Set<string>): Promise<Page<ListingSummary>> {
    const c = decodeCursor<{ t: string; id: string }>(q.cursor);
    const rows = await this.prisma.$queryRaw<ListingSummaryRow[]>`
      SELECT ${listingSummaryColumns(Prisma.sql`NULL::float`)}
        FROM "Listing" l ${listingLocationJoin}
       WHERE ${where} ${c ? Prisma.sql`AND (l."createdAt", l."id") < (${new Date(c.t)}, ${c.id}::uuid)` : Prisma.empty}
       ORDER BY l."createdAt" DESC, l."id" DESC
       LIMIT ${q.limit + 1}`;
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const last = items[items.length - 1];
    return new Page(
      items.map((r) => toListingSummary(r, this.media, { saved })),
      hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
    );
  }

  private columns(input: ListingData) {
    const priced = !['QUOTE'].includes(input.priceType);
    return {
      type: input.type,
      title: input.title,
      description: input.description || null,
      categoryId: input.categoryId,
      priceType: input.priceType,
      price: priced ? (input.price ?? null) : null,
      priceMax: input.priceType === 'RANGE' ? (input.priceMax ?? null) : null,
      currency: input.currency.toUpperCase(),
      unit: input.unit || null,
      keywords: [...new Set(input.keywords.map((k) => k.toLowerCase()))],
      locationId: input.locationId ?? null,
      visibility: input.visibility,
      organizationId: input.organizationId ?? null,
      groupId: input.visibility === 'GROUP' ? (input.groupId ?? null) : null,
      isAvailable: input.isAvailable,
    };
  }

  private async validateRefs(user: AuthUser, providerId: string, input: ListingData) {
    const cat = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!cat || !cat.isActive || cat.deletedAt) throw BadRequest('Choose an active category', 'INVALID_CATEGORY');
    if (input.locationId) {
      const loc = await this.prisma.providerLocation.findFirst({ where: { id: input.locationId, providerId } });
      if (!loc) throw BadRequest('That location is not one of yours', 'INVALID_LOCATION');
    }
    await this.access.assertListingScope(user.id, input);
  }

  private async notifyFollowers(providerId: string, providerName: string, listingId: string, title: string) {
    const followers = await this.prisma.favoriteProvider.findMany({ where: { providerId, notify: true }, select: { userId: true } });
    await this.notifications.notifyMany(
      followers.map((f) => f.userId),
      {
        category: 'SAVED_PROVIDER',
        title: `${providerName} added something new`,
        body: title,
        data: { type: 'listing', listingId, providerId },
        dedupeKey: `new-listing:${listingId}`,
      },
    );
  }
}
