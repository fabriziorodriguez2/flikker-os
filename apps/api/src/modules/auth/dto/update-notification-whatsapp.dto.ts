import { IsString, MinLength } from 'class-validator';

/**
 * El formato real (8-15 dígitos tras normalizar) lo valida
 * `normalizeToE164` en el servicio — acá solo se descarta de entrada un
 * body vacío o claramente inválido.
 */
export class UpdateNotificationWhatsAppDto {
  @IsString()
  @MinLength(6)
  phone: string;
}
