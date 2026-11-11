import {
  IsIn,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PROMOTION_AUDIENCES,
  type PromotionAudience,
} from '../notifications-promotions.service';

export class SendPromotionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;

  /** Audiencias cerradas. No hay segment builder ni filtros arbitrarios. */
  @IsIn(Object.keys(PROMOTION_AUDIENCES))
  audience!: PromotionAudience;

  /**
   * Beneficio del catálogo de Programa. Opcional: sin esto la promoción es
   * solo un mensaje. Nunca se crea un Benefit desde acá.
   */
  @IsOptional()
  @IsString()
  benefitId?: string;

  /**
   * Una por intento de envío (la genera la pantalla al abrir la
   * confirmación). Con la política aceptada, el mismo valor dos veces
   * devuelve el resultado del primero en vez de mandar de nuevo.
   */
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
