import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CategoriesService, categoryInputSchema } from '../categories/categories.service';
import { CurrentUser, RequirePermissions, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { ReviewsModule } from '../reviews/reviews.controller';
import {
  AdminService,
  auditQuery,
  grantSubscriptionSchema,
  listingsQuery,
  pageQuery,
  planSchema,
  promotionSchema,
  providersQuery,
  reasonSchema,
  reportsQuery,
  resolveSchema,
  rolesSchema,
  usersQuery,
  verificationSchema,
} from './admin.service';
import { broadcastAudience, broadcastSchema, BroadcastService, type BroadcastInput } from './broadcast.service';
import { P } from './permissions';

const optionalReason = z.object({ reason: z.string().trim().max(500).optional() });
const ID = () => Param('id', ParseUUIDPipe);

/**
 * Admin API. Each route declares its permission; AuthGuard checks it against the admin's roles
 * loaded from the database. The admin portal never decides authorization on its own.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly categories: CategoriesService,
  ) {}

  /** Who am I, and what can I do? Used by the admin portal to shape its navigation. */
  @Get('session')
  session(@CurrentUser() user: AuthUser) {
    return { userId: user.id, email: user.email, permissions: [...user.adminPermissions], isAdmin: user.adminPermissions.size > 0 };
  }

  @RequirePermissions(P.DASHBOARD)
  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  // users
  @RequirePermissions(P.USERS_VIEW)
  @Get('users')
  users(@ZQuery(usersQuery) q: z.output<typeof usersQuery>) {
    return this.admin.users(q);
  }

  @RequirePermissions(P.USERS_VIEW)
  @Get('users/:id')
  user(@ID() id: string) {
    return this.admin.user(id);
  }

  @RequirePermissions(P.USERS_MANAGE)
  @Post('users/:id/suspend')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  suspendUser(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(reasonSchema) b: z.output<typeof reasonSchema>) {
    return this.admin.setUserStatus(a, id, 'SUSPENDED', b.reason);
  }

  @RequirePermissions(P.USERS_MANAGE)
  @Post('users/:id/reactivate')
  @HttpCode(200)
  reactivateUser(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.admin.setUserStatus(a, id, 'ACTIVE');
  }

  @RequirePermissions(P.ADMINS_MANAGE)
  @Put('users/:id/roles')
  @ApiZodBody(rolesSchema)
  setRoles(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(rolesSchema) b: z.output<typeof rolesSchema>) {
    return this.admin.setUserRoles(a, id, b.roles);
  }

  @RequirePermissions(P.ADMINS_MANAGE)
  @Get('roles')
  roles() {
    return this.admin.roles();
  }

  // providers
  @RequirePermissions(P.PROVIDERS_VIEW)
  @Get('providers')
  providers(@ZQuery(providersQuery) q: z.output<typeof providersQuery>) {
    return this.admin.providers(q);
  }

  @RequirePermissions(P.PROVIDERS_VIEW)
  @Get('providers/:id')
  provider(@ID() id: string) {
    return this.admin.provider(id);
  }

  @RequirePermissions(P.PROVIDERS_VERIFY)
  @Post('providers/:id/verification')
  @HttpCode(200)
  @ApiZodBody(verificationSchema)
  verify(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(verificationSchema) b: z.output<typeof verificationSchema>) {
    return this.admin.setVerification(a, id, b);
  }

  @RequirePermissions(P.PROVIDERS_MANAGE)
  @Post('providers/:id/suspend')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  suspendProvider(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(reasonSchema) b: z.output<typeof reasonSchema>) {
    return this.admin.setProviderStatus(a, id, true, b.reason);
  }

  @RequirePermissions(P.PROVIDERS_MANAGE)
  @Post('providers/:id/reactivate')
  @HttpCode(200)
  reactivateProvider(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.admin.setProviderStatus(a, id, false);
  }

  @RequirePermissions(P.MONETIZATION)
  @Post('providers/:id/subscription')
  @HttpCode(200)
  @ApiZodBody(grantSubscriptionSchema)
  grant(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(grantSubscriptionSchema) b: z.output<typeof grantSubscriptionSchema>) {
    return this.admin.grantSubscription(a, id, b);
  }

  // listings & reviews
  @RequirePermissions(P.LISTINGS_VIEW)
  @Get('listings')
  listings(@ZQuery(listingsQuery) q: z.output<typeof listingsQuery>) {
    return this.admin.listings(q);
  }

  @RequirePermissions(P.LISTINGS_MODERATE)
  @Post('listings/:id/remove')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  removeListing(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(reasonSchema) b: z.output<typeof reasonSchema>) {
    return this.admin.setListingRemoved(a, id, true, b.reason);
  }

  @RequirePermissions(P.LISTINGS_MODERATE)
  @Post('listings/:id/restore')
  @HttpCode(200)
  restoreListing(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(optionalReason) b: z.output<typeof optionalReason>) {
    return this.admin.setListingRemoved(a, id, false, b.reason);
  }

  @RequirePermissions(P.REPORTS_RESOLVE)
  @Post('reviews/:id/hide')
  @HttpCode(200)
  hideReview(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.admin.setReviewStatus(a, id, 'HIDDEN');
  }

  @RequirePermissions(P.REPORTS_RESOLVE)
  @Post('reviews/:id/publish')
  @HttpCode(200)
  publishReview(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.admin.setReviewStatus(a, id, 'PUBLISHED');
  }

  // categories
  @RequirePermissions(P.CATEGORIES_MANAGE)
  @Get('categories')
  allCategories() {
    return this.categories.tree(true);
  }

  @RequirePermissions(P.CATEGORIES_MANAGE)
  @Post('categories')
  @ApiZodBody(categoryInputSchema)
  createCategory(@CurrentUser() a: AuthUser, @ZBody(categoryInputSchema) b: z.output<typeof categoryInputSchema>) {
    return this.categories.create(b, a.id);
  }

  @RequirePermissions(P.CATEGORIES_MANAGE)
  @Patch('categories/:id')
  @ApiZodBody(categoryInputSchema.partial())
  updateCategory(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(categoryInputSchema.partial()) b: Partial<z.output<typeof categoryInputSchema>>) {
    return this.categories.update(id, b, a.id);
  }

  @RequirePermissions(P.CATEGORIES_MANAGE)
  @Delete('categories/:id')
  deleteCategory(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.categories.remove(id, a.id);
  }

  // organizations
  @RequirePermissions(P.ORGS_VIEW)
  @Get('organizations')
  organizations(@ZQuery(pageQuery) q: z.output<typeof pageQuery>) {
    return this.admin.organizations(q);
  }

  @RequirePermissions(P.ORGS_MANAGE)
  @Post('organizations/:id/suspend')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  suspendOrg(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(reasonSchema) b: z.output<typeof reasonSchema>) {
    return this.admin.setOrganizationStatus(a, id, true, b.reason);
  }

  @RequirePermissions(P.ORGS_MANAGE)
  @Post('organizations/:id/reactivate')
  @HttpCode(200)
  reactivateOrg(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.admin.setOrganizationStatus(a, id, false);
  }

  // reports
  @RequirePermissions(P.REPORTS_VIEW)
  @Get('reports')
  reports(@ZQuery(reportsQuery) q: z.output<typeof reportsQuery>) {
    return this.admin.reports(q);
  }

  @RequirePermissions(P.REPORTS_RESOLVE)
  @Post('reports/:id/resolve')
  @HttpCode(200)
  @ApiZodBody(resolveSchema)
  resolve(@CurrentUser() a: AuthUser, @ID() id: string, @ZBody(resolveSchema) b: z.output<typeof resolveSchema>) {
    return this.admin.resolveReport(a, id, b);
  }

  // monetization
  @RequirePermissions(P.MONETIZATION)
  @Get('plans')
  plans() {
    return this.admin.plans();
  }

  @RequirePermissions(P.MONETIZATION)
  @Put('plans')
  @ApiZodBody(planSchema)
  upsertPlan(@CurrentUser() a: AuthUser, @ZBody(planSchema) b: z.output<typeof planSchema>) {
    return this.admin.upsertPlan(a, b);
  }

  @RequirePermissions(P.MONETIZATION)
  @Get('promotions')
  promotions(@ZQuery(pageQuery) q: z.output<typeof pageQuery>) {
    return this.admin.promotions(q);
  }

  @RequirePermissions(P.MONETIZATION)
  @Post('promotions')
  @ApiZodBody(promotionSchema)
  createPromotion(@CurrentUser() a: AuthUser, @ZBody(promotionSchema) b: z.output<typeof promotionSchema>) {
    return this.admin.createPromotion(a, b);
  }

  @RequirePermissions(P.MONETIZATION)
  @Post('promotions/:id/cancel')
  @HttpCode(200)
  cancelPromotion(@CurrentUser() a: AuthUser, @ID() id: string) {
    return this.admin.cancelPromotion(a, id);
  }

  // audit
  @RequirePermissions(P.AUDIT_VIEW)
  @Get('audit')
  audit(@ZQuery(auditQuery) q: z.output<typeof auditQuery>) {
    return this.admin.auditLog(q);
  }
}


const audienceQuery = z.object({ audience: broadcastAudience.default('ALL'), userIds: z.string().optional() });

/** Admin → users notifications (announcements and promotions). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly broadcasts: BroadcastService) {}

  /** How many active users an audience reaches (shown before sending). */
  @RequirePermissions(P.NOTIFICATIONS_SEND)
  @Get('audience')
  audience(@ZQuery(audienceQuery) q: z.output<typeof audienceQuery>) {
    return this.broadcasts.audienceCount(q.audience, q.userIds ? q.userIds.split(',').filter(Boolean) : []);
  }

  @RequirePermissions(P.NOTIFICATIONS_SEND)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('broadcasts')
  @ApiZodBody(broadcastSchema)
  send(@CurrentUser() admin: AuthUser, @ZBody(broadcastSchema) body: BroadcastInput) {
    return this.broadcasts.create(admin, body);
  }

  @RequirePermissions(P.NOTIFICATIONS_SEND)
  @Get('broadcasts')
  list() {
    return this.broadcasts.list();
  }

  @RequirePermissions(P.NOTIFICATIONS_SEND)
  @Get('broadcasts/:id')
  get(@ID() id: string) {
    return this.broadcasts.get(id);
  }
}

@Module({ imports: [ReviewsModule], controllers: [AdminController, AdminNotificationsController], providers: [AdminService, BroadcastService] })
export class AdminModule {}
