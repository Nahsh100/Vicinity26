import { Controller, Get, HttpCode, Inject, Module, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { planCheckoutSchema } from '@vicinity/shared';
import { CurrentUser, Public, RequirePermissions, type AuthUser } from '../common/auth';
import { BadRequest, NotFound, Unauthorized } from '../common/errors';
import { ApiZodBody, ZBody, ZQuery } from '../common/zod';
import { env } from '../config/env';
import { PAYMENT_GATEWAY, UnconfiguredGateway, WebhookSignatureError, type PaymentGateway } from './gateway';
import { LencoGateway } from './lenco.gateway';
import { PaymentsService } from './payments.service';
import { SIMULATOR_SIGNATURE_HEADER, SimulatorGateway } from './simulator.gateway';

const simulateSchema = z.object({ outcome: z.enum(['SUCCEEDED', 'FAILED']), reason: z.string().max(120).optional() });
const adminQuery = z.object({ status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED', 'EXPIRED']).optional() });

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** Starts a plan purchase: the payer gets a USSD prompt on the given mobile-money number. */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('payments/subscriptions')
  @ApiZodBody(planCheckoutSchema)
  checkout(@CurrentUser() user: AuthUser, @ZBody(planCheckoutSchema) body: z.output<typeof planCheckoutSchema>) {
    return this.payments.checkoutPlan(user, body);
  }

  @Get('payments/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.payments.mine(user);
  }

  @Get('payments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.get(user, id);
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.cancel(user, id);
  }

  /**
   * Development only (PAYMENT_PROVIDER=simulator): approve or decline a pending payment. The
   * outcome is delivered as a signed webhook through the same ingest path as a real gateway.
   */
  @ApiExcludeEndpoint()
  @Post('payments/:id/simulate')
  @HttpCode(200)
  async simulate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZBody(simulateSchema) body: z.output<typeof simulateSchema>) {
    if (!(this.gateway instanceof SimulatorGateway)) throw NotFound();
    const p = await this.payments.get(user, id);
    if (p.status !== 'PENDING' && body.outcome === 'FAILED') throw BadRequest('Only a pending payment can be declined');
    const { rawBody, signature } = this.gateway.settle(id, body.outcome, p.amount, body.reason);
    await this.payments.ingest('simulator', Buffer.from(rawBody), { [SIMULATOR_SIGNATURE_HEADER]: signature });
    return this.payments.get(user, id);
  }

  /** Gateway webhooks. Verified against the exact raw body (see main.ts); always 200 once authentic. */
  @Public()
  @SkipThrottle()
  @Post('webhooks/payments/:gateway')
  @HttpCode(200)
  async webhook(@Param('gateway') gateway: string, @Req() req: Request) {
    const raw = req.body as unknown;
    if (!Buffer.isBuffer(raw)) throw BadRequest('Raw body required', 'RAW_BODY_REQUIRED');
    try {
      const processed = await this.payments.ingest(gateway, raw, req.headers);
      return { received: true, processed };
    } catch (err) {
      if (err instanceof WebhookSignatureError) throw Unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
      throw err;
    }
  }

  @RequirePermissions('monetization.manage')
  @Get('admin/payments')
  adminList(@ZQuery(adminQuery) q: z.output<typeof adminQuery>) {
    return this.payments.adminList(q.status);
  }

  /** Re-checks the gateway (e.g. a payer says they paid). Applies a success it finds. */
  @RequirePermissions('monetization.manage')
  @Post('admin/payments/:id/refresh')
  @HttpCode(200)
  adminRefresh(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.adminRefresh(id);
  }
}

export function createGateway(): PaymentGateway {
  const e = env();
  if (e.PAYMENT_PROVIDER === 'lenco') return new LencoGateway(e);
  if (e.PAYMENT_PROVIDER === 'simulator') return new SimulatorGateway(e.SIMULATOR_WEBHOOK_SECRET);
  return new UnconfiguredGateway();
}

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PAYMENT_GATEWAY, useFactory: createGateway }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
