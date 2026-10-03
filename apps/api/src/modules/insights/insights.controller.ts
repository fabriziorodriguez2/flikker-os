import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { InsightsService } from './insights.service';
import { BusinessInsightSummaryService } from './business-insight-summary.service';
import { PlansService } from '../plans/plans.service';

/**
 * Insights (CHECKIN_V2) — todo de solo lectura, `businessId` siempre del
 * `TenantGuard`/sesión, nunca de un parámetro que el cliente pueda mandar.
 */
@Controller('insights')
@UseGuards(JwtGuard, TenantGuard)
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly summary: BusinessInsightSummaryService,
    private readonly plans: PlansService,
  ) {}

  /** Pantalla completa: métricas + afirmaciones ya narradas. */
  @Get('overview')
  async overview(@Req() req: AuthenticatedRequest) {
    await this.plans.assertProPlanAccess(req.currentBusinessId!);
    return this.insights.getBusinessOverview(req.currentBusinessId!);
  }

  /** "Resumen de Flikker" — cacheado, no llama a IA en cada refresh de pantalla. */
  @Get('summary')
  async getSummary(@Req() req: AuthenticatedRequest) {
    await this.plans.assertProPlanAccess(req.currentBusinessId!);
    return this.summary.getSummary(req.currentBusinessId!);
  }

  /** Botón "Actualizar análisis" — fuerza la regeneración, sigue pasando por el gate/cap. */
  @Post('summary/refresh')
  async refreshSummary(@Req() req: AuthenticatedRequest) {
    await this.plans.assertProPlanAccess(req.currentBusinessId!);
    return this.summary.getSummary(req.currentBusinessId!, {
      forceRefresh: true,
    });
  }
}
