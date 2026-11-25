import { Controller, Global, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { reportSchema, type ReportInput } from '@vicinity/shared';
import type { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { CurrentUser, type AuthUser } from '../common/auth';
import { BadRequest, Conflict, NotFound } from '../common/errors';
import { ApiZodBody, ZBody } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';

/** Open reports on one review that automatically hide it until a moderator decides. */
const AUTO_HIDE_THRESHOLD = 3;

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async report(user: AuthUser, input: ReportInput) {
    await this.assertTargetExists(input.targetType, input.targetId);
    if (input.targetType === 'USER' && input.targetId === user.id) throw BadRequest('You cannot report yourself');
    try {
      await this.prisma.moderationReport.create({
        data: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details || null },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw Conflict('You have already reported this', 'ALREADY_REPORTED');
      throw e;
    }
    if (input.targetType === 'REVIEW') {
      const open = await this.prisma.moderationReport.count({ where: { targetType: 'REVIEW', targetId: input.targetId, status: 'OPEN' } });
      if (open >= AUTO_HIDE_THRESHOLD) {
        const r = await this.prisma.review.update({ where: { id: input.targetId }, data: { status: 'PENDING' } });
        await this.prisma.$executeRaw`
          UPDATE "Provider" p SET
            "ratingAverage" = coalesce((SELECT round(avg("rating")::numeric, 2) FROM "Review" WHERE "providerId" = p."id" AND "status" = 'PUBLISHED'), 0),
            "ratingCount" = (SELECT count(*) FROM "Review" WHERE "providerId" = p."id" AND "status" = 'PUBLISHED')
          WHERE p."id" = ${r.providerId}::uuid`;
      }
    }
    return { reported: true };
  }

  private async assertTargetExists(type: ReportInput['targetType'], id: string) {
    const found =
      type === 'REVIEW'
        ? await this.prisma.review.count({ where: { id } })
        : type === 'PROVIDER'
          ? await this.prisma.provider.count({ where: { id, deletedAt: null } })
          : type === 'LISTING'
            ? await this.prisma.listing.count({ where: { id, deletedAt: null } })
            : type === 'ORGANIZATION'
              ? await this.prisma.organization.count({ where: { id, deletedAt: null } })
              : await this.prisma.user.count({ where: { id } });
    if (!found) throw NotFound('Item');
  }
}

@ApiTags('moderation')
@ApiBearerAuth()
@Controller('reports')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @HttpCode(201)
  @ApiZodBody(reportSchema)
  report(@CurrentUser() user: AuthUser, @ZBody(reportSchema) body: z.output<typeof reportSchema>) {
    return this.moderation.report(user, body);
  }
}

@Global()
@Module({ controllers: [ModerationController], providers: [ModerationService], exports: [ModerationService] })
export class ModerationModule {}
