import { ExperienceVersion } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/**
 * Platform-admin rollout controls for a single business. Both fields are
 * optional so the caller can flip either one independently.
 */
export class UpdateExperienceDto {
  @IsOptional()
  @IsEnum(ExperienceVersion)
  experienceVersion?: ExperienceVersion;

  /**
   * Persisted only. The retention engine is not implemented yet, so toggling
   * this changes no behaviour — retention.worker and the current campaigns are
   * untouched.
   */
  @IsOptional()
  @IsBoolean()
  retentionEngineV2Enabled?: boolean;
}
