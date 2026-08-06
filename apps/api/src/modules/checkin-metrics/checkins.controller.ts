import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CheckinsService } from './checkins.service';

@Controller('checkins')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class CheckinsController {
  constructor(private readonly service: CheckinsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('sourceId') sourceId?: string,
    @Query('onlyReturns') onlyReturns?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listVisits(req.currentBusinessId!, {
      sourceId: sourceId || undefined,
      onlyReturns: onlyReturns === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('timeline/:customerId')
  timeline(
    @Req() req: AuthenticatedRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.service.getTimeline(req.currentBusinessId!, customerId);
  }
}
