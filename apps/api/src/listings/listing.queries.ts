import type { ListingSummary } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import type { MediaService } from '../media/media.service';

/**
 * Column list for ListingSummary rows. Expects aliases:
 *   l = "Listing", p = "Provider", c = "Category", loc = resolved public location (area, city, publicLocation)
 * and an optional `distance` expression supplied by the caller.
 */
export const listingSummaryColumns = (distance: Prisma.Sql) => Prisma.sql`
  l."id", l."type", l."title", left(l."description", 240) AS "description", l."priceType",
  l."price"::float AS "price", l."priceMax"::float AS "priceMax", l."currency", l."unit", l."status", l."visibility",
  l."isAvailable", l."createdAt", l."publishedAt", l."qualityScore",
  (SELECT lm."mediaId" FROM "ListingMedia" lm WHERE lm."listingId" = l."id" ORDER BY lm."sortOrder" LIMIT 1) AS "coverMediaId",
  c."id" AS "catId", c."slug" AS "catSlug", c."name" AS "catName", c."icon" AS "catIcon", c."color" AS "catColor", c."parentId" AS "catParentId",
  p."id" AS "providerId", p."slug" AS "providerSlug", p."displayName" AS "providerName", p."logoMediaId" AS "providerLogoMediaId",
  p."verificationStatus", p."ratingAverage"::float AS "ratingAverage", p."ratingCount", p."phone", p."whatsapp", p."serviceMode",
  loc."area", loc."city", ${distance} AS "distanceMeters",
  ST_Y(loc."publicLocation"::geometry) AS "lat", ST_X(loc."publicLocation"::geometry) AS "lng"`;

/** Joins that resolve the listing's own location or else the provider's primary location. */
export const listingLocationJoin = Prisma.sql`
  JOIN "Provider" p ON p."id" = l."providerId"
  JOIN "Category" c ON c."id" = l."categoryId"
  LEFT JOIN LATERAL (
    SELECT pl."area", pl."city", pl."publicLocation" FROM "ProviderLocation" pl
     WHERE pl."providerId" = l."providerId" AND (l."locationId" IS NULL OR pl."id" = l."locationId")
     ORDER BY (pl."id" = l."locationId") DESC NULLS LAST, pl."isPrimary" DESC, pl."createdAt"
     LIMIT 1
  ) loc ON true`;

export interface ListingSummaryRow {
  id: string;
  type: ListingSummary['type'];
  title: string;
  description: string | null;
  priceType: ListingSummary['priceType'];
  price: number | null;
  priceMax: number | null;
  currency: string;
  unit: string | null;
  status: ListingSummary['status'];
  visibility: ListingSummary['visibility'];
  isAvailable: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  qualityScore: number;
  coverMediaId: string | null;
  catId: string;
  catSlug: string;
  catName: string;
  catIcon: string | null;
  catColor: string | null;
  catParentId: string | null;
  providerId: string;
  providerSlug: string;
  providerName: string;
  providerLogoMediaId: string | null;
  verificationStatus: ListingSummary['provider']['verificationStatus'];
  ratingAverage: number;
  ratingCount: number;
  phone: string;
  whatsapp: string | null;
  serviceMode: 'AT_LOCATION' | 'MOBILE' | 'BOTH';
  area: string | null;
  city: string | null;
  distanceMeters: number | null;
  lat: number | null;
  lng: number | null;
}

export function toListingSummary(
  r: ListingSummaryRow,
  media: MediaService,
  opts: { sponsored?: boolean; saved?: Set<string> } = {},
): ListingSummary {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    priceType: r.priceType,
    price: r.price,
    priceMax: r.priceMax,
    currency: r.currency,
    unit: r.unit,
    status: r.status,
    visibility: r.visibility,
    isAvailable: r.isAvailable,
    coverUrl: media.url(r.coverMediaId),
    category: { id: r.catId, slug: r.catSlug, name: r.catName, icon: r.catIcon, color: r.catColor, parentId: r.catParentId },
    provider: {
      id: r.providerId,
      slug: r.providerSlug,
      displayName: r.providerName,
      logoUrl: media.url(r.providerLogoMediaId),
      verificationStatus: r.verificationStatus,
      ratingAverage: Number(r.ratingAverage),
      ratingCount: r.ratingCount,
      phone: r.phone || null,
      whatsapp: r.whatsapp,
      serviceMode: r.serviceMode,
    },
    area: r.area,
    city: r.city,
    distanceMeters: r.distanceMeters == null ? null : Math.round(r.distanceMeters),
    position: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
    isSponsored: !!opts.sponsored,
    ...(opts.saved ? { isSaved: opts.saved.has(r.id) } : {}),
    createdAt: r.createdAt.toISOString(),
  };
}
