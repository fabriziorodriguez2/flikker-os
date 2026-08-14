import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { LoyaltyProgramService } from './loyalty-program.service';
import {
  SetStampsCardEnabledDto,
  UpdateStampsCardConfigDto,
} from './dto/loyalty-program.dto';

/**
 * `/loyalty-program/*` — el backend de /dashboard/programa.
 *
 * Lecturas (`overview`, `history`) sin `RolesGuard`: cualquier miembro del
 * negocio puede ver cómo va el programa. Escrituras con
 * `@Roles(OWNER, ADMIN)`, igual que `/benefits/*` y `/retention-v2/settings`
 * — Programa no inventa su propia política de permisos.
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

  @Get('history')
  getHistory(@Req() req: AuthenticatedRequest) {
    return this.program.getHistory(req.currentBusinessId!);
  }

  @Patch('stamps-card')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  setStampsCardEnabled(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetStampsCardEnabledDto,
  ) {
    return this.program.setStampsCardEnabled(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }

  @Patch('stamps-card/config')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateStampsCardConfig(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateStampsCardConfigDto,
  ) {
    return this.program.updateStampsCardConfig(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }
}
