import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { MetricsService } from './metrics.service';
import { OverviewQueryDto } from './dto/overview-query.dto';

@Controller('metrics')
@UseGuards(JwtGuard, TenantGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  overview(
    @Req() req: AuthenticatedRequest,
    @Query() query: OverviewQueryDto,
  ) {
    return this.metricsService.getOverview(
      req.currentBusinessId!,
      query.days,
    );
  }
}
