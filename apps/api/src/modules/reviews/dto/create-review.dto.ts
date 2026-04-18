import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ReviewSource } from '@prisma/client';

export class CreateReviewDto {
  @IsEnum(ReviewSource)
  source: ReviewSource;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsDateString()
  reviewedAt: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReviewId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorDisplayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}
