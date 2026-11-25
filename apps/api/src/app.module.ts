import { Controller, Get, Injectable, Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Cron, ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env';
import { AdminModule } from './admin/admin.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.controller';
import { PaymentsModule } from './payments/payments.controller';
import { MessagingModule } from './messaging/messaging.controller';
import { CategoriesModule } from './categories/categories.module';
import { AuditModule } from './common/audit.service';
import { AuthGuard, Public } from './common/auth';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { EnvelopeInterceptor } from './common/response';
import { EngagementModule } from './engagement/engagement.controller';
import { ListingsModule } from './listings/listings.controller';
import { LocationsModule } from './locations/locations.controller';
import { MailModule } from './mail/mail.service';
import { MediaModule } from './media/media.module';
import { MediaService } from './media/media.service';
import { ModerationModule } from './moderation/moderation.service';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { ProvidersModule } from './providers/providers.module';
import { ReviewsModule } from './reviews/reviews.controller';
import { SearchModule } from './search/search.controller';
import { SubscriptionsModule } from './subscriptions/subscriptions.service';
import { UsersModule } from './users/users.module';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    const [{ postgis }] = await this.prisma.$queryRaw<{ postgis: string }[]>`SELECT postgis_lib_version() AS postgis`;
    return { status: 'ok', database: 'ok', postgis, time: new Date().toISOString() };
  }
}

@Injectable()
class MaintenanceJobs {
  private readonly logger = new Logger('Maintenance');
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  @Cron('0 15 2 * * *', { name: 'maintenance', timeZone: 'Africa/Lusaka' })
  async nightly() {
    const media = await this.media.purgeAbandoned(24);
    const tokens = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
    const emailTokens = await this.prisma.emailToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
    const deliveries = await this.prisma.notificationDelivery.deleteMany({
      where: { status: { in: ['DELIVERED', 'FAILED', 'SKIPPED'] }, updatedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
    });
    await this.prisma.organizationInvitation.updateMany({ where: { status: 'PENDING', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
    this.logger.log(`purged ${media} uploads, ${tokens.count} refresh tokens, ${emailTokens.count} email tokens, ${deliveries.count} deliveries`);
  }
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env().NODE_ENV === 'test' ? 'silent' : env().NODE_ENV === 'production' ? 'info' : 'debug',
        transport: env().NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.refreshToken'],
        autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: env().THROTTLE_TTL_SECONDS * 1000, limit: env().THROTTLE_LIMIT }],
      // Integration tests create many accounts from one address; rate limits are covered by their own test.
      skipIf: () => env().NODE_ENV === 'test' && process.env.TEST_ENFORCE_THROTTLE !== '1',
    }),
    PrismaModule,
    AuditModule,
    MailModule,
    MediaModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    AnalyticsModule,
    CategoriesModule,
    OrganizationsModule,
    SubscriptionsModule,
    ProvidersModule,
    ListingsModule,
    SearchModule,
    LocationsModule,
    EngagementModule,
    ReviewsModule,
    MessagingModule,
    BookingsModule,
    PaymentsModule,
    ModerationModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    MaintenanceJobs,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
