import { Injectable } from '@nestjs/common';
import type { Group, GroupInput, Invitation, Member, Organization, OrganizationInput } from '@vicinity/shared';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { BadRequest, Conflict, Forbidden, NotFound } from '../common/errors';
import { keyset, toPage } from '../common/response';
import { randomToken, uniqueSlug } from '../common/util';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';
const RANK: Record<OrgRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

export const invitationInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  groupId: z.string().uuid().nullable().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  maxUses: z.number().int().min(1).max(500).default(1),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});

export const roleSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) });

const orgInclude = { _count: { select: { memberships: true, groups: { where: { deletedAt: null } } } } } as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Organizations ─────────

  async create(user: AuthUser, input: OrganizationInput) {
    const mediaIds = [input.logoMediaId, input.coverMediaId].filter((x): x is string => !!x);
    await this.media.assertUsable(user.id, mediaIds, ['ORGANIZATION_LOGO', 'ORGANIZATION_COVER']);
    const org = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organization.create({
        data: {
          slug: uniqueSlug(input.name),
          name: input.name,
          type: input.type,
          description: input.description || null,
          isPrivate: input.isPrivate ?? false,
          locationName: input.locationName || null,
          logoMediaId: input.logoMediaId ?? null,
          coverMediaId: input.coverMediaId ?? null,
          ownerId: user.id,
          memberships: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      if (input.lat != null && input.lng != null) {
        await tx.$executeRaw`UPDATE "Organization" SET "location" = ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography WHERE "id" = ${o.id}::uuid`;
      }
      return o;
    });
    await this.audit.log({ actorId: user.id, action: 'organization.create', targetType: 'Organization', targetId: org.id });
    return this.get(org.id, user);
  }

  async update(id: string, user: AuthUser, input: Partial<OrganizationInput>) {
    await this.requireOrgRole(id, user.id, 'ADMIN');
    const mediaIds = [input.logoMediaId, input.coverMediaId].filter((x): x is string => !!x);
    await this.media.assertUsable(user.id, mediaIds, ['ORGANIZATION_LOGO', 'ORGANIZATION_COVER']);
    await this.prisma.organization.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        description: input.description === '' ? null : input.description,
        isPrivate: input.isPrivate,
        locationName: input.locationName === '' ? null : input.locationName,
        logoMediaId: input.logoMediaId,
        coverMediaId: input.coverMediaId,
      },
    });
    if (input.lat != null && input.lng != null) {
      await this.prisma.$executeRaw`UPDATE "Organization" SET "location" = ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography WHERE "id" = ${id}::uuid`;
    }
    return this.get(id, user);
  }

  async remove(id: string, user: AuthUser) {
    await this.requireOrgRole(id, user.id, 'OWNER');
    await this.prisma.$transaction([
      // Restricted listings scoped to this organization stop being visible anywhere.
      this.prisma.listing.updateMany({ where: { organizationId: id, visibility: { not: 'PUBLIC' } }, data: { status: 'PAUSED' } }),
      this.prisma.organization.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.organizationInvitation.updateMany({ where: { organizationId: id, status: 'PENDING' }, data: { status: 'REVOKED' } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'organization.delete', targetType: 'Organization', targetId: id });
    return { deleted: true };
  }

  /** Discover public organizations, plus private ones the user belongs to. */
  async discover(user: AuthUser | undefined, q: { q?: string; cursor?: string; limit: number; mine?: boolean }) {
    const where = {
      deletedAt: null,
      status: 'ACTIVE' as const,
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.mine
        ? { memberships: { some: { userId: user?.id ?? '00000000-0000-0000-0000-000000000000' } } }
        : { OR: [{ isPrivate: false }, ...(user ? [{ memberships: { some: { userId: user.id } } }] : [])] }),
    };
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { ...orgInclude, memberships: { where: { userId: user?.id ?? '00000000-0000-0000-0000-000000000000' }, select: { role: true } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (o) => this.toOrg(o, o.memberships[0]?.role ?? null));
  }

  async get(idOrSlug: string, user: AuthUser | undefined): Promise<Organization> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const o = await this.prisma.organization.findFirst({
      where: { deletedAt: null, ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }) },
      include: { ...orgInclude, memberships: { where: { userId: user?.id ?? '00000000-0000-0000-0000-000000000000' }, select: { role: true } } },
    });
    const role = o?.memberships[0]?.role ?? null;
    if (!o || (o.isPrivate && !role) || (o.status !== 'ACTIVE' && !role)) throw NotFound('Organization');
    return this.toOrg(o, role);
  }

  async join(id: string, user: AuthUser) {
    const o = await this.prisma.organization.findUnique({ where: { id } });
    if (!o || o.deletedAt || o.status !== 'ACTIVE') throw NotFound('Organization');
    if (o.isPrivate) throw Forbidden('This organization is invite-only');
    await this.addOrgMember(id, user.id, 'MEMBER');
    return this.get(id, user);
  }

  async leave(id: string, user: AuthUser) {
    const role = await this.orgRole(id, user.id);
    if (!role) throw NotFound('Membership');
    if (role === 'OWNER') throw BadRequest('Transfer ownership before leaving', 'OWNER_CANNOT_LEAVE');
    await this.removeFromOrg(id, user.id);
    return { left: true };
  }

  async members(id: string, user: AuthUser, q: { cursor?: string; limit: number }) {
    await this.requireOrgRole(id, user.id, 'MEMBER');
    const rows = await this.prisma.organizationMembership.findMany({
      where: { organizationId: id },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: { user: { select: { id: true, fullName: true, avatarMediaId: true } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (m): Member => ({
      userId: m.user.id,
      fullName: m.user.fullName,
      avatarUrl: this.media.url(m.user.avatarMediaId),
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  /** Owners can promote/demote admins; admins can manage members only. Nobody changes the owner here. */
  async setMemberRole(id: string, targetUserId: string, role: 'ADMIN' | 'MEMBER', user: AuthUser) {
    const actor = await this.requireOrgRole(id, user.id, 'ADMIN');
    const target = await this.orgRole(id, targetUserId);
    if (!target) throw NotFound('Member');
    if (target === 'OWNER') throw Forbidden('Use ownership transfer to change the owner');
    if (actor !== 'OWNER' && (target === 'ADMIN' || role === 'ADMIN')) throw Forbidden('Only the owner can change administrators');
    await this.prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: id, userId: targetUserId } }, data: { role } });
    await this.audit.log({ actorId: user.id, action: 'organization.member_role', targetType: 'Organization', targetId: id, metadata: { targetUserId, role } });
    return { updated: true };
  }

  async removeMember(id: string, targetUserId: string, user: AuthUser) {
    const actor = await this.requireOrgRole(id, user.id, 'ADMIN');
    const target = await this.orgRole(id, targetUserId);
    if (!target) throw NotFound('Member');
    if (RANK[target] >= RANK[actor]) throw Forbidden('You cannot remove someone with the same or higher role');
    await this.removeFromOrg(id, targetUserId);
    await this.audit.log({ actorId: user.id, action: 'organization.member_removed', targetType: 'Organization', targetId: id, metadata: { targetUserId } });
    return { removed: true };
  }

  async transferOwnership(id: string, newOwnerId: string, user: AuthUser) {
    await this.requireOrgRole(id, user.id, 'OWNER');
    const target = await this.orgRole(id, newOwnerId);
    if (!target) throw BadRequest('The new owner must already be a member');
    await this.prisma.$transaction([
      this.prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: id, userId: newOwnerId } }, data: { role: 'OWNER' } }),
      this.prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: id, userId: user.id } }, data: { role: 'ADMIN' } }),
      this.prisma.organization.update({ where: { id }, data: { ownerId: newOwnerId } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'organization.transfer', targetType: 'Organization', targetId: id, metadata: { newOwnerId } });
    return { transferred: true };
  }

  // ───────── Invitations ─────────

  async createInvitation(orgId: string, user: AuthUser, input: z.infer<typeof invitationInputSchema>): Promise<Invitation> {
    const actor = await this.requireOrgRole(orgId, user.id, 'ADMIN');
    if (input.role === 'ADMIN' && actor !== 'OWNER') throw Forbidden('Only the owner can invite administrators');
    if (input.groupId) {
      const g = await this.prisma.group.findUnique({ where: { id: input.groupId } });
      if (!g || g.organizationId !== orgId || g.deletedAt) throw BadRequest('That group does not belong to this organization', 'GROUP_ORG_MISMATCH');
    }
    const inv = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: orgId,
        groupId: input.groupId ?? null,
        code: randomToken(9),
        email: input.email ?? null,
        role: input.role,
        maxUses: input.email ? 1 : input.maxUses,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86400_000),
      },
      include: { organization: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
    });
    if (input.email) {
      const invitee = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (invitee) {
        await this.notifications.notify(invitee.id, {
          category: 'ORGANIZATION',
          title: `Invitation to ${inv.organization.name}`,
          body: `You've been invited to join ${inv.organization.name}${inv.group ? ` (${inv.group.name})` : ''}.`,
          data: { type: 'invitation', code: inv.code, organizationId: orgId },
          dedupeKey: `invite:${inv.id}`,
        });
      }
    }
    return this.toInvitation(inv);
  }

  async listInvitations(orgId: string, user: AuthUser) {
    await this.requireOrgRole(orgId, user.id, 'ADMIN');
    const rows = await this.prisma.organizationInvitation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { organization: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
    });
    return rows.map((r) => this.toInvitation(r));
  }

  async myInvitations(user: AuthUser) {
    const rows = await this.prisma.organizationInvitation.findMany({
      where: { email: user.email, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: { organization: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
    });
    return rows.map((r) => this.toInvitation(r));
  }

  async revokeInvitation(orgId: string, invitationId: string, user: AuthUser) {
    await this.requireOrgRole(orgId, user.id, 'ADMIN');
    const r = await this.prisma.organizationInvitation.updateMany({
      where: { id: invitationId, organizationId: orgId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
    if (!r.count) throw NotFound('Invitation');
    return { revoked: true };
  }

  async previewInvitation(code: string) {
    const inv = await this.prisma.organizationInvitation.findUnique({
      where: { code },
      include: { organization: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
    });
    if (!inv) throw NotFound('Invitation');
    return this.toInvitation(inv);
  }

  /** Accepts an invitation code: joins the organization (and its group, if any). */
  async acceptInvitation(code: string, user: AuthUser) {
    const inv = await this.prisma.organizationInvitation.findUnique({ where: { code }, include: { organization: true } });
    if (!inv || inv.status !== 'PENDING' || inv.organization.deletedAt) throw NotFound('Invitation');
    if (inv.expiresAt < new Date()) {
      await this.prisma.organizationInvitation.update({ where: { id: inv.id }, data: { status: 'EXPIRED' } });
      throw BadRequest('This invitation has expired', 'INVITATION_EXPIRED');
    }
    if (inv.email && inv.email !== user.email) throw Forbidden('This invitation was sent to a different email address');

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvitation.updateMany({
        where: { id: inv.id, status: 'PENDING', useCount: { lt: inv.maxUses } },
        data: { useCount: { increment: 1 } },
      });
      if (!claimed.count) throw BadRequest('This invitation has been used up', 'INVITATION_USED');
      if (inv.useCount + 1 >= inv.maxUses) await tx.organizationInvitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED' } });

      const existing = await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } } });
      if (!existing) {
        await tx.organizationMembership.create({ data: { organizationId: inv.organizationId, userId: user.id, role: inv.role } });
      } else if (RANK[inv.role] > RANK[existing.role]) {
        await tx.organizationMembership.update({ where: { id: existing.id }, data: { role: inv.role } });
      }
      if (inv.groupId) {
        await tx.groupMembership.upsert({
          where: { groupId_userId: { groupId: inv.groupId, userId: user.id } },
          create: { groupId: inv.groupId, userId: user.id },
          update: {},
        });
      }
    });
    await this.notifyOrgAdmins(inv.organizationId, user, inv.organization.name);
    return this.get(inv.organizationId, user);
  }

  // ───────── Groups ─────────

  async createGroup(user: AuthUser, input: GroupInput, organizationId: string | null) {
    if (organizationId) await this.requireOrgRole(organizationId, user.id, 'ADMIN');
    const g = await this.prisma.group.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description || null,
        isPrivate: input.isPrivate ?? false,
        createdById: user.id,
        memberships: { create: { userId: user.id, role: 'ADMIN' } },
      },
    });
    await this.audit.log({ actorId: user.id, action: 'group.create', targetType: 'Group', targetId: g.id, metadata: { organizationId } });
    return this.getGroup(g.id, user);
  }

  async listGroups(orgId: string, user: AuthUser | undefined) {
    const role = user ? await this.orgRole(orgId, user.id) : null;
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org || org.deletedAt || (org.isPrivate && !role)) throw NotFound('Organization');
    const rows = await this.prisma.group.findMany({
      where: { organizationId: orgId, deletedAt: null, ...(role ? {} : { isPrivate: false }) },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { memberships: true } },
        memberships: { where: { userId: user?.id ?? '00000000-0000-0000-0000-000000000000' }, select: { role: true } },
      },
    });
    return rows.map((g) => this.toGroup(g, g.memberships[0]?.role ?? null));
  }

  async myGroups(user: AuthUser) {
    const rows = await this.prisma.group.findMany({
      where: { deletedAt: null, memberships: { some: { userId: user.id } } },
      orderBy: { name: 'asc' },
      include: { _count: { select: { memberships: true } }, memberships: { where: { userId: user.id }, select: { role: true } } },
    });
    return rows.map((g) => this.toGroup(g, g.memberships[0]?.role ?? null));
  }

  async getGroup(id: string, user: AuthUser | undefined): Promise<Group> {
    const g = await this.prisma.group.findUnique({
      where: { id },
      include: {
        _count: { select: { memberships: true } },
        memberships: { where: { userId: user?.id ?? '00000000-0000-0000-0000-000000000000' }, select: { role: true } },
      },
    });
    if (!g || g.deletedAt) throw NotFound('Group');
    const myRole = g.memberships[0]?.role ?? null;
    if (g.isPrivate && !myRole) {
      const orgAdmin = g.organizationId && user && RANK[(await this.orgRole(g.organizationId, user.id)) ?? 'MEMBER'] >= RANK.ADMIN;
      if (!orgAdmin) throw NotFound('Group');
    }
    return this.toGroup(g, myRole);
  }

  async updateGroup(id: string, user: AuthUser, input: Partial<GroupInput>) {
    await this.requireGroupAdmin(id, user.id);
    await this.prisma.group.update({
      where: { id },
      data: { name: input.name, description: input.description === '' ? null : input.description, isPrivate: input.isPrivate },
    });
    return this.getGroup(id, user);
  }

  async removeGroup(id: string, user: AuthUser) {
    await this.requireGroupAdmin(id, user.id);
    await this.prisma.$transaction([
      this.prisma.listing.updateMany({ where: { groupId: id }, data: { status: 'PAUSED' } }),
      this.prisma.group.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'group.delete', targetType: 'Group', targetId: id });
    return { deleted: true };
  }

  /** Joining a group requires membership of its organization; private groups are invite/admin-add only. */
  async joinGroup(id: string, user: AuthUser) {
    const g = await this.prisma.group.findUnique({ where: { id } });
    if (!g || g.deletedAt) throw NotFound('Group');
    if (g.isPrivate) throw Forbidden('This group is invite-only');
    if (g.organizationId && !(await this.orgRole(g.organizationId, user.id))) throw Forbidden('Join the organization first');
    await this.prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: id, userId: user.id } },
      create: { groupId: id, userId: user.id },
      update: {},
    });
    return this.getGroup(id, user);
  }

  async leaveGroup(id: string, user: AuthUser) {
    const m = await this.prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (!m) throw NotFound('Membership');
    if (m.role === 'ADMIN') {
      const admins = await this.prisma.groupMembership.count({ where: { groupId: id, role: 'ADMIN' } });
      if (admins <= 1) throw BadRequest('Make someone else a group admin before leaving', 'LAST_GROUP_ADMIN');
    }
    await this.prisma.groupMembership.delete({ where: { id: m.id } });
    return { left: true };
  }

  async groupMembers(id: string, user: AuthUser, q: { cursor?: string; limit: number }) {
    await this.getGroup(id, user);
    const rows = await this.prisma.groupMembership.findMany({
      where: { groupId: id },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: { user: { select: { id: true, fullName: true, avatarMediaId: true } } },
      ...keyset(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, (m): Member => ({
      userId: m.user.id,
      fullName: m.user.fullName,
      avatarUrl: this.media.url(m.user.avatarMediaId),
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  /** Group admins add existing organization members to their group. */
  async addGroupMember(id: string, targetUserId: string, user: AuthUser) {
    const g = await this.requireGroupAdmin(id, user.id);
    if (g.organizationId && !(await this.orgRole(g.organizationId, targetUserId))) {
      throw BadRequest('That person must be a member of the organization first', 'NOT_ORG_MEMBER');
    }
    await this.prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: id, userId: targetUserId } },
      create: { groupId: id, userId: targetUserId },
      update: {},
    });
    return { added: true };
  }

  async setGroupRole(id: string, targetUserId: string, role: 'ADMIN' | 'MEMBER', user: AuthUser) {
    await this.requireGroupAdmin(id, user.id);
    const r = await this.prisma.groupMembership.updateMany({ where: { groupId: id, userId: targetUserId }, data: { role } });
    if (!r.count) throw NotFound('Member');
    return { updated: true };
  }

  async removeGroupMember(id: string, targetUserId: string, user: AuthUser) {
    await this.requireGroupAdmin(id, user.id);
    if (targetUserId === user.id) return this.leaveGroup(id, user);
    const r = await this.prisma.groupMembership.deleteMany({ where: { groupId: id, userId: targetUserId } });
    if (!r.count) throw NotFound('Member');
    return { removed: true };
  }

  // ───────── helpers ─────────

  async orgRole(orgId: string, userId: string): Promise<OrgRole | null> {
    const m = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      select: { role: true, organization: { select: { deletedAt: true } } },
    });
    return m && !m.organization.deletedAt ? m.role : null;
  }

  private async requireOrgRole(orgId: string, userId: string, min: OrgRole): Promise<OrgRole> {
    const role = await this.orgRole(orgId, userId);
    if (!role) throw NotFound('Organization');
    if (RANK[role] < RANK[min]) throw Forbidden(`You need to be an organization ${min.toLowerCase()} to do that`);
    return role;
  }

  /** Group admins manage their own group only; organization owners/admins manage every group in it. */
  private async requireGroupAdmin(groupId: string, userId: string) {
    const g = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!g || g.deletedAt) throw NotFound('Group');
    const gm = await this.prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (gm?.role === 'ADMIN') return g;
    if (g.organizationId) {
      const r = await this.orgRole(g.organizationId, userId);
      if (r && RANK[r] >= RANK.ADMIN) return g;
    }
    throw Forbidden('Only this group’s admins can do that');
  }

  private async addOrgMember(orgId: string, userId: string, role: OrgRole) {
    const existing = await this.orgRole(orgId, userId);
    if (existing) throw Conflict('You are already a member', 'ALREADY_MEMBER');
    await this.prisma.organizationMembership.create({ data: { organizationId: orgId, userId, role } });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, fullName: true } });
    await this.notifyOrgAdmins(orgId, { id: u.id, email: u.email } as AuthUser, org.name, u.fullName);
  }

  private async removeFromOrg(orgId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.groupMembership.deleteMany({ where: { userId, group: { organizationId: orgId } } }),
      this.prisma.organizationMembership.delete({ where: { organizationId_userId: { organizationId: orgId, userId } } }),
    ]);
  }

  private async notifyOrgAdmins(orgId: string, joiner: AuthUser, orgName: string, joinerName?: string) {
    const admins = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, role: { in: ['OWNER', 'ADMIN'] }, userId: { not: joiner.id } },
      select: { userId: true },
    });
    const name = joinerName ?? (await this.prisma.user.findUnique({ where: { id: joiner.id }, select: { fullName: true } }))?.fullName ?? 'Someone';
    await this.notifications.notifyMany(
      admins.map((a) => a.userId),
      {
        category: 'ORGANIZATION',
        title: `New member in ${orgName}`,
        body: `${name} joined ${orgName}.`,
        data: { type: 'org_member_joined', organizationId: orgId },
        dedupeKey: `org-join:${orgId}:${joiner.id}`,
      },
    );
  }

  private toOrg(
    o: {
      id: string;
      slug: string;
      name: string;
      type: Organization['type'];
      description: string | null;
      isPrivate: boolean;
      logoMediaId: string | null;
      coverMediaId: string | null;
      locationName: string | null;
      createdAt: Date;
      _count: { memberships: number; groups: number };
    },
    role: OrgRole | null,
  ): Organization {
    return {
      id: o.id,
      slug: o.slug,
      name: o.name,
      type: o.type,
      description: o.description,
      isPrivate: o.isPrivate,
      logoUrl: this.media.url(o.logoMediaId),
      coverUrl: this.media.url(o.coverMediaId),
      locationName: o.locationName,
      memberCount: o._count.memberships,
      groupCount: o._count.groups,
      myRole: role,
      createdAt: o.createdAt.toISOString(),
    };
  }

  private toGroup(
    g: { id: string; organizationId: string | null; name: string; description: string | null; isPrivate: boolean; createdAt: Date; _count: { memberships: number } },
    role: 'ADMIN' | 'MEMBER' | null,
  ): Group {
    return {
      id: g.id,
      organizationId: g.organizationId,
      name: g.name,
      description: g.description,
      isPrivate: g.isPrivate,
      memberCount: g._count.memberships,
      myRole: role,
      createdAt: g.createdAt.toISOString(),
    };
  }

  private toInvitation(r: {
    id: string;
    code: string;
    email: string | null;
    role: OrgRole;
    expiresAt: Date;
    status: Invitation['status'];
    organization: { id: string; name: string };
    group: { id: string; name: string } | null;
  }): Invitation {
    const expired = r.status === 'PENDING' && r.expiresAt < new Date();
    return {
      id: r.id,
      code: r.code,
      organization: r.organization,
      group: r.group,
      email: r.email,
      role: r.role,
      expiresAt: r.expiresAt.toISOString(),
      status: expired ? 'EXPIRED' : r.status,
    };
  }
}
