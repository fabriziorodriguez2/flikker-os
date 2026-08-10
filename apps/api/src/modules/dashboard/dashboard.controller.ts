import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { DashboardOverviewService } from './dashboard-overview.service';
import type { DashboardOverviewQuery } from './dashboard-overview.service';

/**
 * Dashboard principal — un solo endpoint agregado en vez de que el
 * frontend dispare N requests independientes por card.
 */
@Controller('dashboard')
@UseGuards(JwtGuard, TenantGuard)
export class DashboardController {
  constructor(private readonly overview: DashboardOverviewService) {}

  @Get('overview')
  getOverview(
    @Req() req: AuthenticatedRequest,
    @Query() query: DashboardOverviewQuery,
  ) {
    return this.overview.getOverview(req.currentBusinessId!, query);
  }
}
