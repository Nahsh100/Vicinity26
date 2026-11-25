import { Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { messageSchema } from '@vicinity/shared';
import { CurrentUser, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { MessagingService } from './messaging.service';

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  filter: z.enum(['all', 'unread', 'bookings']).default('all'),
});
const messagesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  /** ISO time: only messages newer than this (for polling). */
  after: z.string().datetime().optional(),
});
const openSchema = z.object({ providerId: z.string().uuid() });

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @ZQuery(listQuery) q: z.output<typeof listQuery>) {
    return this.messaging.list(user, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.messaging.unreadTotal(user);
  }

  /** Get or start the conversation with a provider. */
  @Post()
  @ApiZodBody(openSchema)
  open(@CurrentUser() user: AuthUser, @ZBody(openSchema) body: z.output<typeof openSchema>) {
    return this.messaging.open(user, body.providerId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.summary(id, user);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZQuery(messagesQuery) q: z.output<typeof messagesQuery>) {
    return this.messaging.messages(id, user, q);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post(':id/messages')
  @ApiZodBody(messageSchema)
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(messageSchema) body: z.output<typeof messageSchema>) {
    return this.messaging.send(id, user, body);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.markRead(id, user);
  }
}

@Global()
@Module({ controllers: [MessagingController], providers: [MessagingService], exports: [MessagingService] })
export class MessagingModule {}
