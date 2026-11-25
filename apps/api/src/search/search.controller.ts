import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, OptionalAuth, Public, type AuthUser } from '../common/auth';
import { ApiZodQuery, ZQuery } from '../common/zod';
import { searchQueryShape, searchQuerySchema, SearchService, type SearchQuery } from './search.service';

const suggestQuery = z.object({ q: z.string().max(80).default('') });
const homeQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).optional(),
});

@ApiTags('search')
@ApiBearerAuth()
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /**
   * Search listings. All filters combine. Returns { data: ListingSummary[], meta: { nextCursor, hasMore,
   * total (first page), appliedRadiusKm, origin, sponsored, matchedCategories } }.
   */
  @OptionalAuth()
  @Get('search')
  @ApiZodQuery(searchQueryShape)
  run(@CurrentUser() user: AuthUser | undefined, @ZQuery(searchQuerySchema) q: SearchQuery) {
    return this.search.search(user, q);
  }

  @Public()
  @Get('search/suggest')
  suggest(@ZQuery(suggestQuery) q: z.output<typeof suggestQuery>) {
    return this.search.suggest(q.q);
  }

  @Public()
  @Get('discover/stats')
  stats() {
    return this.search.stats();
  }

  /** Data for the home screen, personalised to the location when given. */
  @OptionalAuth()
  @Get('discover/home')
  home(@CurrentUser() user: AuthUser | undefined, @ZQuery(homeQuery) q: z.output<typeof homeQuery>) {
    return this.search.home(user, q);
  }
}

@Module({ controllers: [SearchController], providers: [SearchService], exports: [SearchService] })
export class SearchModule {}
