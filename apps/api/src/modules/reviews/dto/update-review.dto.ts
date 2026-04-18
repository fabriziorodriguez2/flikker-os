import { IsOptional, IsUUID, IsBoolean } from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsBoolean()
  isHighlighted?: boolean;
}
