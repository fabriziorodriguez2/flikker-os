import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Solo lo que el dueño necesita para decidir. Los rangos espejan los del
 * schema. Lo que NO está acá (grupo de control, tamaños de muestra, ventanas
 * de atribución, topes de presupuesto, modo de optimización) queda en su
 * default interno a propósito: es necesario para que el motor sea seguro,
 * no para que el dueño elija.
 */
export class UpdateNotificationSettingsDto {
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

  /** ISO: 1 = lunes … 7 = domingo. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  allowedSendingDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  minimumDaysBetweenMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  maximumMessagesPer30Days?: number;
}
