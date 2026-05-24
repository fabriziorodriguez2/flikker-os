import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRepeatCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  messageBody?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  triggerOffsetDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2160)
  reviewRequestDelayHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  offerText?: string;
}
