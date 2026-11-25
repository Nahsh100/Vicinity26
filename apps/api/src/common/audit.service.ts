import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

/** Records sensitive actions (admin changes, auth events, deletions). Failures never break the request. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    actorId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
          ip: entry.ip,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to write audit log for ${entry.action}: ${(e as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
