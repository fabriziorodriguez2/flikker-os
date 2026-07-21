import { BadRequestException, Injectable } from '@nestjs/common';
import { RetentionRepository } from './retention.repository';
import { SaveRetentionSequenceDto } from './dto/save-retention-sequence.dto';

export interface RetentionSequenceView {
  enabled: boolean;
  steps: { id: string; offsetDays: number; messageBody: string }[];
}

@Injectable()
export class RetentionService {
  constructor(private readonly repository: RetentionRepository) {}

  async get(businessId: string): Promise<RetentionSequenceView> {
    const sequence = await this.repository.findByBusiness(businessId);
    if (!sequence) return { enabled: false, steps: [] };
    return { enabled: sequence.enabled, steps: sequence.steps };
  }

  async save(
    businessId: string,
    dto: SaveRetentionSequenceDto,
  ): Promise<RetentionSequenceView> {
    const offsets = dto.steps.map((step) => step.offsetDays);
    if (new Set(offsets).size !== offsets.length) {
      throw new BadRequestException(
        'No puede haber dos pasos con la misma cantidad de días',
      );
    }

    const steps = dto.steps
      .map((step) => ({
        offsetDays: step.offsetDays,
        messageBody: step.messageBody.trim(),
      }))
      .sort((a, b) => a.offsetDays - b.offsetDays);

    const saved = await this.repository.save(businessId, dto.enabled, steps);
    return {
      enabled: saved?.enabled ?? dto.enabled,
      steps: saved?.steps ?? [],
    };
  }
}
