import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CheckinMetricsService } from './checkin-metrics.service';

@Controller('checkin-metrics')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class CheckinMetricsController {
  constructor(private readonly service: CheckinMetricsService) {}

  @Get('overview')
  overview(@Req() req: AuthenticatedRequest) {
    return this.service.getOverview(req.currentBusinessId!);
  }
}
