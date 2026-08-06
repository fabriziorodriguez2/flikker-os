import { BenefitType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Manual partial of CreateRetentionIncentiveDto (no @nestjs/mapped-types
// dependency — same convention as UpdateBenefitDto).
export class UpdateRetentionIncentiveDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(BenefitType)
  type?: BenefitType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  percentageValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  automationEligible?: boolean;

  @IsOptional()
  @IsBoolean()
  rewardGoalEligible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptionsPerCustomer?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalRedemptions?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  validDays?: number[];
}
