import { BUSINESS_CATEGORY_VALUES } from '../onboarding.defaults';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OnboardingBusinessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsIn(BUSINESS_CATEGORY_VALUES)
  category!: string;

  /** Data URI o URL. Mismo límite que el brand profile. */
  @IsOptional()
  @IsString()
  @MaxLength(3000000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;
}

export class OnboardingProgramDto {
  /** Beneficio existente a usar como recompensa. Excluyente con `rewardTitle`. */
  @IsOptional()
  @IsString()
  rewardBenefitId?: string;

  /** Crear la recompensa en el momento. Excluyente con `rewardBenefitId`. */
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
  @Max(12)
  stampsRequired!: number;

  @IsOptional()
  @IsBoolean()
  feedbackBonusEnabled?: boolean;
}

export class OnboardingWelcomeGiftDto {
  /** false = "no quiero regalo". Se persiste como decisión real. */
  @IsBoolean()
  wantsGift!: boolean;

  @IsOptional()
  @IsString()
  benefitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class OnboardingDesignDto {
  @IsOptional()
  @IsHexColor()
  loyaltyCardColor?: string;

  @IsOptional()
  @IsHexColor()
  loyaltyStampColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  loyaltyStampIcon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000000)
  logoUrl?: string;
}

export class OnboardingGoogleDto {
  /** URL de la ficha o Place ID pegado por el dueño. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  googleBusinessProfileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  googlePlaceId?: string;
}

/**
 * Dos interruptores, no tres. Hubo un tercero, "recordar que la recompensa
 * está disponible", que se sacó: Retention V2 no tiene con qué ejecutarlo.
 * Su único objetivo de progreso (`REWARD_GOAL_PROGRESS`) recluta solo goals
 * ACTIVE y excluye los UNLOCKED por diseño, así que un cliente con la
 * recompensa ya desbloqueada y sin canjear no entra en ninguna campaña.
 * Dejarlo habría sido un checkbox que no hace nada, o un alias de otro.
 */
export class OnboardingNotificationsDto {
  @IsOptional()
  @IsBoolean()
  remindNearReward?: boolean;

  @IsOptional()
  @IsBoolean()
  reactivateInactive?: boolean;

  /**
   * Beneficios que Flikker puede usar al reactivar. Solo estos — el motor
   * nunca inventa uno. Lista vacía = no puede ofrecer ningún incentivo.
   */
  @IsOptional()
  @IsString({ each: true })
  reactivationBenefitIds?: string[];
}
