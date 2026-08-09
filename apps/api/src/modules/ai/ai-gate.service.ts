import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiConfigService } from './ai-config.service';
import { AiUsageService } from './ai-usage.service';
import { MESSAGE_USE_CASES, type AiUseCase } from './ai-usecases';

export type AiGateDecision =
  | { allowed: true }
  | { allowed: false; reasonCode: AiGateRejection };

export type AiGateRejection =
  | 'PLATFORM_DISABLED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'BUSINESS_DISABLED'
  | 'DAILY_OR_MONTHLY_CAP_REACHED';

/**
 * Fase F §5/§6 — the single question every AI-eligible service asks before
 * doing anything else: "am I even allowed to call AI right now, for this
 * business, for this use case?". Composes three independent switches —
 * platform kill switch, per-business opt-in, usage caps — so no caller has
 * to know about more than one of them, and adding a fourth gate later never
 * touches a business service.
 */
@Injectable()
export class AiGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
    private readonly usage: AiUsageService,
  ) {}

  async check(businessId: string, useCase: AiUseCase): Promise<AiGateDecision> {
    if (!this.config.globallyEnabled) {
      return { allowed: false, reasonCode: 'PLATFORM_DISABLED' };
    }
    if (!this.config.providerConfigured) {
      return { allowed: false, reasonCode: 'PROVIDER_NOT_CONFIGURED' };
    }

    // Lives on RetentionSettings, not Business: every other retention-pilot
    // toggle (dryRunEnabled, rewardGoalsEnabled, ...) already does, and the
    // owner already manages all of them from the same settings screen.
    const settings = await this.prisma.retentionSettings.findUnique({
      where: { businessId },
      select: { aiCopyEnabled: true, aiInsightsEnabled: true },
    });
    const businessOptedIn = MESSAGE_USE_CASES.includes(useCase)
      ? Boolean(settings?.aiCopyEnabled)
      : Boolean(settings?.aiInsightsEnabled);
    if (!businessOptedIn) {
      return { allowed: false, reasonCode: 'BUSINESS_DISABLED' };
    }

    const hasCapacity = await this.usage.hasCapacity(businessId);
    if (!hasCapacity) {
      return { allowed: false, reasonCode: 'DAILY_OR_MONTHLY_CAP_REACHED' };
    }

    return { allowed: true };
  }
}
