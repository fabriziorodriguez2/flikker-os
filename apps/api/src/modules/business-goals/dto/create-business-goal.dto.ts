import { BusinessGoalType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateBusinessGoalDto {
  @IsEnum(BusinessGoalType)
  type: BusinessGoalType;

  @IsInt()
  @Min(1)
  target: number;

  /** ISO date of deadline. If not provided, server computes from planDays. */
  @IsOptional()
  @IsISO8601()
  deadline?: string;

  /** Convenience: 30 / 60 / 90 days from today. */
  @IsOptional()
  @IsInt()
  planDays?: number;
}
