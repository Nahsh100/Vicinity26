import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { groupSchema, organizationSchema } from '@vicinity/shared';
import { CurrentUser, OptionalAuth, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { invitationInputSchema, OrganizationsService, roleSchema } from './organizations.service';

const pageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
const discoverQuery = pageQuery.extend({
  q: z.string().max(80).optional(),
  mine: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
const transferSchema = z.object({ userId: z.string().uuid() });
const addMemberSchema = z.object({ userId: z.string().uuid() });

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @OptionalAuth()
  @Get()
  discover(@CurrentUser() user: AuthUser | undefined, @ZQuery(discoverQuery) q: z.output<typeof discoverQuery>) {
    return this.orgs.discover(user, q);
  }

  @Post()
  @ApiZodBody(organizationSchema)
  create(@CurrentUser() user: AuthUser, @ZBody(organizationSchema) body: z.output<typeof organizationSchema>) {
    return this.orgs.create(user, body);
  }

  @Get('invitations/mine')
  myInvitations(@CurrentUser() user: AuthUser) {
    return this.orgs.myInvitations(user);
  }

  @OptionalAuth()
  @Get('invitations/:code')
  previewInvitation(@Param('code') code: string) {
    return this.orgs.previewInvitation(code);
  }

  @Post('invitations/:code/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.orgs.acceptInvitation(code, user);
  }

  @OptionalAuth()
  @Get(':idOrSlug')
  get(@CurrentUser() user: AuthUser | undefined, @Param('idOrSlug') idOrSlug: string) {
    return this.orgs.get(idOrSlug, user);
  }

  @Patch(':id')
  @ApiZodBody(organizationSchema.partial())
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(organizationSchema.partial()) body: z.output<typeof organizationSchema>) {
    return this.orgs.update(id, user, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.remove(id, user);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.join(id, user);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.leave(id, user);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  @ApiZodBody(transferSchema)
  transfer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(transferSchema) body: z.output<typeof transferSchema>) {
    return this.orgs.transferOwnership(id, body.userId, user);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZQuery(pageQuery) q: z.output<typeof pageQuery>) {
    return this.orgs.members(id, user, q);
  }

  @Patch(':id/members/:userId')
  @ApiZodBody(roleSchema)
  setRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ZBody(roleSchema) body: z.output<typeof roleSchema>,
  ) {
    return this.orgs.setMemberRole(id, userId, body.role, user);
  }

  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.orgs.removeMember(id, userId, user);
  }

  @Get(':id/invitations')
  invitations(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listInvitations(id, user);
  }

  @Post(':id/invitations')
  @ApiZodBody(invitationInputSchema)
  invite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(invitationInputSchema) body: z.output<typeof invitationInputSchema>) {
    return this.orgs.createInvitation(id, user, body);
  }

  @Delete(':id/invitations/:invitationId')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('invitationId', ParseUUIDPipe) invitationId: string) {
    return this.orgs.revokeInvitation(id, invitationId, user);
  }

  @OptionalAuth()
  @Get(':id/groups')
  groups(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listGroups(id, user);
  }

  @Post(':id/groups')
  @ApiZodBody(groupSchema)
  createGroup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(groupSchema) body: z.output<typeof groupSchema>) {
    return this.orgs.createGroup(user, body, id);
  }
}

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** Standalone group (not inside an organization). */
  @Post()
  @ApiZodBody(groupSchema)
  create(@CurrentUser() user: AuthUser, @ZBody(groupSchema) body: z.output<typeof groupSchema>) {
    return this.orgs.createGroup(user, body, null);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.orgs.myGroups(user);
  }

  @OptionalAuth()
  @Get(':id')
  get(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.getGroup(id, user);
  }

  @Patch(':id')
  @ApiZodBody(groupSchema.partial())
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(groupSchema.partial()) body: z.output<typeof groupSchema>) {
    return this.orgs.updateGroup(id, user, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.removeGroup(id, user);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.joinGroup(id, user);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.leaveGroup(id, user);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZQuery(pageQuery) q: z.output<typeof pageQuery>) {
    return this.orgs.groupMembers(id, user, q);
  }

  @Post(':id/members')
  @ApiZodBody(addMemberSchema)
  addMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(addMemberSchema) body: z.output<typeof addMemberSchema>) {
    return this.orgs.addGroupMember(id, body.userId, user);
  }

  @Patch(':id/members/:userId')
  @ApiZodBody(roleSchema)
  setRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ZBody(roleSchema) body: z.output<typeof roleSchema>,
  ) {
    return this.orgs.setGroupRole(id, userId, body.role, user);
  }

  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.orgs.removeGroupMember(id, userId, user);
  }
}
