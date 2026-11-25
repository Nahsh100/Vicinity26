import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { bookingReasonSchema, bookingRequestSchema, bookingRescheduleSchema } from '@vicinity/shared';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { BookingsService } from './bookings.service';

const listQuery = z.object({
  role: z.enum(['customer', 'provider']).default('customer'),
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const slotsQuery = z.object({ date: z.string(), listingId: z.string().uuid().optional() });

@ApiTags('bookings')
@ApiBearerAuth()
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('bookings')
  @ApiZodBody(bookingRequestSchema)
  create(@CurrentUser() user: AuthUser, @ZBody(bookingRequestSchema) body: z.output<typeof bookingRequestSchema>) {
    return this.bookings.create(user, body);
  }

  @Get('bookings')
  list(@CurrentUser() user: AuthUser, @ZQuery(listQuery) q: z.output<typeof listQuery>) {
    return this.bookings.list(user, q);
  }

  @Get('bookings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.get(id, user);
  }

  /** Provider confirms a request, or the other party accepts a proposed new time. */
  @Post('bookings/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.accept(id, user);
  }

  @Post('bookings/:id/decline')
  @HttpCode(200)
  @ApiZodBody(bookingReasonSchema)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(bookingReasonSchema) b: z.output<typeof bookingReasonSchema>) {
    return this.bookings.decline(id, user, b.reason);
  }

  @Post('bookings/:id/reschedule')
  @HttpCode(200)
  @ApiZodBody(bookingRescheduleSchema)
  reschedule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(bookingRescheduleSchema) b: z.output<typeof bookingRescheduleSchema>) {
    return this.bookings.reschedule(id, user, b.scheduledAt, b.reason);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @ApiZodBody(bookingReasonSchema)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(bookingReasonSchema) b: z.output<typeof bookingReasonSchema>) {
    return this.bookings.cancel(id, user, b.reason);
  }

  @Post('bookings/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.complete(id, user);
  }

  /** Bookable start times for a day, from working hours minus confirmed bookings. */
  @Public()
  @Get('providers/:id/slots')
  slots(@Param('id', ParseUUIDPipe) id: string, @ZQuery(slotsQuery) q: z.output<typeof slotsQuery>) {
    return this.bookings.slots(id, q.date, q.listingId);
  }
}

@Module({ controllers: [BookingsController], providers: [BookingsService] })
export class BookingsModule {}
