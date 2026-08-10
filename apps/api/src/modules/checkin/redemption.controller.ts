import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RedemptionService } from './redemption.service';

class RedeemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string;
}

/**
 * Staff-facing benefit validation. Owners/admins and counter operators can
 * validate a customer's redemption code.
 *
 * Ajuste "canje por URL" — deliberadamente sin `TenantGuard`/`RolesGuard`/
 * `CheckinV2Guard` a nivel de decorator: el negocio y el rol ya no se
 * resuelven desde `x-business-id` (el "negocio activo" de la sesión), sino
 * desde el propio código escaneado — `RedemptionService.assertEmployeeAccess`
 * hace ese chequeo (membership + rol + Check-in V2) contra el negocio real
 * al que pertenece el código, cualquiera sea el negocio activo del
 * empleado. Solo requiere estar logueado (`JwtGuard`); todo el resto de la
 * autorización vive en el service, con acceso a `req.user.id`.
 *
 * Hardening pre-piloto: `ThrottlerGuard` en las dos rutas (mismo límite
 * global que ya usa `recoverVerify` para el código de recupero — el otro
 * endpoint del repo que valida un código corto adivinable). `preview` y
 * `redeem` son la misma superficie de ataque para enumeración/fuerza bruta
 * de códigos — no importa si el intento llega escaneando un QR o tipeando
 * el código manual (`RedeemValidator`), ambos caminos terminan acá.
 */
@Controller('redemptions')
@UseGuards(JwtGuard, ThrottlerGuard)
export class RedemptionController {
  constructor(private readonly service: RedemptionService) {}

  // Lectura, nunca consume. La pantalla de canje (`/redeem/{token}`) llama
  // esto primero para mostrar "Beneficio: X / Cliente: Y"; recién al tocar
  // "Confirmar canje" llama a /redeem con el mismo código.
  @Post('preview')
  preview(@Req() req: AuthenticatedRequest, @Body() dto: RedeemDto) {
    return this.service.preview(req.user.id, dto.code);
  }

  @Post('redeem')
  redeem(@Req() req: AuthenticatedRequest, @Body() dto: RedeemDto) {
    return this.service.redeem(req.user.id, dto.code);
  }
}
