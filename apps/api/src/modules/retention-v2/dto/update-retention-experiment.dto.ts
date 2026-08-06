import { CustomerSegment } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Only name and segment may change, and only while DRAFT — the service
 * enforces that. Objective is not editable at all: changing it mid-draft
 * would silently repurpose variants that were configured for a different
 * recruitment rule.
 */
export class UpdateRetentionExperimentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment | null;
}
