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

// Manual partial of CreateBenefitDto (no @nestjs/mapped-types dependency).
export class UpdateBenefitDto {
  @IsOptional()
  @IsEnum(BenefitType)
  type?: BenefitType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(60)
  recurrence?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
