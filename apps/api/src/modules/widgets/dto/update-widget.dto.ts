import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
