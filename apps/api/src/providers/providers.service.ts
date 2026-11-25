import { Injectable } from '@nestjs/common';
import type {
  PortfolioProject,
  PortfolioProjectInput,
  ProviderDetail,
  ProviderInput,
  ProviderLocationInput,
  PublicLocation,
  ServiceAreaInput,
  WorkingHours,
} from '@vicinity/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuditService } from '../common/audit.service';
import { AuthGuard, type AuthUser } from '../common/auth';
import { BadRequest, Conflict, NotFound } from '../common/errors';
import { approximateCoord, num, uniqueSlug } from '../common/util';
import { MediaService } from '../media/media.service';
import { AccessService } from '../organizations/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { originSql, queryProviderSummaries, toProviderSummary, type Origin } from './provider.queries';

export const credentialSchema = z.object({
  title: z.string().trim().min(2).max(120),
  issuer: z.string().trim().max(120).optional().or(z.literal('')),
  issuedAt: z.string().datetime().nullable().optional(),
  mediaId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean().default(true),
});

export const gallerySchema = z.object({ mediaIds: z.array(z.string().uuid()).max(60) });
export const onboardingStepSchema = z.object({ step: z.number().int().min(0).max(20) });

/** Free-plan limits until a subscription is active (see subscriptions module). */
export const FREE_LIMITS = { maxLocations: 2, maxServiceAreas: 5, maxGalleryMedia: 24, maxPortfolioProjects: 12 };

interface LocationRow {
  id: string;
  label: string;
  addressLine: string | null;
  area: string;
  city: string;
  lat: number;
  lng: number;
  publicLat: number;
  publicLng: number;
  showExactLocation: boolean;
  isPrimary: boolean;
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly access: AccessService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly guard: AuthGuard,
  ) {}

  // ───────── Own provider profile ─────────

  async create(user: AuthUser, input: ProviderInput & { phone: string }) {
    const exists = await this.prisma.provider.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (exists) throw Conflict('You already have a provider profile', 'PROVIDER_EXISTS');
    await this.assertMedia(user.id, input);
    const p = await this.prisma.provider.create({
      data: {
        userId: user.id,
        slug: uniqueSlug(input.displayName),
        ...this.profileData(input),
        type: input.type,
        displayName: input.displayName,
        phone: input.phone,
        onboardingStep: 1,
      },
    });
    if (input.workingHours) await this.setAvailability(p.id, input.workingHours);
    // The guard caches who-is-a-provider; drop it so the very next request sees the new storefront.
    this.guard.invalidate(user.id);
    await this.audit.log({ actorId: user.id, action: 'provider.create', targetType: 'Provider', targetId: p.id });
    return this.mine(user.id);
  }

  async update(user: AuthUser, providerId: string, input: Partial<ProviderInput>) {
    await this.assertMedia(user.id, input);
    await this.prisma.provider.update({ where: { id: providerId }, data: this.profileData(input) });
    if (input.workingHours) await this.setAvailability(providerId, input.workingHours);
    return this.mine(user.id);
  }

  async setOnboardingStep(providerId: string, step: number) {
    await this.prisma.provider.update({ where: { id: providerId }, data: { onboardingStep: step } });
    return { step };
  }

  /** Owner view: everything including exact locations, onboarding progress and draft state. */
  async mine(userId: string) {
    const p = await this.prisma.provider.findUnique({
      where: { userId },
      include: {
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        serviceAreas: true,
        media: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
        credentials: { orderBy: { createdAt: 'desc' } },
        primaryCategory: true,
        _count: { select: { listings: { where: { deletedAt: null } }, portfolio: { where: { deletedAt: null } }, reviews: true } },
      },
    });
    if (!p || p.deletedAt) throw NotFound('Provider profile');
    const locations = await this.locationRows(p.id);
    const checklist = {
      details: !!(p.displayName && p.phone),
      photo: !!p.logoMediaId,
      description: !!(p.bio && p.bio.length >= 20),
      location: locations.length > 0,
      listing: p._count.listings > 0,
      portfolio: p.media.length > 0 || p._count.portfolio > 0,
      contact: !!(p.phone && (p.whatsapp || p.email)),
    };
    return {
      id: p.id,
      slug: p.slug,
      type: p.type,
      displayName: p.displayName,
      tagline: p.tagline,
      bio: p.bio,
      phone: p.phone,
      whatsapp: p.whatsapp,
      email: p.email,
      website: p.website,
      socialLinks: p.socialLinks as Record<string, string>,
      serviceMode: p.serviceMode,
      serviceRadiusKm: num(p.serviceRadiusKm),
      languages: p.languages,
      logoMediaId: p.logoMediaId,
      coverMediaId: p.coverMediaId,
      logoUrl: this.media.url(p.logoMediaId),
      coverUrl: this.media.url(p.coverMediaId),
      status: p.status,
      onboardingStep: p.onboardingStep,
      verificationStatus: p.verificationStatus,
      ratingAverage: num(p.ratingAverage) ?? 0,
      ratingCount: p.ratingCount,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      workingHours: p.availability.map((a) => ({ day: a.dayOfWeek, open: a.startTime, close: a.endTime })),
      locations: locations.map((l) => ({ ...this.toPublicLocation(l), exactLat: l.lat, exactLng: l.lng, showExactLocation: l.showExactLocation })),
      serviceAreas: await this.serviceAreaRows(p.id),
      gallery: p.media.map((m) => ({ ...this.media.ref(m.media), caption: m.caption })),
      credentials: p.credentials.map((c) => ({
        id: c.id,
        title: c.title,
        issuer: c.issuer,
        issuedAt: c.issuedAt?.toISOString() ?? null,
        isPublic: c.isPublic,
        hasDocument: !!c.mediaId,
        documentUrl: this.media.url(c.mediaId),
      })),
      counts: { listings: p._count.listings, portfolio: p._count.portfolio, reviews: p._count.reviews },
      checklist,
      canPublish: checklist.details && checklist.location && checklist.listing,
    };
  }

  /** Makes the storefront discoverable. Requires contact details, a location and at least one listing. */
  async publish(user: AuthUser, providerId: string) {
    const me = await this.mine(user.id);
    if (!me.canPublish) {
      const missing = Object.entries({ details: 'contact details', location: 'a location', listing: 'at least one listing' })
        .filter(([k]) => !me.checklist[k as keyof typeof me.checklist])
        .map(([, v]) => v);
      throw BadRequest(`Add ${missing.join(', ')} before publishing`, 'PROFILE_INCOMPLETE');
    }
    if (me.status === 'SUSPENDED') throw BadRequest('This profile is suspended. Contact support.', 'PROVIDER_SUSPENDED');
    await this.prisma.$transaction([
      this.prisma.provider.update({
        where: { id: providerId },
        data: { status: 'ACTIVE', publishedAt: me.publishedAt ? undefined : new Date(), onboardingStep: 11 },
      }),
      // Listings saved as drafts during onboarding go live with the profile.
      this.prisma.listing.updateMany({
        where: { providerId, status: 'DRAFT', deletedAt: null },
        data: { status: 'ACTIVE', publishedAt: new Date() },
      }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'provider.publish', targetType: 'Provider', targetId: providerId });
    return this.mine(user.id);
  }

  async setPaused(user: AuthUser, providerId: string, paused: boolean) {
    const p = await this.prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    if (p.status === 'SUSPENDED') throw BadRequest('This profile is suspended. Contact support.', 'PROVIDER_SUSPENDED');
    if (p.status === 'DRAFT') throw BadRequest('Publish your profile first', 'PROVIDER_DRAFT');
    await this.prisma.provider.update({ where: { id: providerId }, data: { status: paused ? 'PAUSED' : 'ACTIVE' } });
    return this.mine(user.id);
  }

  // ───────── Locations & service areas ─────────

  async addLocation(providerId: string, input: ProviderLocationInput) {
    const count = await this.prisma.providerLocation.count({ where: { providerId } });
    if (count >= FREE_LIMITS.maxLocations) throw BadRequest(`You can add up to ${FREE_LIMITS.maxLocations} locations on the free plan`, 'LIMIT_REACHED');
    const isPrimary = input.isPrimary || count === 0;
    const pub = this.publicPoint(input.lat, input.lng, input.showExactLocation ?? false);
    const rows = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) await tx.providerLocation.updateMany({ where: { providerId }, data: { isPrimary: false } });
      return tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "ProviderLocation" ("providerId", "label", "addressLine", "area", "city", "location", "publicLocation", "showExactLocation", "isPrimary")
        VALUES (${providerId}::uuid, ${input.label}, ${input.addressLine || null}, ${input.area}, ${input.city},
                ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${pub.lng}, ${pub.lat}), 4326)::geography,
                ${input.showExactLocation ?? false}, ${isPrimary})
        RETURNING "id"`;
    });
    return { id: rows[0]!.id };
  }

  async updateLocation(providerId: string, id: string, input: Partial<ProviderLocationInput>) {
    const loc = (await this.locationRows(providerId)).find((l) => l.id === id);
    if (!loc) throw NotFound('Location');
    const lat = input.lat ?? loc.lat;
    const lng = input.lng ?? loc.lng;
    const exact = input.showExactLocation ?? loc.showExactLocation;
    const pub = this.publicPoint(lat, lng, exact);
    await this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.providerLocation.updateMany({ where: { providerId }, data: { isPrimary: false } });
      await tx.$executeRaw`
        UPDATE "ProviderLocation" SET
          "label" = ${input.label ?? loc.label},
          "addressLine" = ${input.addressLine === undefined ? loc.addressLine : input.addressLine || null},
          "area" = ${input.area ?? loc.area},
          "city" = ${input.city ?? loc.city},
          "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          "publicLocation" = ST_SetSRID(ST_MakePoint(${pub.lng}, ${pub.lat}), 4326)::geography,
          "showExactLocation" = ${exact},
          "isPrimary" = ${input.isPrimary ?? loc.isPrimary},
          "updatedAt" = now()
        WHERE "id" = ${id}::uuid AND "providerId" = ${providerId}::uuid`;
    });
    return { id };
  }

  async removeLocation(providerId: string, id: string) {
    const loc = await this.prisma.providerLocation.findFirst({ where: { id, providerId } });
    if (!loc) throw NotFound('Location');
    await this.prisma.providerLocation.delete({ where: { id } });
    if (loc.isPrimary) {
      const next = await this.prisma.providerLocation.findFirst({ where: { providerId }, orderBy: { createdAt: 'asc' } });
      if (next) await this.prisma.providerLocation.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    return { deleted: true };
  }

  async addServiceArea(providerId: string, input: ServiceAreaInput) {
    const count = await this.prisma.serviceArea.count({ where: { providerId } });
    if (count >= FREE_LIMITS.maxServiceAreas) throw BadRequest(`You can add up to ${FREE_LIMITS.maxServiceAreas} service areas on the free plan`, 'LIMIT_REACHED');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "ServiceArea" ("providerId", "name", "center", "radiusKm")
      VALUES (${providerId}::uuid, ${input.name}, ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography, ${input.radiusKm})
      RETURNING "id"`;
    return { id: rows[0]!.id };
  }

  async removeServiceArea(providerId: string, id: string) {
    const r = await this.prisma.serviceArea.deleteMany({ where: { id, providerId } });
    if (!r.count) throw NotFound('Service area');
    return { deleted: true };
  }

  async setAvailability(providerId: string, hours: WorkingHours) {
    for (const h of hours) {
      if (h.close <= h.open) throw BadRequest(`Closing time must be after opening time (${h.open}–${h.close})`, 'INVALID_HOURS');
    }
    await this.prisma.$transaction([
      this.prisma.providerAvailability.deleteMany({ where: { providerId } }),
      this.prisma.providerAvailability.createMany({
        data: hours.map((h) => ({ providerId, dayOfWeek: h.day, startTime: h.open, endTime: h.close })),
      }),
    ]);
    return { saved: hours.length };
  }

  // ───────── Gallery & credentials ─────────

  async setGallery(user: AuthUser, providerId: string, mediaIds: string[]) {
    if (mediaIds.length > FREE_LIMITS.maxGalleryMedia) throw BadRequest(`Up to ${FREE_LIMITS.maxGalleryMedia} gallery items on the free plan`, 'LIMIT_REACHED');
    const ids = await this.media.assertUsable(user.id, mediaIds, ['PROVIDER_GALLERY', 'PORTFOLIO', 'LISTING']);
    await this.prisma.$transaction([
      this.prisma.providerMedia.deleteMany({ where: { providerId } }),
      this.prisma.providerMedia.createMany({ data: ids.map((mediaId, i) => ({ providerId, mediaId, sortOrder: i })) }),
    ]);
    return { saved: ids.length };
  }

  async addCredential(user: AuthUser, providerId: string, input: z.infer<typeof credentialSchema>) {
    if (input.mediaId) await this.media.assertUsable(user.id, [input.mediaId], ['CREDENTIAL']);
    const c = await this.prisma.providerCredential.create({
      data: {
        providerId,
        title: input.title,
        issuer: input.issuer || null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
        mediaId: input.mediaId ?? null,
        isPublic: input.isPublic,
      },
    });
    return { id: c.id };
  }

  async removeCredential(providerId: string, id: string) {
    const r = await this.prisma.providerCredential.deleteMany({ where: { id, providerId } });
    if (!r.count) throw NotFound('Credential');
    return { deleted: true };
  }

  // ───────── Portfolio ─────────

  async createProject(user: AuthUser, providerId: string, input: PortfolioProjectInput) {
    const count = await this.prisma.portfolioProject.count({ where: { providerId, deletedAt: null } });
    if (count >= FREE_LIMITS.maxPortfolioProjects) throw BadRequest(`Up to ${FREE_LIMITS.maxPortfolioProjects} projects on the free plan`, 'LIMIT_REACHED');
    const ids = await this.media.assertUsable(user.id, input.mediaIds, ['PORTFOLIO', 'PROVIDER_GALLERY']);
    const p = await this.prisma.portfolioProject.create({
      data: {
        providerId,
        title: input.title,
        description: input.description || null,
        locationName: input.locationName || null,
        durationText: input.durationText || null,
        price: input.price ?? null,
        showPrice: input.showPrice ?? false,
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
        sortOrder: count,
        media: { create: ids.map((mediaId, i) => ({ mediaId, sortOrder: i })) },
      },
    });
    await this.prisma.provider.update({ where: { id: providerId }, data: { completedProjects: { increment: 1 } } });
    return this.getProject(p.id);
  }

  async updateProject(user: AuthUser, providerId: string, id: string, input: Partial<PortfolioProjectInput>) {
    const p = await this.prisma.portfolioProject.findFirst({ where: { id, providerId, deletedAt: null } });
    if (!p) throw NotFound('Project');
    const ids = input.mediaIds ? await this.media.assertUsable(user.id, input.mediaIds, ['PORTFOLIO', 'PROVIDER_GALLERY']) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.portfolioProject.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description === '' ? null : input.description,
          locationName: input.locationName === '' ? null : input.locationName,
          durationText: input.durationText === '' ? null : input.durationText,
          price: input.price,
          showPrice: input.showPrice,
          completedAt: input.completedAt === undefined ? undefined : input.completedAt ? new Date(input.completedAt) : null,
        },
      });
      if (ids) {
        await tx.portfolioMedia.deleteMany({ where: { projectId: id } });
        await tx.portfolioMedia.createMany({ data: ids.map((mediaId, i) => ({ projectId: id, mediaId, sortOrder: i })) });
      }
    });
    return this.getProject(id);
  }

  async removeProject(providerId: string, id: string) {
    const r = await this.prisma.portfolioProject.updateMany({ where: { id, providerId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!r.count) throw NotFound('Project');
    await this.prisma.provider.update({ where: { id: providerId }, data: { completedProjects: { decrement: 1 } } });
    return { deleted: true };
  }

  async listProjects(providerId: string): Promise<PortfolioProject[]> {
    const rows = await this.prisma.portfolioProject.findMany({
      where: { providerId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { media: { orderBy: { sortOrder: 'asc' }, include: { media: true } } },
    });
    return rows.map((p) => this.toProject(p));
  }

  async getProject(id: string): Promise<PortfolioProject> {
    const p = await this.prisma.portfolioProject.findFirst({
      where: { id, deletedAt: null },
      include: { media: { orderBy: { sortOrder: 'asc' }, include: { media: true } } },
    });
    if (!p) throw NotFound('Project');
    return this.toProject(p);
  }

  // ───────── Public storefront ─────────

  async publicProfile(idOrSlug: string, viewer: AuthUser | undefined, origin: Origin | null): Promise<ProviderDetail> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const p = await this.prisma.provider.findFirst({
      where: { deletedAt: null, ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }) },
      include: { availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
    });
    const isOwner = !!viewer && p?.userId === viewer.id;
    if (!p || (p.status !== 'ACTIVE' && !isOwner)) throw NotFound('Provider');

    // Draft/paused profiles (owner preview) are not returned by the summary query; the fallback below covers them.
    const [summary] = await queryProviderSummaries(this.prisma, { ids: [p.id], origin, limit: 1 });
    const m = await this.access.memberships(viewer?.id);
    const visible = this.access.visibilityWhere(m, viewer?.providerId ?? null);
    const [locations, areas, services, products, portfolio, reviews, saved] = await Promise.all([
      this.locationRows(p.id),
      this.serviceAreaRows(p.id),
      this.prisma.listing.count({ where: { providerId: p.id, type: 'SERVICE', status: 'ACTIVE', deletedAt: null, ...visible } }),
      this.prisma.listing.count({ where: { providerId: p.id, type: 'PRODUCT', status: 'ACTIVE', deletedAt: null, ...visible } }),
      this.prisma.portfolioProject.count({ where: { providerId: p.id, deletedAt: null } }),
      this.prisma.review.count({ where: { providerId: p.id, status: 'PUBLISHED' } }),
      viewer ? this.prisma.favoriteProvider.findUnique({ where: { userId_providerId: { userId: viewer.id, providerId: p.id } } }) : null,
    ]);

    await this.analytics.track('PROFILE_VIEW', p.id, { userId: viewer?.id, ownerUserId: p.userId });

    const base = summary
      ? toProviderSummary(summary, this.media)
      : {
          id: p.id,
          slug: p.slug,
          displayName: p.displayName,
          type: p.type,
          tagline: p.tagline,
          logoUrl: this.media.url(p.logoMediaId),
          coverUrl: this.media.url(p.coverMediaId),
          verificationStatus: p.verificationStatus,
          ratingAverage: num(p.ratingAverage) ?? 0,
          ratingCount: p.ratingCount,
          area: locations[0]?.area ?? null,
          city: locations[0]?.city ?? null,
          distanceMeters: null,
          phone: p.phone,
          whatsapp: p.whatsapp,
          primaryCategory: null,
          startingPrice: null,
          currency: 'ZMW',
        };

    return {
      ...base,
      isSaved: !!saved,
      bio: p.bio,
      email: p.email,
      website: p.website,
      socialLinks: p.socialLinks as Record<string, string>,
      serviceMode: p.serviceMode,
      serviceRadiusKm: num(p.serviceRadiusKm),
      workingHours: p.availability.map((a) => ({ day: a.dayOfWeek, open: a.startTime, close: a.endTime })),
      languages: p.languages,
      locations: locations.map((l) => this.toPublicLocation(l)),
      serviceAreas: areas,
      completedProjects: p.completedProjects,
      joinedAt: p.createdAt.toISOString(),
      isOwner,
      sections: { services, products, portfolio, reviews },
    };
  }

  async publicGallery(providerId: string) {
    const rows = await this.prisma.providerMedia.findMany({
      where: { providerId, media: { status: 'READY', isPrivate: false } },
      orderBy: { sortOrder: 'asc' },
      include: { media: true },
    });
    return rows.map((r) => ({ ...this.media.ref(r.media), caption: r.caption }));
  }

  async publicCredentials(providerId: string) {
    const rows = await this.prisma.providerCredential.findMany({ where: { providerId, isPublic: true }, orderBy: { issuedAt: 'desc' } });
    // Titles only: documents stay private.
    return rows.map((c) => ({ id: c.id, title: c.title, issuer: c.issuer, issuedAt: c.issuedAt?.toISOString() ?? null }));
  }

  // ───────── internals ─────────

  private profileData(input: Partial<ProviderInput>) {
    return {
      type: input.type,
      displayName: input.displayName,
      tagline: input.tagline === '' ? null : input.tagline,
      bio: input.bio === '' ? null : input.bio,
      phone: input.phone,
      whatsapp: input.whatsapp === '' ? null : input.whatsapp,
      email: input.email === '' ? null : input.email,
      website: input.website === '' ? null : input.website,
      socialLinks: input.socialLinks as Prisma.InputJsonValue | undefined,
      serviceMode: input.serviceMode,
      serviceRadiusKm: input.serviceRadiusKm,
      languages: input.languages,
      logoMediaId: input.logoMediaId,
      coverMediaId: input.coverMediaId,
    };
  }

  private async assertMedia(userId: string, input: Partial<ProviderInput>) {
    if (input.logoMediaId) await this.media.assertUsable(userId, [input.logoMediaId], ['PROVIDER_LOGO', 'AVATAR']);
    if (input.coverMediaId) await this.media.assertUsable(userId, [input.coverMediaId], ['PROVIDER_COVER', 'PROVIDER_GALLERY']);
  }

  private publicPoint(lat: number, lng: number, exact: boolean) {
    return exact ? { lat, lng } : { lat: approximateCoord(lat), lng: approximateCoord(lng) };
  }

  async locationRows(providerId: string): Promise<LocationRow[]> {
    return this.prisma.$queryRaw<LocationRow[]>`
      SELECT "id", "label", "addressLine", "area", "city",
             ST_Y("location"::geometry) AS lat, ST_X("location"::geometry) AS lng,
             ST_Y("publicLocation"::geometry) AS "publicLat", ST_X("publicLocation"::geometry) AS "publicLng",
             "showExactLocation", "isPrimary"
        FROM "ProviderLocation" WHERE "providerId" = ${providerId}::uuid
       ORDER BY "isPrimary" DESC, "createdAt"`;
  }

  private async serviceAreaRows(providerId: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; radiusKm: number; lat: number; lng: number }[]>`
      SELECT "id", "name", "radiusKm"::float AS "radiusKm", ST_Y("center"::geometry) AS lat, ST_X("center"::geometry) AS lng
        FROM "ServiceArea" WHERE "providerId" = ${providerId}::uuid ORDER BY "createdAt"`;
    return rows;
  }

  private toPublicLocation(l: LocationRow): PublicLocation {
    return {
      id: l.id,
      label: l.label,
      area: l.area,
      city: l.city,
      lat: l.publicLat,
      lng: l.publicLng,
      isApproximate: !l.showExactLocation,
      addressLine: l.showExactLocation ? l.addressLine : null,
      isPrimary: l.isPrimary,
    };
  }

  private toProject(p: {
    id: string;
    title: string;
    description: string | null;
    locationName: string | null;
    durationText: string | null;
    price: Prisma.Decimal | null;
    showPrice: boolean;
    currency: string;
    completedAt: Date | null;
    createdAt: Date;
    media: { media: { id: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; storageKey: string; isPrivate: boolean; width: number | null; height: number | null } }[];
  }): PortfolioProject {
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      locationName: p.locationName,
      durationText: p.durationText,
      price: p.showPrice ? num(p.price) : null,
      currency: p.currency,
      completedAt: p.completedAt?.toISOString() ?? null,
      media: p.media.map((m) => this.media.ref(m.media)),
      createdAt: p.createdAt.toISOString(),
    };
  }

  /** Used by the search module to sort by straight-line distance. */
  originSql = originSql;
}
