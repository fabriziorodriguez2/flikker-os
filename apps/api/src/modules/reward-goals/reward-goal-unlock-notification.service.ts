import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { rewardGoalUnlockedWhatsAppText } from '../../jobs/email-templates';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';

/**
 * Aviso único de "completaste tu tarjeta" (ACTIVE → UNLOCKED) — mismo patrón
 * que `StampsExpiryEmailService` (ventana horaria → cooldown global →
 * `LifecycleEmailsService.sendOnce`), pero disparado por el evento real del
 * desbloqueo en vez de un sweep diario. `RewardGoalUnlockService` es el
 * único caller, y solo llama a `notify()` dentro del bloque que ya solo se
 * ejecuta una vez por goal (la transición ACTIVE→UNLOCKED guardada con
 * `updateMany`) — así que "una sola vez por goal" ya viene garantizado
 * antes de llegar acá; `dedupeKey: goalId` en `sendOnce` es la segunda
 * capa (protege contra un reintento del propio caller, no solo contra
 * llamadas repetidas de este servicio).
 */
@Injectable()
export class RewardGoalUnlockNotificationService {
  private readonly logger = new Logger(
    RewardGoalUnlockNotificationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly retentionSettings: RetentionSettingsService,
    private readonly cooldown: AutomationCooldownService,
  ) {}

  async notify(input: {
    businessId: string;
    customerId: string;
    goalId: string;
    rewardName: string;
    participationId: string;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();

    const business = await this.prisma.business.findUnique({
      where: { id: input.businessId },
      select: { timezone: true },
    });
    if (!business) return;

    const settings = await this.retentionSettings.getOrCreate(input.businessId);
    if (
      !this.retentionSettings.isWithinSendingWindow(
        settings,
        business.timezone,
        now,
      )
    ) {
      return;
    }

    const claim = await this.cooldown.claimImmediate({
      businessId: input.businessId,
      customerId: input.customerId,
      kind: 'reward_goal_unlocked',
      now,
    });
    if (claim !== 'confirmed') return;

    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { name: true, phoneE164: true },
    });
    if (!customer) return;

    const base = (process.env.WEB_BASE_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    const benefitLink = `${base}/beneficio/${input.participationId}`;

    const text = rewardGoalUnlockedWhatsAppText({
      customerName: customer.name,
      rewardName: input.rewardName,
      benefitLink,
    });

    const outcome = await this.lifecycleEmails.sendOnce({
      businessId: input.businessId,
      customerId: input.customerId,
      kind: 'reward_goal_unlocked',
      channel: 'whatsapp',
      dedupeKey: input.goalId,
      to: customer.phoneE164,
      text,
    });

    if (outcome === 'failed') {
      this.logger.warn(
        `reward_goal_unlocked WhatsApp send failed for goal ${input.goalId}`,
      );
    }
  }
}
