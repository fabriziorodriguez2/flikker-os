import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AiConfigService } from './ai-config.service';
import { AiUsageService } from './ai-usage.service';

/**
 * Fase F §36/§40 — platform-admin-only observability + the read side of the
 * kill switch. Turning AI off is still just the `AI_ENABLED` env var
 * (Fase F §5 deliberately keeps this a deploy-time switch, not a runtime
 * toggle with its own write endpoint) — this only reports current state and
 * usage, it never flips anything.
 */
@Controller('platform/ai-usage')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class AiUsageController {
  constructor(
    private readonly usage: AiUsageService,
    private readonly config: AiConfigService,
  ) {}

  @Get()
  async summary() {
    const usage = await this.usage.platformSummary();
    return {
      globallyEnabled: this.config.globallyEnabled,
      providerConfigured: this.config.providerConfigured,
      model: this.config.model,
      maxDailyGenerationsPerBusiness:
        this.config.maxDailyGenerationsPerBusiness,
      maxMonthlyGenerationsPerBusiness:
        this.config.maxMonthlyGenerationsPerBusiness,
      ...usage,
    };
  }
}
