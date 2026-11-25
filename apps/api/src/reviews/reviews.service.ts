import { Injectable } from '@nestjs/common';
import type { RatingSummary, Review, ReviewInput } from '@vicinity/shared';
import { Prisma } from '../generated/prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AuthUser } from '../common/auth';
import { BadRequest, Forbidden, NotFound } from '../common/errors';
import { keyset, toPage } from '../common/response';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const LINK = /(https?:\/\/|www\.|\.com\b|\.co\.zm\b)/i;

const reviewInclude = {
  author: { select: { id: true, fullName: true, avatarMediaId: true, status: true } },
  listing: { select: { id: true, title: true } },
  response: true,
  media: { include: { media: true } },
} satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Creates or updates the user's single review of a provider. The "verified interaction" flag is set
   * by the server only: it is true when the author previously enquired or tapped to contact the provider.
   * Reviews containing links are held for moderation.
   */
  async upsert(user: AuthUser, providerId: string, input: ReviewInput) {
    const provider = await this.prisma.provider.findFirst({ where: { id: providerId, status: 'ACTIVE', deletedAt: null } });
    if (!provider) throw NotFound('Provider');
    if (provider.userId === user.id) throw Forbidden('You cannot review your own business');
    const author = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true, phoneVerifiedAt: true } });
    // A confirmed email or an SMS-verified phone both prove a real, reachable person.
    if (!author.emailVerifiedAt && !author.phoneVerifiedAt) throw Forbidden('Confirm your email address before writing reviews');
    if (input.listingId) {
      const l = await this.prisma.listing.findFirst({ where: { id: input.listingId, providerId } });
      if (!l) throw BadRequest('That listing does not belong to this provider');
    }
    const mediaIds = await this.media.assertUsable(user.id, input.mediaIds ?? [], ['REVIEW']);
    const interaction =
      (await this.prisma.booking.findFirst({ where: { customerId: user.id, providerId, status: 'COMPLETED' }, select: { id: true } })) ??
      (await this.prisma.contactEvent.findFirst({ where: { userId: user.id, providerId }, select: { id: true } }));
    const status = input.comment && LINK.test(input.comment) ? 'PENDING' : 'PUBLISHED';

    const existing = await this.prisma.review.findUnique({ where: { authorId_providerId: { authorId: user.id, providerId } } });
    const review = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.upsert({
        where: { authorId_providerId: { authorId: user.id, providerId } },
        create: {
          providerId,
          authorId: user.id,
          listingId: input.listingId ?? null,
          rating: input.rating,
          comment: input.comment || null,
          status,
          isVerifiedInteraction: !!interaction,
        },
        update: {
          listingId: input.listingId ?? null,
          rating: input.rating,
          comment: input.comment || null,
          // An edited review that was hidden by moderators stays hidden.
          status: existing?.status === 'HIDDEN' ? 'HIDDEN' : status,
          isVerifiedInteraction: !!interaction,
        },
      });
      await tx.reviewMedia.deleteMany({ where: { reviewId: r.id } });
      if (mediaIds.length) await tx.reviewMedia.createMany({ data: mediaIds.map((mediaId) => ({ reviewId: r.id, mediaId })) });
      await this.recalculate(tx, providerId);
      return r;
    });

    if (!existing) {
      await this.analytics.track('REVIEW', providerId, { userId: user.id });
      await this.notifications.notify(provider.userId, {
        category: 'REVIEW',
        title: `New ${input.rating}-star review`,
        body: input.comment ? input.comment.slice(0, 140) : 'A customer rated your business.',
        data: { type: 'review', reviewId: review.id, providerId },
        dedupeKey: `review:${review.id}`,
      });
    }
    return this.get(review.id);
  }

  async remove(user: AuthUser, id: string) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r || r.authorId !== user.id) throw NotFound('Review');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await this.recalculate(tx, r.providerId);
    });
    return { deleted: true };
  }

  async respond(user: AuthUser, providerId: string, reviewId: string, body: string) {
    const r = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!r || r.providerId !== providerId) throw NotFound('Review');
    await this.prisma.reviewResponse.upsert({
      where: { reviewId },
      create: { reviewId, providerId, body },
      update: { body },
    });
    const p = await this.prisma.provider.findUniqueOrThrow({ where: { id: providerId }, select: { displayName: true } });
    await this.notifications.notify(r.authorId, {
      category: 'REVIEW',
      title: `${p.displayName} replied to your review`,
      body: body.slice(0, 140),
      data: { type: 'review_response', reviewId, providerId },
      dedupeKey: `review-response:${reviewId}`,
    });
    return this.get(reviewId);
  }

  async forProvider(providerId: string, q: { cursor?: string; limit: number; viewerId?: string }) {
    const rows = await this.prisma.review.findMany({
      where: { providerId, OR: [{ status: 'PUBLISHED' }, ...(q.viewerId ? [{ authorId: q.viewerId }] : [])] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: reviewInclude,
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (r) => this.toReview(r));
  }

  async summary(providerId: string): Promise<RatingSummary> {
    const rows = await this.prisma.review.groupBy({ by: ['rating'], where: { providerId, status: 'PUBLISHED' }, _count: true });
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary['distribution'];
    let total = 0;
    let sum = 0;
    for (const r of rows) {
      distribution[r.rating as 1 | 2 | 3 | 4 | 5] = r._count;
      total += r._count;
      sum += r.rating * r._count;
    }
    return { average: total ? Math.round((sum / total) * 100) / 100 : 0, count: total, distribution };
  }

  async mine(user: AuthUser, providerId: string) {
    const r = await this.prisma.review.findUnique({ where: { authorId_providerId: { authorId: user.id, providerId } }, include: reviewInclude });
    return r ? this.toReview(r) : null;
  }

  async get(id: string): Promise<Review> {
    const r = await this.prisma.review.findUnique({ where: { id }, include: reviewInclude });
    if (!r) throw NotFound('Review');
    return this.toReview(r);
  }

  /** Rating summary is maintained on the provider row from published reviews only, inside the same transaction. */
  async recalculate(tx: Prisma.TransactionClient, providerId: string) {
    await tx.$executeRaw`
      UPDATE "Provider" p SET
        "ratingAverage" = coalesce((SELECT round(avg(r."rating")::numeric, 2) FROM "Review" r WHERE r."providerId" = p."id" AND r."status" = 'PUBLISHED'), 0),
        "ratingCount"   = (SELECT count(*) FROM "Review" r WHERE r."providerId" = p."id" AND r."status" = 'PUBLISHED')
      WHERE p."id" = ${providerId}::uuid`;
  }

  private toReview(r: ReviewRow): Review {
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      author: {
        id: r.author.id,
        fullName: r.author.status === 'DELETED' ? 'Deleted user' : r.author.fullName,
        avatarUrl: r.author.status === 'DELETED' ? null : this.media.url(r.author.avatarMediaId),
      },
      listing: r.listing,
      media: r.media.map((m) => this.media.ref(m.media)),
      isVerifiedInteraction: r.isVerifiedInteraction,
      response: r.response ? { body: r.response.body, createdAt: r.response.createdAt.toISOString() } : null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
