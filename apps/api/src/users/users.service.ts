import { Injectable } from '@nestjs/common';
import type { UpdateProfileInput } from '@vicinity/shared';
import { AuditService } from '../common/audit.service';
import { AuthGuard } from '../common/auth';
import { BadRequest } from '../common/errors';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { meSelect, toCurrentUser } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly guard: AuthGuard,
  ) {}

  async update(userId: string, input: UpdateProfileInput & { phone?: string }) {
    if (input.avatarMediaId) await this.media.assertUsable(userId, [input.avatarMediaId], ['AVATAR']);
    if (input.phone !== undefined) {
      // A verified number is a sign-in identifier: it only changes through an SMS-confirmed flow.
      const cur = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true, phoneVerifiedAt: true } });
      const next = input.phone === '' ? null : input.phone;
      if (cur.phoneVerifiedAt && next !== cur.phone) {
        throw BadRequest('Your phone number is used to sign in. Change it from Account & security, where we confirm the new number by SMS.', 'PHONE_LOCKED');
      }
    }
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        phone: input.phone === '' ? null : input.phone,
        bio: input.bio === '' ? null : input.bio,
        locationName: input.locationName === '' ? null : input.locationName,
        avatarMediaId: input.avatarMediaId,
      },
      select: meSelect,
    });
    return toCurrentUser(u, this.media);
  }

  async recentSearches(userId: string) {
    const rows = await this.prisma.searchEvent.findMany({
      where: { userId, query: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { query: true },
    });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const q = r.query!.trim();
      if (q && !seen.has(q.toLowerCase())) {
        seen.add(q.toLowerCase());
        out.push(q);
      }
      if (out.length === 8) break;
    }
    return out;
  }

  async clearRecentSearches(userId: string) {
    await this.prisma.searchEvent.updateMany({ where: { userId }, data: { userId: null } });
    return { cleared: true };
  }

  /** Everything we hold about the user, as JSON (data portability). */
  async exportData(userId: string) {
    const [user, provider, reviews, favorites, favoriteListings, enquiries, orgs, groups, notifications] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, phone: true, bio: true, locationName: true, createdAt: true, emailVerifiedAt: true },
      }),
      this.prisma.provider.findUnique({
        where: { userId },
        include: { listings: { where: { deletedAt: null } }, portfolio: true, serviceAreas: { select: { id: true, name: true, radiusKm: true } } },
      }),
      this.prisma.review.findMany({ where: { authorId: userId } }),
      this.prisma.favoriteProvider.findMany({ where: { userId } }),
      this.prisma.favoriteListing.findMany({ where: { userId } }),
      this.prisma.enquiry.findMany({ where: { customerId: userId } }),
      this.prisma.organizationMembership.findMany({ where: { userId }, include: { organization: { select: { name: true } } } }),
      this.prisma.groupMembership.findMany({ where: { userId }, include: { group: { select: { name: true } } } }),
      this.prisma.notification.findMany({ where: { userId }, take: 500, orderBy: { createdAt: 'desc' } }),
    ]);
    await this.audit.log({ actorId: userId, action: 'user.data_export', targetType: 'User', targetId: userId });
    return { exportedAt: new Date().toISOString(), user, provider, reviews, favorites, favoriteListings, enquiries, organizations: orgs, groups, notifications };
  }

  /**
   * Deletes the account: personal data is erased, the provider storefront and listings are removed
   * from discovery, sessions and devices are revoked. Reviews stay (author shown as "Deleted user").
   */
  async deleteAccount(userId: string) {
    const owned = await this.prisma.organization.count({ where: { ownerId: userId, deletedAt: null } });
    if (owned) {
      throw BadRequest('Transfer or delete the organizations you own before deleting your account', 'OWNS_ORGANIZATIONS');
    }
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.provider.updateMany({ where: { userId }, data: { status: 'SUSPENDED', deletedAt: now, phone: '', whatsapp: null, email: null } });
      await tx.listing.updateMany({ where: { provider: { userId } }, data: { status: 'ARCHIVED', deletedAt: now } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.organizationMembership.deleteMany({ where: { userId } });
      await tx.groupMembership.deleteMany({ where: { userId } });
      await tx.favoriteProvider.deleteMany({ where: { userId } });
      await tx.favoriteListing.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: now,
          email: `deleted+${userId}@deleted.vicinity`,
          fullName: 'Deleted user',
          phone: null,
          phoneVerifiedAt: null,
          bio: null,
          locationName: null,
          avatarMediaId: null,
          passwordHash: '!',
        },
      });
    });
    this.guard.invalidate(userId);
    await this.audit.log({ actorId: userId, action: 'user.deleted', targetType: 'User', targetId: userId });
    return { deleted: true };
  }
}
