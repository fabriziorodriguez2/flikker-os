import { BusinessPlanType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SetBusinessPlanDto {
  @IsEnum(BusinessPlanType)
  plan: BusinessPlanType;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialGoal?: number;

  @IsOptional()
  @IsISO8601()
  trialStart?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
