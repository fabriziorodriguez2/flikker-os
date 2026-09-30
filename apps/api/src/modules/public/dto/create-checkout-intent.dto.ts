import { CheckoutPlan } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * El formulario de la landing, validado del lado del servidor.
 *
 * El frontend ya valida, pero esta clase existe igual: la landing vive en
 * otro repo y otro dominio, así que cualquiera puede postear a este endpoint
 * sin pasar por ella. Lo que llega acá se trata como texto arbitrario de
 * internet.
 *
 * `whitelist: true` + `forbidNonWhitelisted: true` (ValidationPipe global en
 * `main.ts`) hacen que un body con campos de más sea RECHAZADO, no
 * silenciosamente recortado. Eso es lo que impide que alguien mande
 * `amount`, `currency` o `status` y que en el futuro algún refactor los
 * empiece a leer sin querer: hoy ese request falla con 400, ruidosamente.
 *
 * El email y el teléfono solo se chequean acá como "string de largo
 * razonable". La validación real —formato y normalización— la hacen
 * `parseEmail` y `normalizeToE164` en el service, que son las mismas que usa
 * el resto del repo. Duplicar un regex de email en un DTO sería una segunda
 * definición de "email válido" destinada a desincronizarse.
 */
export class CreateCheckoutIntentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(254)
  email!: string;

  /**
   * Solo MONTHLY o YEARLY. Un string arbitrario es 400 — nunca se persiste
   * un plan que el sistema no reconoce.
   *
   * El plan dice QUÉ se eligió, no CUÁNTO cuesta. El precio lo decide el
   * backend al crear la Preference (Parte 3); la landing no manda montos y
   * este DTO no los acepta.
   */
  @IsEnum(CheckoutPlan)
  plan!: CheckoutPlan;
}
