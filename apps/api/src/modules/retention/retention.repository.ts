import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RetentionStepData {
  offsetDays: number;
  messageBody: string;
}

@Injectable()
export class RetentionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByBusiness(businessId: string) {
    return this.prisma.retentionSequence.findUnique({
      where: { businessId },
      include: {
        steps: {
          orderBy: { offsetDays: 'asc' },
          select: { id: true, offsetDays: true, messageBody: true },
        },
      },
    });
  }

  /**
   * Upserts the business's sequence and replaces its steps wholesale.
   * Safe because send history dedups on (customerId, offsetDays), not step id.
   */
  async save(businessId: string, enabled: boolean, steps: RetentionStepData[]) {
    return this.prisma.$transaction(async (tx) => {
      const sequence = await tx.retentionSequence.upsert({
        where: { businessId },
        create: { businessId, enabled },
        update: { enabled },
      });

      await tx.retentionStep.deleteMany({ where: { sequenceId: sequence.id } });

      if (steps.length > 0) {
        await tx.retentionStep.createMany({
          data: steps.map((step) => ({
            sequenceId: sequence.id,
            businessId,
            offsetDays: step.offsetDays,
            messageBody: step.messageBody,
          })),
        });
      }

      return tx.retentionSequence.findUnique({
        where: { id: sequence.id },
        include: {
          steps: {
            orderBy: { offsetDays: 'asc' },
            select: { id: true, offsetDays: true, messageBody: true },
          },
        },
      });
    });
  }
}
