import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Every field optional and independently settable — this is a PATCH, not a
 * replace. Ranges mirror the schema comments in `schema.prisma`; keeping the
 * validation here (not duplicated in the service) is what makes "the schema
 * defaults are the whole safe-defaults story" still true after this endpoint
 * exists.
 */
export class UpdateRetentionSettingsDto {
  @IsOptional()
  @IsBoolean()
  automaticCampaignsEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageTicketAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  estimatedMarginPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  minimumDaysBetweenRetentionMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  maximumRetentionMessagesPer30Days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  sendingHourStart?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  sendingHourEnd?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  allowedSendingDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  controlGroupPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumSampleSizeForRecommendations?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAutomatedIncentivesPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxEstimatedIncentiveCostPerMonth?: number;

  @IsOptional()
  @IsBoolean()
  dryRunEnabled?: boolean;

  // Fase E — Reward Goals.
  @IsOptional()
  @IsBoolean()
  rewardGoalsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  rewardGoalMinVisits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  rewardGoalMaxVisits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  rewardGoalCooldownDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxPromisedRewardGoalsPerIncentive?: number;
}
