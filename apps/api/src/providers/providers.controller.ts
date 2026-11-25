import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  portfolioProjectSchema,
  providerLocationSchema,
  providerSchema,
  serviceAreaSchema,
  workingHoursSchema,
} from '@vicinity/shared';
import { AnalyticsService } from '../analytics/analytics.service';
import { CurrentUser, OptionalAuth, Public, requireProvider, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { credentialSchema, gallerySchema, onboardingStepSchema, ProvidersService } from './providers.service';

const originQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
const analyticsQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });
const availabilitySchema = z.object({ hours: workingHoursSchema });

@ApiTags('providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ───────── my storefront ─────────

  @Post()
  @ApiZodBody(providerSchema)
  create(@CurrentUser() user: AuthUser, @ZBody(providerSchema) body: z.output<typeof providerSchema>) {
    return this.providers.create(user, body);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.providers.mine(user.id);
  }

  @Patch('me')
  @ApiZodBody(providerSchema.partial())
  update(@CurrentUser() user: AuthUser, @ZBody(providerSchema.partial()) body: Partial<z.output<typeof providerSchema>>) {
    return this.providers.update(user, requireProvider(user), body);
  }

  @Put('me/onboarding')
  @ApiZodBody(onboardingStepSchema)
  step(@CurrentUser() user: AuthUser, @ZBody(onboardingStepSchema) body: z.output<typeof onboardingStepSchema>) {
    return this.providers.setOnboardingStep(requireProvider(user), body.step);
  }

  @Post('me/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser) {
    return this.providers.publish(user, requireProvider(user));
  }

  @Post('me/pause')
  @HttpCode(200)
  pause(@CurrentUser() user: AuthUser) {
    return this.providers.setPaused(user, requireProvider(user), true);
  }

  @Post('me/resume')
  @HttpCode(200)
  resume(@CurrentUser() user: AuthUser) {
    return this.providers.setPaused(user, requireProvider(user), false);
  }

  @Post('me/locations')
  @ApiZodBody(providerLocationSchema)
  addLocation(@CurrentUser() user: AuthUser, @ZBody(providerLocationSchema) body: z.output<typeof providerLocationSchema>) {
    return this.providers.addLocation(requireProvider(user), body);
  }

  @Patch('me/locations/:id')
  @ApiZodBody(providerLocationSchema.partial())
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(providerLocationSchema.partial()) body: Partial<z.output<typeof providerLocationSchema>>,
  ) {
    return this.providers.updateLocation(requireProvider(user), id, body);
  }

  @Delete('me/locations/:id')
  removeLocation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.providers.removeLocation(requireProvider(user), id);
  }

  @Post('me/service-areas')
  @ApiZodBody(serviceAreaSchema)
  addArea(@CurrentUser() user: AuthUser, @ZBody(serviceAreaSchema) body: z.output<typeof serviceAreaSchema>) {
    return this.providers.addServiceArea(requireProvider(user), body);
  }

  @Delete('me/service-areas/:id')
  removeArea(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.providers.removeServiceArea(requireProvider(user), id);
  }

  @Put('me/availability')
  @ApiZodBody(availabilitySchema)
  availability(@CurrentUser() user: AuthUser, @ZBody(availabilitySchema) body: z.output<typeof availabilitySchema>) {
    return this.providers.setAvailability(requireProvider(user), body.hours);
  }

  @Put('me/gallery')
  @ApiZodBody(gallerySchema)
  gallery(@CurrentUser() user: AuthUser, @ZBody(gallerySchema) body: z.output<typeof gallerySchema>) {
    return this.providers.setGallery(user, requireProvider(user), body.mediaIds);
  }

  @Post('me/credentials')
  @ApiZodBody(credentialSchema)
  addCredential(@CurrentUser() user: AuthUser, @ZBody(credentialSchema) body: z.output<typeof credentialSchema>) {
    return this.providers.addCredential(user, requireProvider(user), body);
  }

  @Delete('me/credentials/:id')
  removeCredential(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.providers.removeCredential(requireProvider(user), id);
  }

  @Get('me/portfolio')
  myPortfolio(@CurrentUser() user: AuthUser) {
    return this.providers.listProjects(requireProvider(user));
  }

  @Post('me/portfolio')
  @ApiZodBody(portfolioProjectSchema)
  createProject(@CurrentUser() user: AuthUser, @ZBody(portfolioProjectSchema) body: z.output<typeof portfolioProjectSchema>) {
    return this.providers.createProject(user, requireProvider(user), body);
  }

  @Patch('me/portfolio/:id')
  @ApiZodBody(portfolioProjectSchema.partial())
  updateProject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(portfolioProjectSchema.partial()) body: Partial<z.output<typeof portfolioProjectSchema>>,
  ) {
    return this.providers.updateProject(user, requireProvider(user), id, body);
  }

  @Delete('me/portfolio/:id')
  removeProject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.providers.removeProject(requireProvider(user), id);
  }

  @Get('me/analytics')
  myAnalytics(@CurrentUser() user: AuthUser, @ZQuery(analyticsQuery) q: z.output<typeof analyticsQuery>) {
    return this.analytics.forProvider(requireProvider(user), q.days);
  }

  // ───────── public storefront ─────────

  @OptionalAuth()
  @Get(':idOrSlug')
  get(@CurrentUser() user: AuthUser | undefined, @Param('idOrSlug') idOrSlug: string, @ZQuery(originQuery) q: z.output<typeof originQuery>) {
    const origin = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
    return this.providers.publicProfile(idOrSlug, user, origin);
  }

  @Public()
  @Get(':id/gallery')
  publicGallery(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.publicGallery(id);
  }

  @Public()
  @Get(':id/credentials')
  publicCredentials(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.publicCredentials(id);
  }

  @Public()
  @Get(':id/portfolio')
  portfolio(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.listProjects(id);
  }

  @Public()
  @Get(':id/portfolio/:projectId')
  project(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.providers.getProject(projectId);
  }
}
