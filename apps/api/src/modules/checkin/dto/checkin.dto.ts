import { ConsentChannel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Código de presencia — el que el negocio muestra rotando en el mostrador.
 * Opcional en el DTO a propósito: si el negocio NO lo exige
 * (`checkinPresenceMode: off`, el default) el cliente nunca lo manda. Quién
 * lo exige lo decide el backend por negocio, nunca el frontend.
 */
export class PresenceCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(12)
  presenceCode?: string;
}

export class CheckinDto extends PresenceCodeDto {}

export class RegisterDto extends PresenceCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsISO8601()
  birthdate?: string;

  /**
   * La casilla "Quiero recibir promociones por WhatsApp", desmarcada por
   * defecto. Solo `true` registra consentimiento: no marcarla no es un sí.
   */
  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;
}

export class RecoverStartDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;
}

export class RecoverVerifyDto extends PresenceCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}

export class ClientEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  type!: string;
}

export class SubmitCheckinFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** El cliente acepta (true) o retira (false) su consentimiento promocional. */
export class SetConsentDto {
  @IsEnum(ConsentChannel)
  channel!: ConsentChannel;

  @IsBoolean()
  granted!: boolean;
}
