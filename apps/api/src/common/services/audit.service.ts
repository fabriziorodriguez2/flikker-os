import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type AuditLogParams = {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  businessId: string;
  metadata?: object;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          actorUserId: params.userId,
          businessId: params.businessId,
          ...(params.metadata
            ? { metadata: params.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${params.action}:${params.entityType}:${params.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
