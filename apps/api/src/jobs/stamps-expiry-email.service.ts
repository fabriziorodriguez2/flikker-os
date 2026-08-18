import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { stampsExpiryEmail } from './email-templates';

/** Aviso enviado cuando el premio vence dentro de esta ventana. */
const WARNING_WINDOW_DAYS = 3;

/**
 * Notificaciones (Free) — "sellos por vencer": el cliente completó su
 * tarjeta, tiene un premio real esperando (`BenefitParticipation`, emitido
 * por `RewardGoalIssuerService` cuando el goal se desbloquea) y todavía no
 * lo canjeó. Sin costo de plan — disponible siempre que el negocio tenga
 * sellos activos y prenda el toggle.
 *
 * No es un motor nuevo: la existencia del premio y su `expiresAt` ya los
 * decide `RewardGoalIssuerService` (Fase E) desde antes de esta tanda; esto
 * solo lee esa promesa ya hecha y avisa antes de que se pierda.
 */
@Injectable()
export class StampsExpiryEmailService {
  private readonly logger = new Logger(StampsExpiryEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleEmails: LifecycleEmailsService,
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
      select: { id: true, name: true },
    });

    let evaluated = 0;
    let sent = 0;

    for (const business of businesses) {
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
          customer: { select: { name: true, email: true } },
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

        const outcome = await this.lifecycleEmails.sendOnce({
          businessId: business.id,
          customerId: goal.customerId,
          kind: 'stamps_expiry',
          dedupeKey: participation.id,
          to: goal.customer.email,
          subject,
          html,
        });
        if (outcome === 'sent') sent += 1;
      }
    }

    this.logger.log(
      `Stamps expiry email businesses=${businesses.length} evaluated=${evaluated} sent=${sent}`,
    );
    return { businesses: businesses.length, evaluated, sent };
  }
}
