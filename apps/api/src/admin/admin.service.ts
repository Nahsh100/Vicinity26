import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../common/audit.service';
import { AuthGuard, type AuthUser } from '../common/auth';
import { BadRequest, Forbidden, NotFound } from '../common/errors';
import { keyset, toPage } from '../common/response';
import { num } from '../common/util';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';

export const pageQuery = z.object({
  q: z.string().trim().max(120).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const usersQuery = pageQuery.extend({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional() });
export const providersQuery = pageQuery.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED']).optional(),
  verification: z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']).optional(),
});
export const listingsQuery = pageQuery.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'REMOVED']).optional(),
  reported: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
export const reportsQuery = pageQuery.extend({
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN'),
  targetType: z.enum(['REVIEW', 'PROVIDER', 'LISTING', 'ORGANIZATION', 'USER']).optional(),
});
export const auditQuery = pageQuery.extend({ action: z.string().max(80).optional(), actorId: z.string().uuid().optional() });
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const verificationSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED', 'PENDING', 'UNVERIFIED']),
  note: z.string().trim().max(500).optional(),
});
export const resolveSchema = z.object({
  outcome: z.enum(['RESOLVED', 'DISMISSED']),
  note: z.string().trim().max(1000).optional(),
  /** Also act on the reported item: hide review / remove listing / suspend provider, user or organization. */
  actOnTarget: z.boolean().default(false),
});
export const rolesSchema = z.object({ roles: z.array(z.string().max(40)).max(10) });
export const planSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9_]+$/).max(40),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  priceMonthly: z.number().min(0),
  currency: z.string().length(3).default('ZMW'),
  entitlements: z.record(z.string(), z.union([z.number(), z.boolean()])),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export const promotionSchema = z.object({
  listingId: z.string().uuid(),
  placement: z.enum(['SEARCH', 'HOME']).default('SEARCH'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
export const grantSubscriptionSchema = z.object({
  planCode: z.string().max(40),
  months: z.number().int().min(1).max(24),
  note: z.string().trim().max(300).optional(),
});

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  suspendedReason: true,
  emailVerifiedAt: true,
  createdAt: true,
  lastLoginAt: true,
  provider: { select: { id: true, displayName: true, status: true } },
  adminRoles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;

/**
 * Administration. Every method is reached only through controllers guarded by RequirePermissions,
 * and every change is written to the audit log with the acting admin.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly guard: AuthGuard,
    private readonly notifications: NotificationsService,
    private readonly reviews: ReviewsService,
  ) {}

  // ───────── Dashboard ─────────

  async dashboard() {
    const since7 = new Date(Date.now() - 7 * 86400_000);
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const [users, providers, listings, activeListings, organizations, groups, newUsers7, newUsers30, openReports, pendingVerification, signups] =
      await Promise.all([
        this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
        this.prisma.provider.count({ where: { deletedAt: null } }),
        this.prisma.listing.count({ where: { deletedAt: null } }),
        this.prisma.listing.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        this.prisma.organization.count({ where: { deletedAt: null } }),
        this.prisma.group.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { createdAt: { gte: since7 } } }),
        this.prisma.user.count({ where: { createdAt: { gte: since30 } } }),
        this.prisma.moderationReport.count({ where: { status: 'OPEN' } }),
        this.prisma.provider.count({ where: { verificationStatus: 'PENDING', deletedAt: null } }),
        this.prisma.$queryRaw<{ date: Date; users: number; providers: number }[]>`
          SELECT d::date AS "date",
                 (SELECT count(*)::int FROM "User" u WHERE (u."createdAt" AT TIME ZONE 'Africa/Lusaka')::date = d::date) AS "users",
                 (SELECT count(*)::int FROM "Provider" p WHERE (p."createdAt" AT TIME ZONE 'Africa/Lusaka')::date = d::date) AS "providers"
            FROM generate_series((now() AT TIME ZONE 'Africa/Lusaka')::date - 29, (now() AT TIME ZONE 'Africa/Lusaka')::date, interval '1 day') d
           ORDER BY d`,
      ]);
    void since30;
    return {
      totals: { users, providers, listings, activeListings, organizations, groups },
      newRegistrations: { last7Days: newUsers7, last30Days: newUsers30 },
      openReports,
      pendingVerification,
      signups: signups.map((s) => ({ date: s.date.toISOString().slice(0, 10), users: s.users, providers: s.providers })),
    };
  }

  // ───────── Users ─────────

  async users(q: z.infer<typeof usersQuery>) {
    const rows = await this.prisma.user.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: userSelect,
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (u) => this.toAdminUser(u));
  }

  async user(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!u) throw NotFound('User');
    const [activity, counts] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { OR: [{ actorId: id }, { targetId: id }] }, orderBy: { createdAt: 'desc' }, take: 50 }),
      Promise.all([
        this.prisma.review.count({ where: { authorId: id } }),
        this.prisma.enquiry.count({ where: { customerId: id } }),
        this.prisma.organizationMembership.count({ where: { userId: id } }),
        this.prisma.moderationReport.count({ where: { targetType: 'USER', targetId: id } }),
      ]),
    ]);
    return {
      ...this.toAdminUser(u),
      counts: { reviews: counts[0], enquiries: counts[1], organizations: counts[2], reportsAgainst: counts[3] },
      activity: activity.map((a) => ({ id: a.id, action: a.action, actorId: a.actorId, targetType: a.targetType, targetId: a.targetId, createdAt: a.createdAt.toISOString() })),
    };
  }

  async setUserStatus(admin: AuthUser, id: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string) {
    if (id === admin.id) throw BadRequest('You cannot change your own account status');
    const u = await this.prisma.user.findUnique({ where: { id }, include: { adminRoles: { include: { role: true } } } });
    if (!u || u.status === 'DELETED') throw NotFound('User');
    if (u.adminRoles.some((r) => r.role.code === 'SUPER_ADMIN') && !admin.adminPermissions.has('*')) throw Forbidden('Only a super admin can suspend a super admin');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status, suspendedReason: status === 'SUSPENDED' ? (reason ?? null) : null } }),
      ...(status === 'SUSPENDED' ? [this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
    ]);
    this.guard.invalidate(id);
    await this.audit.log({ actorId: admin.id, action: status === 'SUSPENDED' ? 'admin.user_suspend' : 'admin.user_reactivate', targetType: 'User', targetId: id, metadata: { reason } });
    return this.user(id);
  }

  async setUserRoles(admin: AuthUser, id: string, roles: string[]) {
    const found = await this.prisma.adminRole.findMany({ where: { code: { in: roles } } });
    if (found.length !== roles.length) throw BadRequest('Unknown role');
    if (id === admin.id && !roles.includes('SUPER_ADMIN') && admin.adminPermissions.has('*')) {
      throw BadRequest('You cannot remove your own super admin role');
    }
    await this.prisma.$transaction([
      this.prisma.userAdminRole.deleteMany({ where: { userId: id } }),
      this.prisma.userAdminRole.createMany({ data: found.map((r) => ({ userId: id, roleId: r.id })) }),
    ]);
    this.guard.invalidate(id);
    await this.audit.log({ actorId: admin.id, action: 'admin.user_roles', targetType: 'User', targetId: id, metadata: { roles } });
    return this.user(id);
  }

  async roles() {
    const rows = await this.prisma.adminRole.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { code: 'asc' } });
    return rows.map((r) => ({ code: r.code, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permission.code) }));
  }

  // ───────── Providers ─────────

  async providers(q: z.infer<typeof providersQuery>) {
    const rows = await this.prisma.provider.findMany({
      where: {
        deletedAt: null,
        ...(q.status ? { status: q.status } : {}),
        ...(q.verification ? { verificationStatus: q.verification } : {}),
        ...(q.q ? { OR: [{ displayName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, email: true, fullName: true } }, primaryCategory: { select: { name: true } }, _count: { select: { listings: { where: { deletedAt: null } } } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      type: p.type,
      status: p.status,
      verificationStatus: p.verificationStatus,
      ratingAverage: num(p.ratingAverage),
      ratingCount: p.ratingCount,
      listingCount: p._count.listings,
      category: p.primaryCategory?.name ?? null,
      owner: p.user,
      logoUrl: this.media.url(p.logoMediaId),
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async provider(id: string) {
    const p = await this.prisma.provider.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true } },
        credentials: true,
        primaryCategory: true,
        _count: { select: { listings: true, reviews: true, enquiries: true, portfolio: true } },
      },
    });
    if (!p) throw NotFound('Provider');
    const reports = await this.prisma.moderationReport.findMany({ where: { targetType: 'PROVIDER', targetId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return {
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      type: p.type,
      tagline: p.tagline,
      bio: p.bio,
      phone: p.phone,
      whatsapp: p.whatsapp,
      email: p.email,
      status: p.status,
      verificationStatus: p.verificationStatus,
      verificationNote: p.verificationNote,
      verifiedAt: p.verifiedAt?.toISOString() ?? null,
      ratingAverage: num(p.ratingAverage),
      ratingCount: p.ratingCount,
      logoUrl: this.media.url(p.logoMediaId),
      coverUrl: this.media.url(p.coverMediaId),
      owner: p.user,
      category: p.primaryCategory?.name ?? null,
      counts: p._count,
      credentials: p.credentials.map((c) => ({ id: c.id, title: c.title, issuer: c.issuer, isPublic: c.isPublic, documentUrl: this.media.url(c.mediaId) })),
      reports: reports.map((r) => ({ id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt.toISOString() })),
      createdAt: p.createdAt.toISOString(),
      publishedAt: p.publishedAt?.toISOString() ?? null,
    };
  }

  async setVerification(admin: AuthUser, id: string, input: z.infer<typeof verificationSchema>) {
    const p = await this.prisma.provider.update({
      where: { id },
      data: {
        verificationStatus: input.status,
        verificationNote: input.note ?? null,
        verifiedAt: input.status === 'VERIFIED' ? new Date() : null,
      },
    });
    await this.audit.log({ actorId: admin.id, action: 'admin.provider_verification', targetType: 'Provider', targetId: id, metadata: input });
    const messages: Record<string, string> = {
      VERIFIED: 'Your business is now verified. A verified badge shows on your profile.',
      REJECTED: 'We could not verify your business. Check your credentials and try again.',
      PENDING: 'Your verification is being reviewed.',
      UNVERIFIED: 'Your verification status was reset.',
    };
    await this.notifications.notify(p.userId, {
      category: 'ACCOUNT',
      title: 'Verification update',
      body: messages[input.status]!,
      data: { type: 'verification', status: input.status },
    });
    return this.provider(id);
  }

  async setProviderStatus(admin: AuthUser, id: string, suspend: boolean, reason?: string) {
    const p = await this.prisma.provider.findUnique({ where: { id } });
    if (!p) throw NotFound('Provider');
    await this.prisma.provider.update({
      where: { id },
      data: { status: suspend ? 'SUSPENDED' : p.publishedAt ? 'ACTIVE' : 'DRAFT', verificationNote: reason ?? p.verificationNote },
    });
    await this.audit.log({ actorId: admin.id, action: suspend ? 'admin.provider_suspend' : 'admin.provider_reactivate', targetType: 'Provider', targetId: id, metadata: { reason } });
    await this.notifications.notify(p.userId, {
      category: 'ACCOUNT',
      title: suspend ? 'Your business profile was suspended' : 'Your business profile is active again',
      body: suspend ? (reason ?? 'Contact support for details.') : 'Customers can find you again.',
      data: { type: 'provider_status' },
    });
    return this.provider(id);
  }

  // ───────── Listings ─────────

  async listings(q: z.infer<typeof listingsQuery>) {
    let reportedIds: string[] | undefined;
    if (q.reported) {
      const r = await this.prisma.moderationReport.findMany({ where: { targetType: 'LISTING', status: 'OPEN' }, select: { targetId: true }, distinct: ['targetId'] });
      reportedIds = r.map((x) => x.targetId);
    }
    const rows = await this.prisma.listing.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(reportedIds ? { id: { in: reportedIds } } : {}),
        ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { provider: { displayName: { contains: q.q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { provider: { select: { id: true, displayName: true } }, category: { select: { name: true } }, media: { take: 1, orderBy: { sortOrder: 'asc' } } },
      ...keyset(q.cursor, q.limit),
    });
    const reportCounts = await this.prisma.moderationReport.groupBy({
      by: ['targetId'],
      where: { targetType: 'LISTING', status: 'OPEN', targetId: { in: rows.map((r) => r.id) } },
      _count: true,
    });
    const rc = new Map(reportCounts.map((r) => [r.targetId, r._count]));
    return toPage(rows, q.limit, (l) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      status: l.status,
      visibility: l.visibility,
      price: num(l.price),
      priceType: l.priceType,
      currency: l.currency,
      category: l.category.name,
      provider: l.provider,
      coverUrl: this.media.url(l.media[0]?.mediaId),
      openReports: rc.get(l.id) ?? 0,
      deleted: !!l.deletedAt,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  async setListingRemoved(admin: AuthUser, id: string, removed: boolean, reason?: string) {
    const l = await this.prisma.listing.findUnique({ where: { id }, include: { provider: true } });
    if (!l) throw NotFound('Listing');
    await this.prisma.listing.update({ where: { id }, data: { status: removed ? 'REMOVED' : 'PAUSED' } });
    await this.audit.log({ actorId: admin.id, action: removed ? 'admin.listing_remove' : 'admin.listing_restore', targetType: 'Listing', targetId: id, metadata: { reason } });
    await this.notifications.notify(l.provider.userId, {
      category: 'ACCOUNT',
      title: removed ? `"${l.title}" was removed` : `"${l.title}" was restored`,
      body: removed ? (reason ?? 'It did not meet our listing guidelines.') : 'It is paused: resume it from your listings when ready.',
      data: { type: 'listing_moderation', listingId: id },
    });
    return { id, status: removed ? 'REMOVED' : 'PAUSED' };
  }

  // ───────── Reviews ─────────

  async setReviewStatus(admin: AuthUser, id: string, status: 'PUBLISHED' | 'HIDDEN') {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw NotFound('Review');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { status } });
      await this.reviews.recalculate(tx, r.providerId);
    });
    await this.audit.log({ actorId: admin.id, action: `admin.review_${status.toLowerCase()}`, targetType: 'Review', targetId: id });
    return { id, status };
  }

  // ───────── Organizations ─────────

  async organizations(q: z.infer<typeof pageQuery>) {
    const rows = await this.prisma.organization.findMany({
      where: { deletedAt: null, ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { owner: { select: { id: true, fullName: true, email: true } }, _count: { select: { memberships: true, groups: true, listings: true } } },
      ...keyset(q.cursor, q.limit),
    });
    const reportCounts = await this.prisma.moderationReport.groupBy({
      by: ['targetId'],
      where: { targetType: 'ORGANIZATION', status: 'OPEN', targetId: { in: rows.map((r) => r.id) } },
      _count: true,
    });
    const rc = new Map(reportCounts.map((r) => [r.targetId, r._count]));
    return toPage(rows, q.limit, (o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      status: o.status,
      isPrivate: o.isPrivate,
      owner: o.owner,
      counts: o._count,
      openReports: rc.get(o.id) ?? 0,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async setOrganizationStatus(admin: AuthUser, id: string, suspend: boolean, reason?: string) {
    await this.prisma.organization.update({ where: { id }, data: { status: suspend ? 'SUSPENDED' : 'ACTIVE' } });
    await this.audit.log({ actorId: admin.id, action: suspend ? 'admin.org_suspend' : 'admin.org_reactivate', targetType: 'Organization', targetId: id, metadata: { reason } });
    return { id, status: suspend ? 'SUSPENDED' : 'ACTIVE' };
  }

  // ───────── Reports ─────────

  async reports(q: z.infer<typeof reportsQuery>) {
    const rows = await this.prisma.moderationReport.findMany({
      where: { status: q.status, ...(q.targetType ? { targetType: q.targetType } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { reporter: { select: { id: true, fullName: true, email: true } }, resolvedBy: { select: { id: true, fullName: true } } },
      ...keyset(q.cursor, q.limit),
    });
    const page = toPage(rows, q.limit, (r) => r);
    const items = await Promise.all(
      page.items.map(async (r) => ({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        target: await this.describeTarget(r.targetType, r.targetId),
        reason: r.reason,
        details: r.details,
        status: r.status,
        resolutionNote: r.resolutionNote,
        reporter: r.reporter,
        resolvedBy: r.resolvedBy,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
    );
    return Object.assign(page, { items });
  }

  async resolveReport(admin: AuthUser, id: string, input: z.infer<typeof resolveSchema>) {
    const r = await this.prisma.moderationReport.findUnique({ where: { id } });
    if (!r) throw NotFound('Report');
    if (r.status !== 'OPEN') throw BadRequest('This report is already closed');

    if (input.actOnTarget && input.outcome === 'RESOLVED') {
      const note = input.note ?? `Report: ${r.reason}`;
      switch (r.targetType) {
        case 'REVIEW':
          await this.setReviewStatus(admin, r.targetId, 'HIDDEN');
          break;
        case 'LISTING':
          await this.setListingRemoved(admin, r.targetId, true, note);
          break;
        case 'PROVIDER':
          await this.setProviderStatus(admin, r.targetId, true, note);
          break;
        case 'ORGANIZATION':
          await this.setOrganizationStatus(admin, r.targetId, true, note);
          break;
        case 'USER':
          await this.setUserStatus(admin, r.targetId, 'SUSPENDED', note);
          break;
      }
    } else if (input.outcome === 'DISMISSED' && r.targetType === 'REVIEW') {
      // Auto-hidden reviews come back when all their reports are dismissed.
      const stillOpen = await this.prisma.moderationReport.count({ where: { targetType: 'REVIEW', targetId: r.targetId, status: 'OPEN', id: { not: id } } });
      const review = await this.prisma.review.findUnique({ where: { id: r.targetId } });
      if (!stillOpen && review?.status === 'PENDING') await this.setReviewStatus(admin, r.targetId, 'PUBLISHED');
    }

    // Close every open report about the same item with the same outcome.
    await this.prisma.moderationReport.updateMany({
      where: { targetType: r.targetType, targetId: r.targetId, status: 'OPEN' },
      data: { status: input.outcome, resolutionNote: input.note ?? null, resolvedById: admin.id, resolvedAt: new Date() },
    });
    await this.audit.log({ actorId: admin.id, action: 'admin.report_resolve', targetType: 'ModerationReport', targetId: id, metadata: input });
    return { id, status: input.outcome };
  }

  private async describeTarget(type: string, id: string): Promise<{ label: string; detail?: string | null } | null> {
    switch (type) {
      case 'REVIEW': {
        const r = await this.prisma.review.findUnique({ where: { id }, include: { provider: { select: { displayName: true } }, author: { select: { fullName: true } } } });
        return r ? { label: `${r.rating}★ review of ${r.provider.displayName} by ${r.author.fullName}`, detail: r.comment } : null;
      }
      case 'LISTING': {
        const l = await this.prisma.listing.findUnique({ where: { id }, include: { provider: { select: { displayName: true } } } });
        return l ? { label: `${l.title} — ${l.provider.displayName}`, detail: l.description } : null;
      }
      case 'PROVIDER': {
        const p = await this.prisma.provider.findUnique({ where: { id } });
        return p ? { label: p.displayName, detail: p.tagline } : null;
      }
      case 'ORGANIZATION': {
        const o = await this.prisma.organization.findUnique({ where: { id } });
        return o ? { label: o.name, detail: o.description } : null;
      }
      default: {
        const u = await this.prisma.user.findUnique({ where: { id } });
        return u ? { label: u.fullName, detail: u.email } : null;
      }
    }
  }

  // ───────── Monetization ─────────

  async plans() {
    const rows = await this.prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } } } });
    return rows.map((p) => ({ ...p, priceMonthly: num(p.priceMonthly), activeSubscriptions: p._count.subscriptions, _count: undefined }));
  }

  async upsertPlan(admin: AuthUser, input: z.infer<typeof planSchema>) {
    const data = { ...input, entitlements: input.entitlements as Prisma.InputJsonValue };
    const p = await this.prisma.subscriptionPlan.upsert({ where: { code: input.code }, create: data, update: data });
    await this.audit.log({ actorId: admin.id, action: 'admin.plan_upsert', targetType: 'SubscriptionPlan', targetId: p.id, metadata: input });
    return { ...p, priceMonthly: num(p.priceMonthly) };
  }

  /** Manually grants a plan (e.g. a partnership or an offline payment). No online payment is involved. */
  async grantSubscription(admin: AuthUser, providerId: string, input: z.infer<typeof grantSubscriptionSchema>) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw BadRequest('Unknown plan');
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + input.months);
    await this.prisma.$transaction([
      this.prisma.providerSubscription.updateMany({ where: { providerId, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'CANCELLED' } }),
      this.prisma.providerSubscription.create({ data: { providerId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: end } }),
    ]);
    await this.audit.log({ actorId: admin.id, action: 'admin.subscription_grant', targetType: 'Provider', targetId: providerId, metadata: input });
    return { providerId, plan: plan.code, currentPeriodEnd: end.toISOString() };
  }

  async promotions(q: z.infer<typeof pageQuery>) {
    const rows = await this.prisma.listingPromotion.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { listing: { select: { id: true, title: true } }, provider: { select: { id: true, displayName: true } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (p) => ({
      id: p.id,
      listing: p.listing,
      provider: p.provider,
      placement: p.placement,
      status: p.status,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async createPromotion(admin: AuthUser, input: z.infer<typeof promotionSchema>) {
    const l = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!l || l.deletedAt) throw NotFound('Listing');
    if (l.visibility !== 'PUBLIC') throw BadRequest('Only public listings can be promoted');
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) throw BadRequest('End must be after start');
    const now = new Date();
    const p = await this.prisma.listingPromotion.create({
      data: {
        listingId: l.id,
        providerId: l.providerId,
        placement: input.placement,
        startsAt,
        endsAt,
        status: startsAt <= now && endsAt > now ? 'ACTIVE' : 'SCHEDULED',
        createdById: admin.id,
      },
    });
    await this.audit.log({ actorId: admin.id, action: 'admin.promotion_create', targetType: 'ListingPromotion', targetId: p.id, metadata: input });
    return { id: p.id, status: p.status };
  }

  async cancelPromotion(admin: AuthUser, id: string) {
    await this.prisma.listingPromotion.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actorId: admin.id, action: 'admin.promotion_cancel', targetType: 'ListingPromotion', targetId: id });
    return { id, status: 'CANCELLED' };
  }

  // ───────── Audit ─────────

  async auditLog(q: z.infer<typeof auditQuery>) {
    const rows = await this.prisma.auditLog.findMany({
      where: { ...(q.action ? { action: { startsWith: q.action } } : {}), ...(q.actorId ? { actorId: q.actorId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { actor: { select: { id: true, fullName: true, email: true } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (a) => ({
      id: a.id,
      action: a.action,
      actor: a.actor,
      targetType: a.targetType,
      targetId: a.targetId,
      metadata: a.metadata,
      ip: a.ip,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private toAdminUser(u: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      status: u.status,
      suspendedReason: u.suspendedReason,
      emailVerified: !!u.emailVerifiedAt,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      provider: u.provider,
      adminRoles: u.adminRoles.map((r) => r.role.code),
    };
  }
}
