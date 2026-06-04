import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtGuard, TenantGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('panel')
  panel(@Req() req: AuthenticatedRequest) {
    return this.metricsService.getPanelStats(req.currentBusinessId!);
  }

  @Get('overview')
  overview(
    @Req() req: AuthenticatedRequest,
    @Query()
    query: {
      granularity?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.metricsService.getOverview(req.currentBusinessId!, query);
  }

  /**
   * GET /metrics/conversion?range=last_30_days|last_90_days|all_time&attribution_window_days=7
   *
   * Returns a conversion rate summary for the authenticated business.
   * Messages sent within the last `attribution_window_days` days are excluded
   * from the denominator to avoid recency bias (reviews may not have appeared yet).
   * Returns conversionRate: null + insufficientData: true when sentMessages < 30.
   */
  @Get('conversion')
  getConversion(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('attribution_window_days') attributionWindowDays?: string,
  ) {
    return this.metricsService.getConversionSummary(
      req.currentBusinessId!,
      range,
      parseAttributionWindow(attributionWindowDays),
    );
  }

  /**
   * GET /metrics/conversion/funnel?attribution_window_days=7
   *
   * Returns the full conversion funnel (all-time) with topDropOffStep.
   */
  @Get('conversion/funnel')
  getConversionFunnel(
    @Req() req: AuthenticatedRequest,
    @Query('attribution_window_days') attributionWindowDays?: string,
  ) {
    return this.metricsService.getConversionFunnel(
      req.currentBusinessId!,
      parseAttributionWindow(attributionWindowDays),
    );
  }

  /**
   * GET /metrics/conversion/timeseries?granularity=month|week&attribution_window_days=7
   *
   * Returns a time-series of conversion rates. Default: last 6 months, monthly granularity.
   * Periods with fewer than 30 sent messages return rate: null.
   */
  @Get('conversion/timeseries')
  getConversionTimeSeries(
    @Req() req: AuthenticatedRequest,
    @Query('granularity') granularity?: string,
    @Query('attribution_window_days') attributionWindowDays?: string,
  ) {
    return this.metricsService.getConversionTimeSeries(
      req.currentBusinessId!,
      granularity,
      parseAttributionWindow(attributionWindowDays),
    );
  }

  @Post('feedback/:feedbackId/acknowledge')
  async acknowledgeFeedback(
    @Req() req: AuthenticatedRequest,
    @Param('feedbackId') feedbackId: string,
  ) {
    const result = await this.metricsService.acknowledgeNegativeFeedback(
      req.currentBusinessId!,
      feedbackId,
    );
    if (!result) throw new NotFoundException('Feedback not found');
    return result;
  }
}

/** Clamps attribution_window_days to [1, 30], defaulting to 7. */
function parseAttributionWindow(raw?: string, defaultDays = 7): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return defaultDays;
  return Math.min(n, 30);
}
