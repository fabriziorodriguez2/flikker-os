import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RetentionResultsOverviewService } from './retention-results-overview.service';

/**
 * Fase D §40 — `GET /retention-v2/results/overview`. Read-only for every role
 * the panel lets in (see `RetentionExperimentsController.results` for why).
 */
@Controller('retention-v2/results')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class RetentionResultsController {
  constructor(private readonly overview: RetentionResultsOverviewService) {}

  @Get('overview')
  overviewForBusiness(@Req() req: AuthenticatedRequest) {
    return this.overview.forBusiness(req.currentBusinessId!);
  }
}
