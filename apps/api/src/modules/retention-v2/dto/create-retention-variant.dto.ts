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

export class CreateRetentionVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEnum(RetentionStrategyType)
  strategyType: RetentionStrategyType;

  /** Required for SOFT_BENEFIT/STRONG_BENEFIT, forbidden otherwise — checked in the service. */
  @IsOptional()
  @IsUUID()
  incentiveDefinitionId?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  allocationPercent: number;
}
