import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { ProviderAnalytics } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type EventType = 'PROFILE_VIEW' | 'LISTING_VIEW' | 'CONTACT_PHONE' | 'CONTACT_WHATSAPP' | 'CONTACT_EMAIL' | 'ENQUIRY' | 'FAVORITE' | 'REVIEW';

const COLUMN: Record<EventType, string> = {
  PROFILE_VIEW: 'profileViews',
  LISTING_VIEW: 'listingViews',
  CONTACT_PHONE: 'phoneClicks',
  CONTACT_WHATSAPP: 'whatsappClicks',
  CONTACT_EMAIL: 'emailClicks',
  ENQUIRY: 'enquiries',
  FAVORITE: 'favorites',
  REVIEW: 'reviews',
};

/** Raw events are kept this long; daily aggregates are kept indefinitely. */
const RAW_RETENTION_DAYS = 90;

/**
 * Provider analytics. Each event is written once to AnalyticsEvent (raw, pruned after 90 days) and
 * counted into ProviderAnalyticsDaily (one row per provider per Lusaka day) which dashboards read.
 * Search appearances are counted straight into the daily table in one statement per search,
 * so they never create per-result rows.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('Analytics');

  constructor(private readonly prisma: PrismaService) {}

  async track(type: EventType, providerId: string, opts: { listingId?: string | null; userId?: string | null; ownerUserId?: string | null } = {}) {
    // The provider's own activity on their profile is not counted.
    if (opts.userId && opts.ownerUserId && opts.userId === opts.ownerUserId) return;
    try {
      await this.prisma.analyticsEvent.create({
        data: { type, providerId, listingId: opts.listingId ?? null, userId: opts.userId ?? null },
      });
      const col = Prisma.raw(`"${COLUMN[type]}"`);
      await this.prisma.$executeRaw`
        INSERT INTO "ProviderAnalyticsDaily" ("providerId", "date", ${col})
        VALUES (${providerId}::uuid, (now() AT TIME ZONE 'Africa/Lusaka')::date, 1)
        ON CONFLICT ("providerId", "date") DO UPDATE SET ${col} = "ProviderAnalyticsDaily".${col} + 1`;
    } catch (e) {
      this.logger.warn(`track ${type} failed: ${(e as Error).message}`);
    }
  }

  /** Counts one search appearance for each distinct provider in a result page. Fire and forget. */
  recordSearchAppearances(providerIds: string[]): void {
    const ids = [...new Set(providerIds)];
    if (!ids.length) return;
    this.prisma.$executeRaw`
      INSERT INTO "ProviderAnalyticsDaily" ("providerId", "date", "searchAppearances")
      SELECT p, (now() AT TIME ZONE 'Africa/Lusaka')::date, 1 FROM unnest(${ids}::uuid[]) AS p
      ON CONFLICT ("providerId", "date") DO UPDATE SET "searchAppearances" = "ProviderAnalyticsDaily"."searchAppearances" + 1`
      .catch((e) => this.logger.warn(`search appearances failed: ${(e as Error).message}`));
  }

  async forProvider(providerId: string, days: number): Promise<ProviderAnalytics> {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400_000);
    const rows = await this.prisma.$queryRaw<
      Array<{
        date: Date;
        profileViews: number;
        listingViews: number;
        searchAppearances: number;
        phoneClicks: number;
        whatsappClicks: number;
        emailClicks: number;
        enquiries: number;
        favorites: number;
        reviews: number;
      }>
    >`
      SELECT d::date AS "date",
             coalesce(a."profileViews", 0)::int AS "profileViews",
             coalesce(a."listingViews", 0)::int AS "listingViews",
             coalesce(a."searchAppearances", 0)::int AS "searchAppearances",
             coalesce(a."phoneClicks", 0)::int AS "phoneClicks",
             coalesce(a."whatsappClicks", 0)::int AS "whatsappClicks",
             coalesce(a."emailClicks", 0)::int AS "emailClicks",
             coalesce(a."enquiries", 0)::int AS "enquiries",
             coalesce(a."favorites", 0)::int AS "favorites",
             coalesce(a."reviews", 0)::int AS "reviews"
        FROM generate_series(
               ((now() AT TIME ZONE 'Africa/Lusaka')::date - ${days - 1}::int),
               (now() AT TIME ZONE 'Africa/Lusaka')::date,
               interval '1 day') d
        LEFT JOIN "ProviderAnalyticsDaily" a ON a."providerId" = ${providerId}::uuid AND a."date" = d::date
       ORDER BY d`;

    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
    return {
      range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      totals: {
        profileViews: sum('profileViews'),
        listingViews: sum('listingViews'),
        searchAppearances: sum('searchAppearances'),
        phoneClicks: sum('phoneClicks'),
        whatsappClicks: sum('whatsappClicks'),
        enquiries: sum('enquiries'),
        favorites: sum('favorites'),
        reviews: sum('reviews'),
      },
      daily: rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        profileViews: r.profileViews,
        listingViews: r.listingViews,
        searchAppearances: r.searchAppearances,
        contactClicks: r.phoneClicks + r.whatsappClicks + r.emailClicks,
        enquiries: r.enquiries,
      })),
    };
  }

  /** Nightly: drop raw events past retention (aggregates already hold the counts). */
  @Cron('0 30 1 * * *', { name: 'analytics-prune', timeZone: 'Africa/Lusaka' })
  async prune(): Promise<void> {
    const r = await this.prisma.analyticsEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RAW_RETENTION_DAYS * 86400_000) } },
    });
    const s = await this.prisma.searchEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 180 * 86400_000) } },
    });
    if (r.count || s.count) this.logger.log(`pruned ${r.count} analytics events, ${s.count} search events`);
  }
}
