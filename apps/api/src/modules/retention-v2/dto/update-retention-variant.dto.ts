import { RetentionStrategyType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Only reachable while the parent experiment is DRAFT — see
// RetentionExperimentsAdminService.
export class UpdateRetentionVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(RetentionStrategyType)
  strategyType?: RetentionStrategyType;

  @IsOptional()
  @IsUUID()
  incentiveDefinitionId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  allocationPercent?: number;
}
