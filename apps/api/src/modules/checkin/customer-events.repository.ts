import { Injectable, Logger } from '@nestjs/common';
import { CustomerEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface EmitEventInput {
  businessId: string;
  customerId: string;
  type: CustomerEventType;
  visitId?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class CustomerEventsRepository {
  private readonly logger = new Logger(CustomerEventsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends a timeline event. Best-effort: the timeline is observability, so a
   * failure here must never break the check-in flow — it is logged, not thrown.
   */
  async emit(input: EmitEventInput): Promise<void> {
    try {
      await this.prisma.customerEvent.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId,
          type: input.type,
          visitId: input.visitId ?? null,
          sourceId: input.sourceId ?? null,
          metadata: input.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `CustomerEvent emit failed (${input.type}) for customer ${input.customerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
