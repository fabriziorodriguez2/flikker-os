import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { LoyaltyProgramService } from './loyalty-program.service';

/**
 * `GET /loyalty-program/overview` — el resumen que alimenta la pestaña
 * "Resumen" de /dashboard/programa.
 *
 * Solo lectura y sin `RolesGuard`: cualquier miembro del negocio puede ver
 * cómo va el programa. Escribir sigue pasando por los endpoints que ya
 * existen (`/benefits/*`, `/retention-v2/settings`), cada uno con su propio
 * `@Roles(OWNER, ADMIN)` — no se duplica autorización acá.
 *
 * `CheckinV2Guard` responde 404 en LEGACY (nunca 403), y el frontend lo
 * traduce a un estado "no disponible" controlado.
 */
@Controller('loyalty-program')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class LoyaltyProgramController {
  constructor(private readonly program: LoyaltyProgramService) {}

  @Get('overview')
  getOverview(@Req() req: AuthenticatedRequest) {
    return this.program.getOverview(req.currentBusinessId!);
  }
}
