import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { NotificationCategory } from '@vicinity/shared';
import { CurrentUser, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { deviceSchema, NotificationsService, preferencesSchema } from './notifications.service';

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  category: z.enum(Object.values(NotificationCategory) as [NotificationCategory, ...NotificationCategory[]]).optional(),
});

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @ZQuery(listQuery) q: z.output<typeof listQuery>) {
    return this.notifications.list(user.id, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Get('preferences')
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Put('preferences')
  @ApiZodBody(preferencesSchema)
  updatePrefs(@CurrentUser() user: AuthUser, @ZBody(preferencesSchema) body: z.output<typeof preferencesSchema>) {
    return this.notifications.updatePreferences(user.id, body);
  }

  @Post('devices')
  @ApiZodBody(deviceSchema)
  register(@CurrentUser() user: AuthUser, @ZBody(deviceSchema) body: z.output<typeof deviceSchema>) {
    return this.notifications.registerDevice(user.id, body);
  }

  @Delete('devices/:token')
  unregister(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.notifications.unregisterDevice(user.id, token);
  }
}
