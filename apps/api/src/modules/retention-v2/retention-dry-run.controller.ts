import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RetentionDryRunReportService } from './retention-dry-run-report.service';

/** Fase C.5 §9 — the "modo observación" panel. */
@Controller('retention-v2/dry-run')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class RetentionDryRunController {
  constructor(private readonly report: RetentionDryRunReportService) {}

  @Get('report')
  today(@Req() req: AuthenticatedRequest) {
    return this.report.today(req.currentBusinessId!);
  }
}
