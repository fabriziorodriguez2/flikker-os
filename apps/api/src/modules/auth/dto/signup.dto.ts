import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Alta self-service. Pide exactamente lo mínimo para tener una cuenta:
 * nombre, email, contraseña y su confirmación. El nombre del negocio NO se
 * pide acá — se configura en `/comenzar` una vez que el usuario confirma su
 * correo (ver `OnboardingService.saveBusiness`).
 *
 * `SignupVertical` ya no se usa en este flujo (el rubro real se elige en el
 * wizard, sobre la lista de `BUSINESS_CATEGORIES`), pero se mantiene
 * exportado por si algo lo sigue importando desde afuera.
 */
export enum SignupVertical {
  DENTAL = 'dental',
  ESTETICA = 'estetica',
  FISIO = 'fisio',
  GIMNASIO = 'gimnasio',
  OTRO = 'otro',
}

export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /**
   * Validada también en el backend (no solo en el form): un cliente que
   * saltee la validación del browser no puede crear una cuenta con
   * contraseñas distintas a la que después usará para iniciar sesión.
   */
  @IsString()
  @MinLength(8)
  confirmPassword: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
