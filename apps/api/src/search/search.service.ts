import { Injectable, Logger } from '@nestjs/common';
import type { CategorySummary, ListingSummary, ProviderSummary, PublicStats, SearchMeta } from '@vicinity/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AuthUser } from '../common/auth';
import { BadRequest } from '../common/errors';
import { decodeCursor, encodeCursor, Page } from '../common/response';
import { CategoriesService, toCategorySummary } from '../categories/categories.service';
import { listingLocationJoin, listingSummaryColumns, toListingSummary, type ListingSummaryRow } from '../listings/listing.queries';
import { nearestPlace, resolvePlace } from '../locations/places';
import { MediaService } from '../media/media.service';
import { AccessService, type Memberships } from '../organizations/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { originSql, queryProviderSummaries, toProviderSummary } from '../providers/provider.queries';

const bool = z.enum(['true', 'false', '1', '0']).optional().transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

export const searchQueryShape = z.object({
    q: z.string().trim().max(120).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(0.5).max(200).optional(),
    area: z.string().trim().max(80).optional(),
    categoryId: z.string().uuid().optional(),
    listingType: z.enum(['SERVICE', 'PRODUCT']).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    organizationId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    verified: bool,
    availableOnly: bool,
    providerType: z.enum(['INDIVIDUAL', 'BUSINESS']).optional(),
    sort: z.enum(['relevance', 'distance', 'rating', 'price_asc', 'price_desc', 'newest']).default('relevance'),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchQuerySchema = searchQueryShape.superRefine((v, ctx) => {
    if ((v.lat === undefined) !== (v.lng === undefined)) ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Provide both lat and lng' });
    if (v.minPrice != null && v.maxPrice != null && v.maxPrice < v.minPrice) {
      ctx.addIssue({ code: 'custom', path: ['maxPrice'], message: 'maxPrice must be at least minPrice' });
    }
  });
export type SearchQuery = z.output<typeof searchQuerySchema>;

/** Relevance weights. Kept in one place so tuning does not require touching the SQL. */
export const RANK_WEIGHTS = { text: 0.45, distance: 0.2, rating: 0.15, quality: 0.08, recency: 0.06, availability: 0.06 };
const DEFAULT_RADIUS_KM = 10;
const AREA_RADIUS_KM = 5;

interface Cursor {
  sk: number;
  id: string;
  /** Fixed "now" (epoch seconds) so recency scores stay stable across pages. */
  t: number;
}

interface Resolved {
  origin: { lat: number; lng: number; label: string | null } | null;
  radiusKm: number | null;
  categoryIds: string[] | null;
  matchedCategories: CategorySummary[];
  memberships: Memberships;
  now: number;
}

/**
 * Listing search. One parameterised SQL statement combines full-text relevance (tsvector + GIN),
 * fuzzy matching (pg_trgm), category synonyms, PostGIS radius filtering (ST_DWithin on GiST indexes,
 * including providers' mobile service areas and delivery radii), price/rating/verification/type filters,
 * organization/group visibility, weighted ranking and keyset pagination.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger('Search');

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly access: AccessService,
    private readonly categories: CategoriesService,
    private readonly analytics: AnalyticsService,
  ) {}

  async search(viewer: AuthUser | undefined, q: SearchQuery): Promise<Page<ListingSummary>> {
    const cursor = q.cursor ? decodeCursor<Cursor>(q.cursor) : null;
    if (q.cursor && !cursor) throw BadRequest('Invalid cursor', 'INVALID_CURSOR');
    const r = await this.resolve(viewer, q, cursor?.t);

    const filters = this.filters(viewer, q, r);
    const { selectSql, sortKey } = this.rankedSelect(q, r, filters);

    const rows = await this.prisma.$queryRaw<(ListingSummaryRow & { sk: number })[]>`
      SELECT * FROM (${selectSql}) ranked
       ${cursor ? Prisma.sql`WHERE (ranked.sk, ranked."id") > (${cursor.sk}::float8, ${cursor.id}::uuid)` : Prisma.empty}
       ORDER BY ranked.sk ASC, ranked."id" ASC
       LIMIT ${q.limit + 1}`;

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ sk: last.sk, id: last.id, t: r.now } satisfies Cursor) : null;

    const saved = viewer ? await this.savedListingIds(viewer.id, page.map((x) => x.id)) : undefined;
    const firstPage = !cursor;
    const [sponsored, total] = firstPage
      ? await Promise.all([this.sponsored(q, r, filters, saved), this.count(filters)])
      : [[], undefined];

    if (firstPage) {
      this.analytics.recordSearchAppearances([...page.map((x) => x.providerId)]);
      this.logSearch(viewer?.id, q, r, total ?? page.length);
    }

    const meta: Omit<SearchMeta, 'nextCursor' | 'hasMore'> = {
      appliedRadiusKm: r.radiusKm,
      origin: r.origin,
      sponsored,
      matchedCategories: r.matchedCategories,
      ...(total !== undefined ? { total } : {}),
    };
    return new Page(
      page.map((row) => toListingSummary(row, this.media, { saved })),
      nextCursor,
      meta as Record<string, unknown>,
    );
  }

  /** Typeahead: categories (with synonyms), listing titles and provider names. */
  async suggest(q: string) {
    const term = q.trim();
    if (term.length < 2) return { categories: [], listings: [], providers: [] };
    const like = `%${term.toLowerCase()}%`;
    const [categories, titles, providers] = await Promise.all([
      this.categories.suggest(term, 5),
      this.prisma.$queryRaw<{ title: string }[]>`
        SELECT DISTINCT ON (lower(l."title")) l."title" FROM "Listing" l
         WHERE l."status" = 'ACTIVE' AND l."deletedAt" IS NULL AND l."visibility" = 'PUBLIC'
           AND (lower(vicinity_unaccent(l."title")) LIKE ${like} OR lower(vicinity_unaccent(l."title")) % lower(${term}))
         ORDER BY lower(l."title"), similarity(lower(l."title"), lower(${term})) DESC
         LIMIT 5`,
      this.prisma.$queryRaw<{ id: string; slug: string; displayName: string }[]>`
        SELECT p."id", p."slug", p."displayName" FROM "Provider" p
         WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
           AND (lower(vicinity_unaccent(p."displayName")) LIKE ${like} OR lower(vicinity_unaccent(p."displayName")) % lower(${term}))
         ORDER BY similarity(lower(p."displayName"), lower(${term})) DESC
         LIMIT 5`,
    ]);
    return { categories, listings: titles.map((t) => t.title), providers };
  }

  /** Home screen: nearby top-rated providers, popular & new listings, featured (sponsored) listings. */
  async home(viewer: AuthUser | undefined, o: { lat?: number; lng?: number; radiusKm?: number }) {
    const origin = o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null;
    const radiusM = origin ? (o.radiusKm ?? 20) * 1000 : null;
    const base = { lat: origin?.lat, lng: origin?.lng, radiusKm: origin ? (o.radiusKm ?? 20) : undefined, limit: 10 } as const;

    const savedProviders = viewer
      ? new Set((await this.prisma.favoriteProvider.findMany({ where: { userId: viewer.id }, select: { providerId: true } })).map((f) => f.providerId))
      : undefined;

    const [topRatedRows, nearbyRows, popular, newest, categories] = await Promise.all([
      queryProviderSummaries(this.prisma, {
        origin,
        radiusM,
        where: Prisma.sql`p."ratingCount" >= 1`,
        orderBy: Prisma.sql`(p."ratingAverage" * least(p."ratingCount", 20) / 20.0) DESC, p."ratingCount" DESC`,
        limit: 10,
      }),
      origin
        ? queryProviderSummaries(this.prisma, { origin, radiusM, orderBy: Prisma.sql`"distanceMeters" ASC NULLS LAST`, limit: 10 })
        : Promise.resolve([]),
      this.search(viewer, searchQuerySchema.parse({ ...base, sort: 'relevance' })),
      this.search(viewer, searchQuerySchema.parse({ ...base, sort: 'newest', limit: 6 })),
      this.categories.tree(),
    ]);

    return {
      origin: origin ? { ...origin, label: nearestPlace(origin.lat, origin.lng).name } : null,
      categories: categories.map((c) => ({ ...c, children: undefined })),
      topRated: topRatedRows.map((r) => toProviderSummary(r, this.media, savedProviders)) as ProviderSummary[],
      nearby: nearbyRows.map((r) => toProviderSummary(r, this.media, savedProviders)) as ProviderSummary[],
      popular: popular.items,
      featured: (popular.extra.sponsored as ListingSummary[]) ?? [],
      newListings: newest.items,
    };
  }

  /** Real platform numbers for the public landing page (cached 5 minutes). */
  private statsCache: { at: number; data: PublicStats } | null = null;
  async stats(): Promise<PublicStats> {
    if (this.statsCache && Date.now() - this.statsCache.at < 300_000) return this.statsCache.data;
    const [providers, verifiedProviders, listings, categories, rating] = await Promise.all([
      this.prisma.provider.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.provider.count({ where: { status: 'ACTIVE', deletedAt: null, verificationStatus: 'VERIFIED' } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null, visibility: 'PUBLIC' } }),
      this.prisma.category.count({ where: { isActive: true, deletedAt: null, parentId: { not: null } } }),
      this.prisma.review.aggregate({ where: { status: 'PUBLISHED' }, _avg: { rating: true }, _count: true }),
    ]);
    const data: PublicStats = {
      providers,
      verifiedProviders,
      listings,
      categories,
      averageRating: rating._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : null,
      reviews: rating._count,
    };
    this.statsCache = { at: Date.now(), data };
    return data;
  }

  // ───────── internals ─────────

  private async resolve(viewer: AuthUser | undefined, q: SearchQuery, fixedNow?: number): Promise<Resolved> {
    let origin: Resolved['origin'] = null;
    let radiusKm: number | null = null;
    if (q.lat != null && q.lng != null) {
      origin = { lat: q.lat, lng: q.lng, label: q.area ?? null };
      radiusKm = q.radiusKm ?? DEFAULT_RADIUS_KM;
    } else if (q.area) {
      // Manual neighbourhood/town: known gazetteer first, then the centroid of providers in that area.
      const place = resolvePlace(q.area);
      if (place) {
        origin = { lat: place.lat, lng: place.lng, label: place.name };
      } else {
        const c = await this.prisma.$queryRaw<{ lat: number | null; lng: number | null }[]>`
          SELECT ST_Y(ST_Centroid(ST_Collect("publicLocation"::geometry))) AS lat, ST_X(ST_Centroid(ST_Collect("publicLocation"::geometry))) AS lng
            FROM "ProviderLocation" WHERE lower("area") = lower(${q.area}) OR lower("city") = lower(${q.area})`;
        if (c[0]?.lat != null) origin = { lat: c[0].lat, lng: c[0].lng!, label: q.area };
      }
      if (!origin) throw BadRequest(`We don't know where "${q.area}" is yet. Try a nearby neighbourhood or use your location.`, 'UNKNOWN_AREA');
      radiusKm = q.radiusKm ?? (resolvePlace(q.area)?.kind === 'town' ? 20 : AREA_RADIUS_KM);
    }

    const memberships = await this.access.memberships(viewer?.id);
    if (q.organizationId || q.groupId) await this.access.assertSearchScope(memberships, q.organizationId, q.groupId);

    const categoryIds = q.categoryId ? await this.categories.expand(q.categoryId) : null;
    const matchedCategories = q.q ? await this.matchCategories(q.q) : [];

    return { origin, radiusKm, categoryIds, matchedCategories, memberships, now: fixedNow ?? Math.floor(Date.now() / 1000) };
  }

  /** Categories whose name or alias is contained in, or closely resembles, the query text. */
  private async matchCategories(q: string): Promise<CategorySummary[]> {
    const term = q.toLowerCase().trim();
    const rows = await this.prisma.$queryRaw<{ id: string; slug: string; name: string; icon: string | null; color: string | null; parentId: string | null }[]>`
      SELECT DISTINCT c."id", c."slug", c."name", c."icon", c."color", c."parentId" FROM "Category" c
        LEFT JOIN "CategoryAlias" a ON a."categoryId" = c."id"
       WHERE c."isActive" AND c."deletedAt" IS NULL AND (
             ${term} LIKE '%' || lower(c."name") || '%'
          OR ${term} LIKE '%' || lower(a."alias") || '%'
          OR similarity(lower(c."name"), ${term}) > 0.45
          OR similarity(lower(a."alias"), ${term}) > 0.45)
       LIMIT 10`;
    return rows.map(toCategorySummary);
  }

  /** WHERE clauses shared by results, sponsored placements and the total count. */
  private filters(viewer: AuthUser | undefined, q: SearchQuery, r: Resolved): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`l."status" = 'ACTIVE'`,
      Prisma.sql`l."deletedAt" IS NULL`,
      Prisma.sql`p."status" = 'ACTIVE'`,
      Prisma.sql`p."deletedAt" IS NULL`,
      this.access.visibilitySql(r.memberships, viewer?.providerId ?? null),
    ];
    if (q.listingType) parts.push(Prisma.sql`l."type" = ${q.listingType}::"ListingType"`);
    if (r.categoryIds) parts.push(Prisma.sql`l."categoryId" = ANY(${r.categoryIds}::uuid[])`);
    if (q.organizationId) parts.push(Prisma.sql`l."organizationId" = ${q.organizationId}::uuid`);
    if (q.groupId) parts.push(Prisma.sql`l."groupId" = ${q.groupId}::uuid`);
    if (q.minRating != null) parts.push(Prisma.sql`p."ratingAverage" >= ${q.minRating}`);
    if (q.verified) parts.push(Prisma.sql`p."verificationStatus" = 'VERIFIED'`);
    if (q.providerType) parts.push(Prisma.sql`p."type" = ${q.providerType}::"ProviderType"`);
    if (q.availableOnly) parts.push(Prisma.sql`l."isAvailable"`);
    if (q.minPrice != null) parts.push(Prisma.sql`coalesce(l."priceMax", l."price") >= ${q.minPrice}`);
    if (q.maxPrice != null) parts.push(Prisma.sql`l."price" <= ${q.maxPrice}`);

    if (q.q) {
      const term = q.q.toLowerCase();
      const prefix = this.prefixQuery(q.q);
      const catIds = r.matchedCategories.map((c) => c.id);
      parts.push(Prisma.sql`(
           l."searchVector" @@ (websearch_to_tsquery('english', vicinity_unaccent(${q.q})) || plainto_tsquery('simple', vicinity_unaccent(${q.q})))
        ${prefix ? Prisma.sql`OR l."searchVector" @@ to_tsquery('simple', ${prefix})` : Prisma.empty}
        OR lower(vicinity_unaccent(l."title")) % ${term}
        OR word_similarity(${term}, lower(vicinity_unaccent(p."displayName"))) > 0.6
        ${catIds.length ? Prisma.sql`OR l."categoryId" = ANY(${catIds}::uuid[])` : Prisma.empty}
      )`);
    }

    if (r.origin && r.radiusKm) {
      const o = originSql(r.origin);
      const m = r.radiusKm * 1000;
      // Inside the radius, OR the searcher is inside one of the provider's service areas (mobile services),
      // OR the product is delivered to the searcher's position.
      parts.push(Prisma.sql`(
           ST_DWithin(loc."publicLocation", ${o}, ${m})
        OR EXISTS (SELECT 1 FROM "ServiceArea" sa WHERE sa."providerId" = l."providerId" AND ST_DWithin(sa."center", ${o}, sa."radiusKm" * 1000))
        OR (l."type" = 'PRODUCT' AND EXISTS (
              SELECT 1 FROM "ProductDetails" pd WHERE pd."listingId" = l."id" AND pd."deliveryAvailable"
                 AND pd."deliveryRadiusKm" IS NOT NULL AND ST_DWithin(loc."publicLocation", ${o}, pd."deliveryRadiusKm" * 1000)))
      )`);
    }
    return Prisma.join(parts, ' AND ');
  }

  /** Builds `tok1:* & tok2:*` from user text so partial words match ("plumb" -> plumbing). */
  private prefixQuery(q: string): string | null {
    const tokens = q
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 6);
    return tokens.length ? tokens.map((t) => `${t}:*`).join(' & ') : null;
  }

  private rankedSelect(q: SearchQuery, r: Resolved, filters: Prisma.Sql) {
    const origin = r.origin ? originSql(r.origin) : null;
    const distance = origin ? Prisma.sql`ST_Distance(loc."publicLocation", ${origin})` : Prisma.sql`NULL::float`;
    const w = RANK_WEIGHTS;
    const textRank = q.q
      ? Prisma.sql`least(1.0,
            ts_rank_cd(l."searchVector", websearch_to_tsquery('english', vicinity_unaccent(${q.q})) || plainto_tsquery('simple', vicinity_unaccent(${q.q})), 32) * 2
          + similarity(lower(vicinity_unaccent(l."title")), ${q.q.toLowerCase()}) * 0.6
          + ${r.matchedCategories.length ? Prisma.sql`CASE WHEN l."categoryId" = ANY(${r.matchedCategories.map((c) => c.id)}::uuid[]) THEN 0.35 ELSE 0 END` : Prisma.sql`0`})`
      : Prisma.sql`0`;
    const distanceScore = origin ? Prisma.sql`(1.0 / (1.0 + coalesce(${distance}, 50000) / 1000.0))` : Prisma.sql`0`;
    const ratingScore = Prisma.sql`((p."ratingAverage"::float / 5.0) * least(p."ratingCount", 10) / 10.0)`;
    const recency = Prisma.sql`exp(-greatest(0, ${r.now}::float8 - extract(epoch FROM coalesce(l."publishedAt", l."createdAt"))) / (86400.0 * 90))`;

    const score = Prisma.sql`(
        ${q.q ? w.text : 0}::float8 * ${textRank}
      + ${origin ? w.distance : 0}::float8 * ${distanceScore}
      + ${w.rating}::float8 * ${ratingScore}
      + ${w.quality}::float8 * (l."qualityScore"::float / 100.0)
      + ${w.recency}::float8 * ${recency}
      + ${w.availability}::float8 * (CASE WHEN l."isAvailable" THEN 1 ELSE 0 END))`;

    const sortKey: Record<SearchQuery['sort'], Prisma.Sql> = {
      relevance: Prisma.sql`-${score}`,
      distance: origin ? Prisma.sql`coalesce(${distance}, 1e12)` : Prisma.sql`-${score}`,
      rating: Prisma.sql`-(p."ratingAverage"::float * 1e6 + least(p."ratingCount", 999999))`,
      price_asc: Prisma.sql`coalesce(l."price"::float, 1e15)`,
      price_desc: Prisma.sql`coalesce(-l."price"::float, 1e15)`,
      newest: Prisma.sql`-extract(epoch FROM coalesce(l."publishedAt", l."createdAt"))`,
    };

    const selectSql = Prisma.sql`
      SELECT ${listingSummaryColumns(distance)}, (${sortKey[q.sort]})::float8 AS sk
        FROM "Listing" l ${listingLocationJoin}
       WHERE ${filters}`;
    return { selectSql, sortKey: sortKey[q.sort] };
  }

  private async sponsored(q: SearchQuery, r: Resolved, filters: Prisma.Sql, saved?: Set<string>): Promise<ListingSummary[]> {
    const origin = r.origin ? originSql(r.origin) : null;
    const distance = origin ? Prisma.sql`ST_Distance(loc."publicLocation", ${origin})` : Prisma.sql`NULL::float`;
    const rows = await this.prisma.$queryRaw<ListingSummaryRow[]>`
      SELECT ${listingSummaryColumns(distance)}
        FROM "Listing" l ${listingLocationJoin}
        JOIN "ListingPromotion" pr ON pr."listingId" = l."id" AND pr."status" = 'ACTIVE' AND pr."placement" = 'SEARCH'
             AND pr."startsAt" <= now() AND pr."endsAt" > now()
       WHERE ${filters}
       ORDER BY random()
       LIMIT 2`;
    return rows.map((row) => toListingSummary(row, this.media, { sponsored: true, saved }));
  }

  private async count(filters: Prisma.Sql): Promise<number> {
    const [c] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Listing" l ${listingLocationJoin} WHERE ${filters}`;
    return c?.n ?? 0;
  }

  private async savedListingIds(userId: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.prisma.favoriteListing.findMany({ where: { userId, listingId: { in: ids } }, select: { listingId: true } });
    return new Set(rows.map((r) => r.listingId));
  }

  private logSearch(userId: string | undefined, q: SearchQuery, r: Resolved, resultCount: number) {
    if (!q.q && !q.categoryId) return;
    this.prisma.searchEvent
      .create({
        data: {
          userId: userId ?? null,
          query: q.q ?? null,
          categoryId: q.categoryId ?? null,
          // ~1 km precision: enough for demand insights, not enough to locate a person.
          latRounded: r.origin ? Math.round(r.origin.lat * 100) / 100 : null,
          lngRounded: r.origin ? Math.round(r.origin.lng * 100) / 100 : null,
          radiusKm: r.radiusKm,
          resultCount,
        },
      })
      .catch((e) => this.logger.warn(`search log failed: ${(e as Error).message}`));
  }
}
