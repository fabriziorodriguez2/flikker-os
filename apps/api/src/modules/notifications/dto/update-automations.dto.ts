import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

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
}
