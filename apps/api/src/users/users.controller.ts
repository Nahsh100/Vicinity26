import { Controller, Delete, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { updateProfileSchema } from '@vicinity/shared';
import { CurrentUser, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody } from '../common/zod';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch()
  @ApiZodBody(updateProfileSchema)
  update(@CurrentUser() user: AuthUser, @ZBody(updateProfileSchema) body: z.output<typeof updateProfileSchema>) {
    return this.users.update(user.id, body);
  }

  @Get('recent-searches')
  recent(@CurrentUser() user: AuthUser) {
    return this.users.recentSearches(user.id);
  }

  @Delete('recent-searches')
  clearRecent(@CurrentUser() user: AuthUser) {
    return this.users.clearRecentSearches(user.id);
  }

  @Get('export')
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportData(user.id);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user.id);
  }
}
