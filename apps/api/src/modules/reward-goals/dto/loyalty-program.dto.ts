import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SetStampsCardEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/** Capacidad independiente — ver `RetentionSettings.benefitsEnabled`. */
export class SetBenefitsEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * Misma forma que el paso "Beneficios + sellos" del onboarding
 * (`OnboardingProgramDto`) — es la misma decisión, solo que desde el
 * producto en vez de desde el alta.
 */
export class UpdateStampsCardConfigDto {
  @IsOptional()
  @IsString()
  rewardBenefitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rewardTitle?: string;

  @IsOptional()
  @IsString()
  @IsIn(['gift', 'discount', 'promotion', 'upgrade', 'other'])
  rewardType?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  stampsRequired!: number;

  @IsOptional()
  @IsBoolean()
  feedbackBonusEnabled?: boolean;
}
