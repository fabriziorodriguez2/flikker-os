import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEventType,
  MembershipRole,
  MembershipStatus,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { VisitsRepository } from './visits.repository';
import { CustomerEventsRepository } from './customer-events.repository';
import { isCheckinV2 } from '../../common/experience/experience.util';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from '../retention-v2/retention-decision-log.service';

/** Same three roles the old TenantGuard+RolesGuard combo used to require. */
const ALLOWED_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.OPERATOR,
];

@Injectable()
export class RedemptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly benefits: BenefitsRepository,
    private readonly visits: VisitsRepository,
    private readonly events: CustomerEventsRepository,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  /**
   * Ajuste "canje por URL" — el empleado ya no necesita tener este negocio
   * "activo" en su sesión: escanea el QR con la cámara nativa del teléfono,
   * que abre `/redeem/{code}` autenticado, y el negocio correcto se resuelve
   * a partir del propio código (único globalmente). Esto reemplaza al viejo
   * `TenantGuard` (que exigía `x-business-id` == negocio activo) por una
   * autorización basada en membership real contra el negocio que el código
   * efectivamente pertenece — al menos igual de estricta, pero sin la
   * fricción de "cambiar de negocio" antes de poder canjear.
   */
  private async assertEmployeeAccess(userId: string, businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { experienceVersion: true, timezone: true },
    });
    if (!business || !isCheckinV2(business)) throw new NotFoundException();

    const membership = await this.prisma.membership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { role: true, status: true },
    });
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !ALLOWED_ROLES.includes(membership.role)
    ) {
      throw new ForbiddenException('No tenés acceso a este negocio.');
    }

    return business;
  }

  /**
   * Read-only "scan → preview" step — see PreviewRedemptionResult. Muestra
   * "Beneficio: X / Cliente: Y" antes de consumir nada. El código manual
   * sigue llamando `redeem` directo, sin este paso intermedio.
   */
  async preview(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new NotFoundException('Código inválido');

    const result = await this.benefits.previewRedemption(code);
    if (result.status === 'not_found') {
      throw new NotFoundException('Código no encontrado');
    }

    await this.assertEmployeeAccess(userId, result.businessId);

    if (result.status === 'already') {
      throw new ConflictException('Este beneficio ya fue canjeado');
    }
    if (result.status === 'expired') {
      throw new ConflictException('Este código venció');
    }
    return {
      benefitTitle: result.benefitTitle,
      customerName: result.customerName,
    };
  }

  /**
   * Staff validates a redemption code. In one flow it: (1) atomically consumes
   * the code (no double redemption), (2) records/upgrades the visit to
   * confirmed_redemption, (3) links the visit and emits the timeline event.
   * The authoritative "used once" guarantee is the atomic consume in step 1.
   */
  async redeem(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new NotFoundException('Código inválido');

    // Resuelve a qué negocio pertenece el código y verifica acceso ANTES de
    // consumir nada — nunca quemar un código válido para después descubrir
    // que el empleado no tiene permiso ahí. La garantía de un solo uso
    // sigue viviendo enteramente en el guard atómico de `consumeRedemption`,
    // no en este chequeo previo.
    const lookup = await this.benefits.previewRedemption(code);
    if (lookup.status === 'not_found') {
      throw new NotFoundException('Código no encontrado');
    }
    const business = await this.assertEmployeeAccess(userId, lookup.businessId);

    const consumed = await this.benefits.consumeRedemption(code, userId);
    if (consumed.status === 'not_found') {
      throw new NotFoundException('Código no encontrado');
    }
    if (consumed.status === 'already') {
      throw new ConflictException('Este beneficio ya fue canjeado');
    }
    if (consumed.status === 'expired') {
      throw new ConflictException('Este código venció');
    }

    const visit = await this.visits.registerRedemptionVisit({
      businessId: consumed.businessId,
      customerId: consumed.customerId,
      timezone: business.timezone ?? 'America/Montevideo',
      benefitId: consumed.benefitId,
      participationId: consumed.participationId,
    });

    await this.benefits.attachRedeemedVisit(consumed.participationId, visit.id);
    await this.events.emit({
      businessId: consumed.businessId,
      customerId: consumed.customerId,
      type: CustomerEventType.benefit_redeemed,
      visitId: visit.id,
      metadata: { benefitId: consumed.benefitId },
    });

    await this.closeRewardGoalIfRedeemed(consumed.participationId);

    return {
      ok: true as const,
      customerName: consumed.customerName,
      benefitTitle: consumed.benefitTitle,
      visitId: visit.id,
    };
  }

  /**
   * Fase F §0.2 — the other half of the Reward Goal lifecycle that Fase E
   * left open: when the `BenefitParticipation` just redeemed is the one a
   * `CustomerRewardGoal` carries, close that goal out too (UNLOCKED →
   * REDEEMED). A no-op for every other redemption — most benefits are never
   * reward-goal-sourced, and this must not change their behaviour at all.
   *
   * Idempotent the same way every other reward-goal transition is: a guarded
   * `updateMany` on `status: UNLOCKED`. `consumeRedemption`'s own atomic
   * guard already makes it impossible to reach this twice for the same
   * redemption, but the guard here costs nothing and keeps the invariant
   * self-evident without relying on that.
   */
  private async closeRewardGoalIfRedeemed(participationId: string) {
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: {
        benefitParticipationId: participationId,
        status: RewardGoalStatus.UNLOCKED,
      },
      select: { id: true, businessId: true, customerId: true },
    });
    if (!goal) return;

    const transitioned = await this.prisma.customerRewardGoal.updateMany({
      where: { id: goal.id, status: RewardGoalStatus.UNLOCKED },
      data: { status: RewardGoalStatus.REDEEMED, redeemedAt: new Date() },
    });
    if (transitioned.count === 0) return;

    await this.decisions.record({
      businessId: goal.businessId,
      customerId: goal.customerId,
      decisionCode: DECISION_CODES.REWARD_GOAL_REDEEMED,
      metadata: { goalId: goal.id, participationId },
    });
  }
}
