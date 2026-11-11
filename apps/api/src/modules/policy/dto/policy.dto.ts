import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Todos los valores de la política, obligatorios: aceptar o editar nunca deja
 * un tope en un default que el dueño no vio. Los rangos son límites de
 * cordura, no recomendaciones.
 */
export class PolicyValuesDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  messagingBudgetMonthly!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  incentiveBudgetMonthly!: number;

  @IsInt()
  @Min(1)
  @Max(5000)
  maxUniqueRecipientsPerWeek!: number;

  @IsInt()
  @Min(0)
  @Max(50)
  maxNewCampaignsPerWeek!: number;

  @IsInt()
  @Min(1)
  @Max(90)
  minDaysBetweenPromotions!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  maxPromotionsPer30Days!: number;

  @IsInt()
  @Min(0)
  @Max(23)
  sendingHourStart!: number;

  @IsInt()
  @Min(1)
  @Max(24)
  sendingHourEnd!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  maxCampaignSharePercent!: number;
}

export class AcceptPolicyDto extends PolicyValuesDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  confirmedCurrency!: string;

  @IsString()
  @MaxLength(64)
  confirmedTimezone!: string;

  @IsInt()
  @Min(1)
  policyVersion!: number;
}

export class UpdatePolicyDto extends PolicyValuesDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class SetMessageCostDto {
  /** null borra el costo: el negocio queda sin poder enviar por política. */
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100_000)
  unitCost!: number | null;

  @ValidateIf((o: SetMessageCostDto) => o.unitCost !== null)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string | null;
}

export class EvaluatePromotionDto {
  @IsIn(['todos', 'volvieron', 'ausentes', 'cerca'])
  audience!: 'todos' | 'volvieron' | 'ausentes' | 'cerca';

  @IsOptional()
  @IsUUID()
  benefitId?: string;
}

export class RecordConsentDto {
  @IsIn(['WHATSAPP', 'EMAIL'])
  channel!: 'WHATSAPP' | 'EMAIL';

  /** El staff registra lo que el cliente dijo; suprimir es por queja. */
  @IsIn(['GRANTED', 'REVOKED', 'SUPPRESSED', 'UNSUPPRESSED'])
  action!: 'GRANTED' | 'REVOKED' | 'SUPPRESSED' | 'UNSUPPRESSED';

  /** true cuando la supresión viene de una queja del cliente. */
  @IsOptional()
  @IsBoolean()
  complaint?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
