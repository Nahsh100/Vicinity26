import type { ProviderSummary } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import type { MediaService } from '../media/media.service';
import type { PrismaService } from '../prisma/prisma.service';

export interface Origin {
  lat: number;
  lng: number;
}

export const originSql = (o: Origin) => Prisma.sql`ST_SetSRID(ST_MakePoint(${o.lng}, ${o.lat}), 4326)::geography`;

export interface ProviderRow {
  id: string;
  slug: string;
  displayName: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  tagline: string | null;
  logoMediaId: string | null;
  coverMediaId: string | null;
  verificationStatus: ProviderSummary['verificationStatus'];
  ratingAverage: number;
  ratingCount: number;
  phone: string;
  whatsapp: string | null;
  area: string | null;
  city: string | null;
  distanceMeters: number | null;
  catId: string | null;
  catSlug: string | null;
  catName: string | null;
  catIcon: string | null;
  catColor: string | null;
  catParentId: string | null;
  startingPrice: number | null;
}

/**
 * Lists providers with their primary public location, distance from `origin`, primary category and
 * lowest public listing price. All distance maths runs in PostGIS against the *public* (approximate)
 * location so results never reveal a private address.
 */
export async function queryProviderSummaries(
  prisma: PrismaService,
  opts: {
    where?: Prisma.Sql;
    origin?: Origin | null;
    radiusM?: number | null;
    orderBy?: Prisma.Sql;
    limit: number;
    ids?: string[];
  },
): Promise<ProviderRow[]> {
  const origin = opts.origin ? originSql(opts.origin) : null;
  return prisma.$queryRaw<ProviderRow[]>`
    SELECT p."id", p."slug", p."displayName", p."type", p."tagline", p."logoMediaId", p."coverMediaId",
           p."verificationStatus", p."ratingAverage"::float AS "ratingAverage", p."ratingCount", p."phone", p."whatsapp",
           loc."area", loc."city",
           ${origin ? Prisma.sql`ST_Distance(loc."publicLocation", ${origin})` : Prisma.sql`NULL::float`} AS "distanceMeters",
           c."id" AS "catId", c."slug" AS "catSlug", c."name" AS "catName", c."icon" AS "catIcon", c."color" AS "catColor", c."parentId" AS "catParentId",
           sp.price::float AS "startingPrice"
      FROM "Provider" p
      LEFT JOIN LATERAL (
        SELECT pl."area", pl."city", pl."publicLocation" FROM "ProviderLocation" pl
         WHERE pl."providerId" = p."id" ORDER BY pl."isPrimary" DESC, pl."createdAt" LIMIT 1
      ) loc ON true
      LEFT JOIN "Category" c ON c."id" = p."primaryCategoryId"
      LEFT JOIN LATERAL (
        SELECT min(l."price") AS price FROM "Listing" l
         WHERE l."providerId" = p."id" AND l."status" = 'ACTIVE' AND l."deletedAt" IS NULL AND l."visibility" = 'PUBLIC'
      ) sp ON true
     WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
       ${opts.ids ? Prisma.sql`AND p."id" = ANY(${opts.ids}::uuid[])` : Prisma.empty}
       ${opts.where ? Prisma.sql`AND ${opts.where}` : Prisma.empty}
       ${origin && opts.radiusM ? Prisma.sql`AND ST_DWithin(loc."publicLocation", ${origin}, ${opts.radiusM})` : Prisma.empty}
     ORDER BY ${opts.orderBy ?? Prisma.sql`p."ratingAverage" DESC, p."ratingCount" DESC`}
     LIMIT ${opts.limit}`;
}

export function toProviderSummary(r: ProviderRow, media: MediaService, savedIds?: Set<string>): ProviderSummary {
  return {
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    type: r.type,
    tagline: r.tagline,
    logoUrl: media.url(r.logoMediaId),
    coverUrl: media.url(r.coverMediaId),
    verificationStatus: r.verificationStatus,
    ratingAverage: Number(r.ratingAverage),
    ratingCount: r.ratingCount,
    area: r.area,
    city: r.city,
    distanceMeters: r.distanceMeters == null ? null : Math.round(r.distanceMeters),
    phone: r.phone || null,
    whatsapp: r.whatsapp,
    primaryCategory: r.catId
      ? { id: r.catId, slug: r.catSlug!, name: r.catName!, icon: r.catIcon, color: r.catColor, parentId: r.catParentId }
      : null,
    startingPrice: r.startingPrice,
    currency: 'ZMW',
    ...(savedIds ? { isSaved: savedIds.has(r.id) } : {}),
  };
}
