import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { listingBaseSchema, listingSchema } from '@vicinity/shared';
import { CurrentUser, OptionalAuth, requireProvider, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { ListingsService } from './listings.service';

const pageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
const mineQuery = pageQuery.extend({ status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'REMOVED']).optional() });
const providerListingsQuery = pageQuery.extend({ type: z.enum(['SERVICE', 'PRODUCT']).optional() });
const originQuery = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']) });
const patchSchema = listingBaseSchema.partial();

@ApiTags('listings')
@ApiBearerAuth()
@Controller()
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post('listings')
  @ApiZodBody(listingSchema)
  create(@CurrentUser() user: AuthUser, @ZBody(listingSchema) body: z.output<typeof listingSchema>) {
    return this.listings.create(user, requireProvider(user), body);
  }

  @Get('listings/mine')
  mine(@CurrentUser() user: AuthUser, @ZQuery(mineQuery) q: z.output<typeof mineQuery>) {
    return this.listings.mine(requireProvider(user), q);
  }

  @OptionalAuth()
  @Get('listings/:id')
  get(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string, @ZQuery(originQuery) q: z.output<typeof originQuery>) {
    return this.listings.detail(id, user, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null);
  }

  @Patch('listings/:id')
  @ApiZodBody(patchSchema)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(patchSchema) body: z.output<typeof patchSchema>) {
    return this.listings.update(user, requireProvider(user), id, body);
  }

  @Post('listings/:id/status')
  @HttpCode(200)
  @ApiZodBody(statusSchema)
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(statusSchema) body: z.output<typeof statusSchema>) {
    return this.listings.setStatus(user, requireProvider(user), id, body.status);
  }

  @Delete('listings/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.remove(requireProvider(user), id);
  }

  @OptionalAuth()
  @Get('providers/:id/listings')
  forProvider(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @ZQuery(providerListingsQuery) q: z.output<typeof providerListingsQuery>,
  ) {
    return this.listings.forProvider(id, user, q);
  }
}

@Module({ controllers: [ListingsController], providers: [ListingsService], exports: [ListingsService] })
export class ListingsModule {}
