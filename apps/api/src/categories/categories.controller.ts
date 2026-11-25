import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../common/auth';
import { ZQuery } from '../common/zod';
import { CategoriesService } from './categories.service';

const suggestQuery = z.object({ q: z.string().max(80).default(''), limit: z.coerce.number().int().min(1).max(20).default(6) });

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  tree() {
    return this.categories.tree();
  }

  @Public()
  @Get('suggest')
  suggest(@ZQuery(suggestQuery) q: z.output<typeof suggestQuery>) {
    return this.categories.suggest(q.q, q.limit);
  }

  @Public()
  @Get(':idOrSlug')
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.categories.get(idOrSlug);
  }
}
