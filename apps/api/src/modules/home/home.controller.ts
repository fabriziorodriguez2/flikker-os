import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { HomeService } from './home.service';

/**
 * Inicio. Solo lectura y sin `RolesGuard`: cualquier miembro activo ve la
 * portada de su negocio. `CheckinV2Guard` la deja invisible para LEGACY, que
 * conserva su panel de siempre.
 */
@Controller('home')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('overview')
  overview(@Req() req: AuthenticatedRequest) {
    return this.home.overview(req.currentBusinessId!);
  }

  @Get('setup')
  setup(@Req() req: AuthenticatedRequest) {
    return this.home.setupTasks(req.currentBusinessId!);
  }
}
