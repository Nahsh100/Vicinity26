import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { BadRequest, Forbidden } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export interface Memberships {
  orgRoles: Map<string, 'OWNER' | 'ADMIN' | 'MEMBER'>;
  groupRoles: Map<string, 'ADMIN' | 'MEMBER'>;
}

/**
 * Single source of truth for organization/group visibility rules. Listings, search and provider
 * profiles all go through here so restricted content is filtered the same way everywhere.
 *
 *   PUBLIC        visible to everyone (an organization tag on a public listing is informational)
 *   ORGANIZATION  visible to members of listing.organizationId
 *   GROUP         visible to members of listing.groupId
 *   The listing's own provider always sees it.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async memberships(userId: string | undefined): Promise<Memberships> {
    if (!userId) return { orgRoles: new Map(), groupRoles: new Map() };
    const [orgs, groups] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: { userId, organization: { deletedAt: null, status: 'ACTIVE' } },
        select: { organizationId: true, role: true },
      }),
      this.prisma.groupMembership.findMany({ where: { userId, group: { deletedAt: null } }, select: { groupId: true, role: true } }),
    ]);
    return {
      orgRoles: new Map(orgs.map((o) => [o.organizationId, o.role])),
      groupRoles: new Map(groups.map((g) => [g.groupId, g.role])),
    };
  }

  canView(
    l: { visibility: 'PUBLIC' | 'ORGANIZATION' | 'GROUP'; organizationId: string | null; groupId: string | null; providerId: string },
    m: Memberships,
    viewerProviderId: string | null,
  ): boolean {
    if (viewerProviderId && l.providerId === viewerProviderId) return true;
    if (l.visibility === 'PUBLIC') return true;
    if (l.visibility === 'ORGANIZATION') return !!l.organizationId && m.orgRoles.has(l.organizationId);
    return !!l.groupId && m.groupRoles.has(l.groupId);
  }

  /** SQL predicate over alias `l` (Listing) that enforces the same rule inside queries. */
  visibilitySql(m: Memberships, viewerProviderId: string | null): Prisma.Sql {
    const orgIds = [...m.orgRoles.keys()];
    const groupIds = [...m.groupRoles.keys()];
    return Prisma.sql`(
      l."visibility" = 'PUBLIC'
      ${orgIds.length ? Prisma.sql`OR (l."visibility" = 'ORGANIZATION' AND l."organizationId" = ANY(${orgIds}::uuid[]))` : Prisma.empty}
      ${groupIds.length ? Prisma.sql`OR (l."visibility" = 'GROUP' AND l."groupId" = ANY(${groupIds}::uuid[]))` : Prisma.empty}
      ${viewerProviderId ? Prisma.sql`OR l."providerId" = ${viewerProviderId}::uuid` : Prisma.empty}
    )`;
  }

  /** Prisma where-clause equivalent of visibilitySql, for findMany calls. */
  visibilityWhere(m: Memberships, viewerProviderId: string | null): Prisma.ListingWhereInput {
    return {
      OR: [
        { visibility: 'PUBLIC' },
        { visibility: 'ORGANIZATION', organizationId: { in: [...m.orgRoles.keys()] } },
        { visibility: 'GROUP', groupId: { in: [...m.groupRoles.keys()] } },
        ...(viewerProviderId ? [{ providerId: viewerProviderId }] : []),
      ],
    };
  }

  /**
   * Validates the organization/group a provider wants to attach to a listing: the provider must be a
   * member, and the group must belong to the organization. Visibility is never inferred from membership.
   */
  async assertListingScope(
    userId: string,
    s: { visibility: 'PUBLIC' | 'ORGANIZATION' | 'GROUP'; organizationId?: string | null; groupId?: string | null },
  ): Promise<void> {
    if (s.organizationId) {
      const m = await this.prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: s.organizationId, userId } },
        select: { organization: { select: { deletedAt: true, status: true } } },
      });
      if (!m || m.organization.deletedAt || m.organization.status !== 'ACTIVE') {
        throw Forbidden('You can only share listings with organizations you belong to');
      }
    }
    if (s.groupId) {
      if (!s.organizationId) throw BadRequest('A group listing must also name its organization', 'GROUP_REQUIRES_ORGANIZATION');
      const g = await this.prisma.group.findUnique({ where: { id: s.groupId }, select: { organizationId: true, deletedAt: true } });
      if (!g || g.deletedAt) throw BadRequest('Group not found', 'GROUP_NOT_FOUND');
      if (g.organizationId !== s.organizationId) throw BadRequest('That group does not belong to the selected organization', 'GROUP_ORG_MISMATCH');
      const gm = await this.prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: s.groupId, userId } } });
      if (!gm) throw Forbidden('You can only share listings with groups you belong to');
    }
  }

  /**
   * Validates a search scope: the viewer must be a member of the organization/group they search
   * within (otherwise nothing restricted would match and we say so), and the group must belong to the org.
   */
  async assertSearchScope(m: Memberships, organizationId?: string, groupId?: string): Promise<void> {
    if (groupId) {
      const g = await this.prisma.group.findUnique({ where: { id: groupId }, select: { organizationId: true, isPrivate: true, deletedAt: true } });
      if (!g || g.deletedAt) throw BadRequest('Group not found', 'GROUP_NOT_FOUND');
      if (organizationId && g.organizationId !== organizationId) {
        throw BadRequest('That group does not belong to the selected organization', 'GROUP_ORG_MISMATCH');
      }
      if (g.isPrivate && !m.groupRoles.has(groupId)) throw Forbidden('Join this group to search within it');
    }
    if (organizationId) {
      const o = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { isPrivate: true, deletedAt: true } });
      if (!o || o.deletedAt) throw BadRequest('Organization not found', 'ORGANIZATION_NOT_FOUND');
      if (o.isPrivate && !m.orgRoles.has(organizationId)) throw Forbidden('Join this organization to search within it');
    }
  }
}
