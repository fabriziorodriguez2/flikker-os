import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MissionPeriodPreset, MissionStatus } from '@prisma/client';
import {
  MAX_PERIOD_DAYS,
  MAX_TARGET_VISITS,
  MIN_PERIOD_DAYS,
  MIN_TARGET_VISITS,
} from '../mission-period';

export class CreateMissionDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsInt()
  @Min(MIN_TARGET_VISITS)
  @Max(MAX_TARGET_VISITS)
  targetVisits!: number;

  @IsEnum(MissionPeriodPreset)
  periodPreset!: MissionPeriodPreset;

  @IsOptional()
  @IsInt()
  @Min(MIN_PERIOD_DAYS)
  @Max(MAX_PERIOD_DAYS)
  periodDays?: number;

  /** Solo para `CUSTOM`. Con cualquier otro preset se ignoran. */
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsUUID()
  rewardBenefitId?: string;

  @IsOptional()
  @IsBoolean()
  rewardHiddenUntilComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

/**
 * Deliberadamente NO acepta `targetVisits`, fechas ni premio: esas reglas se
 * congelan al crear la misión. Para cambiarlas se crea una misión nueva.
 */
export class UpdateMissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  rewardHiddenUntilComplete?: boolean;
}

export class SetMissionStatusDto {
  @IsEnum(MissionStatus)
  status!: MissionStatus;
}
