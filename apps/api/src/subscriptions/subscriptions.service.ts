import { Controller, Get, Global, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Cron } from '@nestjs/schedule';
import type { MySubscription, SubscriptionPlan } from '@vicinity/shared';
import { CurrentUser, Public, requireProvider, type AuthUser } from '../common/auth';
import { num } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsModule } from '../payments/payments.controller';
import { PaymentsService } from '../payments/payments.service';

/** What every provider gets without a paid plan. Basic discovery is never paywalled. */
export const FREE_ENTITLEMENTS: Record<string, number | boolean> = {
  maxListings: 10,
  maxPortfolioProjects: 12,
  maxGalleryMedia: 24,
  maxLocations: 2,
  advancedAnalytics: false,
};

/**
 * Subscription & entitlement architecture. Plans are bought with mobile money (payments module)
 * or granted by an administrator (see admin module). Entitlements are enforced here.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async plans(): Promise<SubscriptionPlan[]> {
    const rows = await this.prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      priceMonthly: num(p.priceMonthly) ?? 0,
      currency: p.currency,
      entitlements: p.entitlements as Record<string, number | boolean>,
      isActive: p.isActive,
    }));
  }

  /** Effective entitlements: free defaults, overridden by the active plan, overridden by unexpired grants. */
  async entitlements(providerId: string): Promise<Record<string, number | boolean>> {
    const now = new Date();
    const [sub, grants] = await Promise.all([
      this.prisma.providerSubscription.findFirst({
        where: { providerId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
        include: { plan: true },
        orderBy: { currentPeriodEnd: 'desc' },
      }),
      this.prisma.entitlement.findMany({ where: { providerId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    ]);
    const out: Record<string, number | boolean> = { ...FREE_ENTITLEMENTS, ...((sub?.plan.entitlements as Record<string, number | boolean>) ?? {}) };
    for (const g of grants) {
      const cur = out[g.key];
      out[g.key] = typeof cur === 'boolean' ? g.value > 0 : Math.max(Number(cur ?? 0), g.value);
    }
    return out;
  }

  async limit(providerId: string, key: keyof typeof FREE_ENTITLEMENTS): Promise<number> {
    return Number((await this.entitlements(providerId))[key] ?? FREE_ENTITLEMENTS[key]);
  }

  async mine(providerId: string): Promise<MySubscription> {
    const sub = await this.prisma.providerSubscription.findFirst({
      where: { providerId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      plan: sub && ['ACTIVE', 'TRIALING'].includes(sub.status) && sub.currentPeriodEnd > new Date() ? { code: sub.plan.code, name: sub.plan.name } : { code: 'FREE', name: 'Free' },
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd.toISOString() ?? null,
      entitlements: await this.entitlements(providerId),
      paymentsAvailable: this.payments.available,
      pendingPayment: await this.payments.pendingFor(providerId),
    };
  }

  /** Hourly: expire lapsed subscriptions and end finished promotions; start scheduled ones. */
  @Cron('0 5 * * * *', { name: 'subscriptions-expiry' })
  async housekeeping(): Promise<void> {
    const now = new Date();
    await this.prisma.providerSubscription.updateMany({
      where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, currentPeriodEnd: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    await this.prisma.listingPromotion.updateMany({ where: { status: 'ACTIVE', endsAt: { lt: now } }, data: { status: 'ENDED' } });
    await this.prisma.listingPromotion.updateMany({
      where: { status: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now } },
      data: { status: 'ACTIVE' },
    });
  }
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.subs.plans();
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.subs.mine(requireProvider(user));
  }
}

@Global()
@Module({ imports: [PaymentsModule], controllers: [SubscriptionsController], providers: [SubscriptionsService], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
