import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WidgetType } from '@prisma/client';

export class CreateWidgetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(WidgetType)
  type!: WidgetType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxItems?: number;

  @IsOptional()
  @IsBoolean()
  showAuthorName?: boolean;

  @IsOptional()
  @IsBoolean()
  showDate?: boolean;
}
