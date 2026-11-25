import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { contactEventSchema, enquirySchema } from '@vicinity/shared';
import { CurrentUser, OptionalAuth, requireProvider, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { EngagementService } from './engagement.service';

const originQuery = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });
const saveSchema = z.object({ notify: z.boolean().default(true) });
const enquiriesQuery = z.object({
  status: z.enum(['NEW', 'READ', 'ARCHIVED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const enquiryStatusSchema = z.object({ status: z.enum(['READ', 'ARCHIVED']) });

@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('favorites/providers')
  savedProviders(@CurrentUser() user: AuthUser, @ZQuery(originQuery) q: z.output<typeof originQuery>) {
    return this.engagement.savedProviders(user, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null);
  }

  @Put('favorites/providers/:id')
  @ApiZodBody(saveSchema)
  saveProvider(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(saveSchema) body: z.output<typeof saveSchema>) {
    return this.engagement.saveProvider(user, id, body.notify);
  }

  @Delete('favorites/providers/:id')
  unsaveProvider(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.unsaveProvider(user, id);
  }

  @Get('favorites/listings')
  savedListings(@CurrentUser() user: AuthUser) {
    return this.engagement.savedListings(user);
  }

  @Put('favorites/listings/:id')
  saveListing(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.saveListing(user, id);
  }

  @Delete('favorites/listings/:id')
  unsaveListing(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.engagement.unsaveListing(user, id);
  }

  /** Called when the user taps call / WhatsApp / email, just before the app opens the dialer or WhatsApp. */
  @OptionalAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('providers/:id/contact')
  @HttpCode(200)
  @ApiZodBody(contactEventSchema)
  contact(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string, @ZBody(contactEventSchema) body: z.output<typeof contactEventSchema>) {
    return this.engagement.recordContact(user, id, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('providers/:id/enquiries')
  @ApiZodBody(enquirySchema)
  enquire(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(enquirySchema) body: z.output<typeof enquirySchema>) {
    return this.engagement.createEnquiry(user, id, body);
  }

  @Get('enquiries/received')
  received(@CurrentUser() user: AuthUser, @ZQuery(enquiriesQuery) q: z.output<typeof enquiriesQuery>) {
    return this.engagement.providerEnquiries(requireProvider(user), q);
  }

  @Patch('enquiries/received/:id')
  @ApiZodBody(enquiryStatusSchema)
  setStatus(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(enquiryStatusSchema) body: z.output<typeof enquiryStatusSchema>) {
    return this.engagement.setEnquiryStatus(requireProvider(user), id, body.status);
  }

  @Get('enquiries/sent')
  sent(@CurrentUser() user: AuthUser) {
    return this.engagement.myEnquiries(user);
  }
}

@Module({ controllers: [EngagementController], providers: [EngagementService] })
export class EngagementModule {}
