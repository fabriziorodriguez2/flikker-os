import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WidgetMode, WidgetPosition } from '@prisma/client';

export class UpdateWidgetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @IsEnum(WidgetMode)
  mode?: WidgetMode;

  @IsOptional()
  @IsEnum(WidgetPosition)
  position?: WidgetPosition;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxItems?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(5)
  minStars?: number;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  rotationSeconds?: number;

  @IsOptional()
  @IsBoolean()
  showAuthorName?: boolean;

  @IsOptional()
  @IsBoolean()
  showDate?: boolean;
}
