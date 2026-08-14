import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Los dos interruptores, independientes. Cada campo es opcional: mandar solo
 * uno cambia solo ése — prender los recordatorios de progreso no puede
 * encender la reactivación de rebote.
 */
export class UpdateAutomationsDto {
  /** "Cerca del premio" → RetentionSettings.progressReminderEnabled */
  @IsOptional()
  @IsBoolean()
  cercaDelPremio?: boolean;

  /** "Te extrañamos" → RetentionSettings.automaticCampaignsEnabled */
  @IsOptional()
  @IsBoolean()
  teExtranamos?: boolean;

  /**
   * Beneficios autorizados para reactivación. Lista COMPLETA, no un delta:
   * lo que no venga acá queda desautorizado. Omitir el campo no toca nada.
   * Array vacío = "solo recordatorios, sin beneficio".
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefitIds?: string[];

  /**
   * "¿Cuántos beneficios como máximo puede ofrecer Flikker por mes?" →
   * RetentionSettings.maxAutomatedIncentivesPerMonth. El único presupuesto
   * que este panel expone — nunca el tope monetario, que sigue siendo
   * configuración avanzada de Platform Admin. Mínimo 1: un límite en 0 no es
   * "un límite", es "no autorices nada" (para eso está `benefitIds: []`).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  automaticIncentiveMonthlyLimit?: number;
}
