import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { stampsExpiryEmail, stampsExpiryWhatsAppText } from './email-templates';
import { RetentionSettingsService } from '../modules/retention-v2/retention-settings.service';
import { AutomationCooldownService } from './automation-cooldown.service';

/** Aviso enviado cuando el premio vence dentro de esta ventana. */
const WARNING_WINDOW_DAYS = 3;

/**
 * Notificaciones (Free) — "sellos por vencer": el cliente completó su
 * tarjeta, tiene un premio real esperando (`BenefitParticipation`, emitido
 * por `RewardGoalIssuerService` cuando el goal se desbloquea) y todavía no
 * lo canjeó. Sin costo de plan — disponible siempre que el negocio tenga
 * sellos activos y prenda el toggle. Manda por WhatsApp Y por email — ambos
 * comparten la misma decisión de a quién y cuándo, cada uno con su propio
 * slot de idempotencia (`EmailLog.channel`).
 *
 * No es un motor nuevo: la existencia del premio y su `expiresAt` ya los
 * decide `RewardGoalIssuerService` (Fase E) desde antes de esta tanda; esto
 * solo lee esa promesa ya hecha y avisa antes de que se pierda.
 *
 * Prioridad 2 (después de Cumpleaños) en el cooldown global de 24h — ver
 * `AutomationCooldownService`. El orden real lo da que este sweep corre
 * ANTES que Retention V2 (cron de `LifecycleEmailsQueue`) y que
 * `BirthdayEmailService.runDaily` se llama antes que este en
 * `LifecycleEmailsWorker`.
 */
@Injectable()
export class StampsExpiryEmailService {
  private readonly logger = new Logger(StampsExpiryEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly retentionSettings: RetentionSettingsService,
    private readonly cooldown: AutomationCooldownService,
  ) {}

  async runDaily(now: Date = new Date()) {
    const businesses = await this.prisma.business.findMany({
      where: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionSettings: {
          rewardGoalsEnabled: true,
          stampsExpiryEmailEnabled: true,
        },
      },
      select: { id: true, name: true, timezone: true },
    });

    let evaluated = 0;
    let sent = 0;
    let suppressed = 0;

    for (const business of businesses) {
      // Ventana horaria del negocio, revalidada justo antes de mandar —
      // mismo criterio y misma fuente que Retention V2 (§ pedido explícito:
      // "confirmar que... la ventana horaria se valida server-side justo
      // antes de enviar").
      const settings = await this.retentionSettings.getOrCreate(business.id);
      if (
        !this.retentionSettings.isWithinSendingWindow(
          settings,
          business.timezone,
          now,
        )
      ) {
        continue;
      }

      const soon = new Date(now.getTime() + WARNING_WINDOW_DAYS * 86_400_000);
      const goals = await this.prisma.customerRewardGoal.findMany({
        where: {
          businessId: business.id,
          status: RewardGoalStatus.UNLOCKED,
          benefitParticipationId: { not: null },
          benefitParticipation: {
            redeemedAt: null,
            expiresAt: { gte: now, lte: soon },
          },
        },
        select: {
          customerId: true,
          customer: { select: { name: true, email: true, phoneE164: true } },
          incentiveDefinition: { select: { name: true } },
          benefitParticipation: {
            select: { id: true, redemptionCode: true, expiresAt: true },
          },
        },
      });

      for (const goal of goals) {
        evaluated += 1;
        const participation = goal.benefitParticipation;
        if (!participation?.expiresAt || !participation.redemptionCode)
          continue;

        // Cooldown global — un solo reclamo cubre los dos canales de esta
        // misma ocurrencia. Prioridad 2 (solo Cumpleaños puede ganarle, y
        // ya tuvo su turno antes que este — ver LifecycleEmailsWorker), así
        // que se reserva y confirma en el mismo paso, sin esperar.
        const claim = await this.cooldown.claimImmediate({
          businessId: business.id,
          customerId: goal.customerId,
          kind: 'stamps_expiry',
          now,
        });
        if (claim !== 'confirmed') {
          suppressed += 1;
          continue;
        }

        const daysRemaining = Math.max(
          1,
          Math.ceil(
            (participation.expiresAt.getTime() - now.getTime()) / 86_400_000,
          ),
        );

        const { subject, html } = stampsExpiryEmail({
          businessName: business.name,
          customerName: goal.customer.name,
          rewardName: goal.incentiveDefinition.name,
          daysRemaining,
          redemptionCode: participation.redemptionCode,
        });
        const emailOutcome = await this.lifecycleEmails.sendOnce({
          businessId: business.id,
          customerId: goal.customerId,
          kind: 'stamps_expiry',
          channel: 'email',
          dedupeKey: participation.id,
          to: goal.customer.email,
          subject,
          html,
        });

        const text = stampsExpiryWhatsAppText({
          customerName: goal.customer.name,
          rewardName: goal.incentiveDefinition.name,
          daysRemaining,
          redemptionCode: participation.redemptionCode,
        });
        const whatsAppOutcome = await this.lifecycleEmails.sendOnce({
          businessId: business.id,
          customerId: goal.customerId,
          kind: 'stamps_expiry',
          channel: 'whatsapp',
          dedupeKey: participation.id,
          to: goal.customer.phoneE164,
          text,
        });

        if (emailOutcome === 'sent' || whatsAppOutcome === 'sent') sent += 1;
      }
    }

    this.logger.log(
      `Stamps expiry businesses=${businesses.length} evaluated=${evaluated} sent=${sent} suppressed=${suppressed}`,
    );
    return { businesses: businesses.length, evaluated, sent, suppressed };
  }
}
