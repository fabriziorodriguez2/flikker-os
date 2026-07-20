import { BenefitType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBenefitDto {
  @IsEnum(BenefitType)
  type: BenefitType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terms?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  /** Free-form recurrence hint (e.g. "monthly"). Semantics stay open for now. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  recurrence?: string;

  /** When true, this benefit becomes the single active one for the business. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
