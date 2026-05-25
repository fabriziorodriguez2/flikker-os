import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ArrayMaxSize,
} from 'class-validator';

export class PatchCalendarConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  ignoredTitleWords?: string[];

  @IsOptional()
  @IsBoolean()
  autoSendEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(48)
  sendDelayHours?: number;
}
