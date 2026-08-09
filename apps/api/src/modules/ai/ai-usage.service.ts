import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiConfigService } from './ai-config.service';
import type { AiUseCase } from './ai-usecases';

const MS_PER_DAY = 86_400_000;

export interface RecordUsageInput {
  businessId: string;
  useCase: AiUseCase;
  model: string;
  promptVersion: string;
  success: boolean;
  fallbackUsed: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  /** Debugging only (Fase F §43) — never phone/email. */
  customerId?: string | null;
}

/**
 * Fase F §6 — cost/usage tracking and the daily/monthly caps that back it.
 * `AiUsageEvent` never stores a prompt or contact info (Fase F §6/§43); it
 * exists purely to answer "how much AI did this business use, and did it
 * work" without needing to replay any request.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
  ) {}

  /**
   * True when the business still has daily AND monthly headroom. Checked
   * BEFORE ever calling the provider (Fase F §6 — "si se supera: fallback
   * determinístico", never a blocked request that has to be retried).
   */
  async hasCapacity(
    businessId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const dayStart = new Date(now.getTime() - MS_PER_DAY);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyCount, monthlyCount] = await Promise.all([
      this.prisma.aiUsageEvent.count({
        where: { businessId, createdAt: { gte: dayStart } },
      }),
      this.prisma.aiUsageEvent.count({
        where: { businessId, createdAt: { gte: monthStart } },
      }),
    ]);

    if (dailyCount >= this.config.maxDailyGenerationsPerBusiness) {
      this.logger.warn(
        `AI daily cap reached for business ${businessId} (${dailyCount}/${this.config.maxDailyGenerationsPerBusiness})`,
      );
      return false;
    }
    if (monthlyCount >= this.config.maxMonthlyGenerationsPerBusiness) {
      this.logger.warn(
        `AI monthly cap reached for business ${businessId} (${monthlyCount}/${this.config.maxMonthlyGenerationsPerBusiness})`,
      );
      return false;
    }
    return true;
  }

  /**
   * Fase F §36/§40 — platform-wide observability, no PII: generations
   * today/this month, success rate, fallback rate, average latency, broken
   * down by use case. This is the only "usage dashboard" this phase ships —
   * no per-business billing, no cost dashboard for owners (Fase F §40 is
   * explicit that a full billing system is not needed yet).
   */
  async platformSummary(now: Date = new Date()) {
    const dayStart = new Date(now.getTime() - MS_PER_DAY);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, month, byUseCase] = await Promise.all([
      this.prisma.aiUsageEvent.count({
        where: { createdAt: { gte: dayStart } },
      }),
      this.prisma.aiUsageEvent.count({
        where: { createdAt: { gte: monthStart } },
      }),
      this.prisma.aiUsageEvent.groupBy({
        by: ['useCase'],
        where: { createdAt: { gte: monthStart } },
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
    ]);

    const [successCount, fallbackCount] = await Promise.all([
      this.prisma.aiUsageEvent.count({
        where: { createdAt: { gte: monthStart }, success: true },
      }),
      this.prisma.aiUsageEvent.count({
        where: { createdAt: { gte: monthStart }, fallbackUsed: true },
      }),
    ]);

    return {
      generationsToday: today,
      generationsThisMonth: month,
      successRateThisMonth: month > 0 ? successCount / month : null,
      fallbackRateThisMonth: month > 0 ? fallbackCount / month : null,
      byUseCase: byUseCase.map((row) => ({
        useCase: row.useCase,
        count: row._count._all,
        averageLatencyMs: row._avg.latencyMs,
      })),
    };
  }

  /**
   * Best-effort, like every other audit write in this codebase
   * (`RetentionDecisionLogService.record`) — a failure to log usage must
   * never fail the generation it is logging, let alone the send it belongs
   * to.
   */
  async record(input: RecordUsageInput): Promise<string | null> {
    try {
      const event = await this.prisma.aiUsageEvent.create({
        data: {
          businessId: input.businessId,
          useCase: input.useCase,
          model: input.model,
          promptVersion: input.promptVersion,
          success: input.success,
          fallbackUsed: input.fallbackUsed,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          latencyMs: input.latencyMs ?? null,
          customerId: input.customerId ?? null,
        },
        select: { id: true },
      });
      return event.id;
    } catch (error) {
      this.logger.warn(
        `AI usage record failed (${input.useCase}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
