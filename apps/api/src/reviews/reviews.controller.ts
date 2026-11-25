import { Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { reviewResponseSchema, reviewSchema } from '@vicinity/shared';
import { CurrentUser, OptionalAuth, Public, requireProvider, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { ReviewsService } from './reviews.service';

const pageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) });

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @OptionalAuth()
  @Get('providers/:id/reviews')
  list(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string, @ZQuery(pageQuery) q: z.output<typeof pageQuery>) {
    return this.reviews.forProvider(id, { ...q, viewerId: user?.id });
  }

  @Public()
  @Get('providers/:id/reviews/summary')
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.summary(id);
  }

  @Get('providers/:id/reviews/mine')
  mine(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.mine(user, id);
  }

  /** Create or update your review of this provider (one per customer). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Put('providers/:id/reviews')
  @ApiZodBody(reviewSchema)
  upsert(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(reviewSchema) body: z.output<typeof reviewSchema>) {
    return this.reviews.upsert(user, id, body);
  }

  @Delete('reviews/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.remove(user, id);
  }

  @Post('reviews/:id/response')
  @ApiZodBody(reviewResponseSchema)
  respond(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(reviewResponseSchema) body: z.output<typeof reviewResponseSchema>) {
    return this.reviews.respond(user, requireProvider(user), id, body.body);
  }
}

@Module({ controllers: [ReviewsController], providers: [ReviewsService], exports: [ReviewsService] })
export class ReviewsModule {}
