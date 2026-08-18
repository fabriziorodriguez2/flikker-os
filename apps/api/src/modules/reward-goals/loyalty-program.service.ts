import { BadRequestException, Injectable } from '@nestjs/common';
import { BenefitType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { PlansService } from '../plans/plans.service';
import type {
  SetBenefitsEnabledDto,
  SetStampsCardEnabledDto,
  UpdateStampsCardConfigDto,
} from './dto/loyalty-program.dto';

const RECENT_ACTIVITY_LIMIT = 12;
const HISTORY_LIMIT = 40;

export interface LoyaltyProgramActivityItem {
  id: string;
  type: 'stamp' | 'unlocked' | 'redeemed' | 'feedback';
  customerName: string | null;
  detail: string | null;
  occurredAt: string;
}

/**
 * "Programa" — la fachada de negocio sobre Reward Goals. Traduce el estado
 * interno (metas, incentivos autorizados, ajustes de retención) a los cuatro
 * números y la actividad que el dueño realmente entiende, sin exponer
 * ninguno de los nombres internos.
 *
 * No decide nada: solo lee. Toda la lógica de creación/desbloqueo sigue
 * viviendo en `RewardGoalEngineService`/`RewardGoalUnlockService`.
 */
@Injectable()
export class LoyaltyProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly benefits: BenefitsRepository,
    private readonly programAudit: ProgramAuditService,
    private readonly retentionBootstrap: RetentionV2BootstrapService,
    private readonly plans: PlansService,
  ) {}

  async getOverview(businessId: string) {
    const settings = await this.settings.getOrCreate(businessId);

    const [
      customersParticipating,
      cardsInProgress,
      unlockedTotal,
      redeemedTotal,
      rewardBenefit,
      welcomeBenefit,
      recentActivity,
      benefitsCount,
      selfService,
    ] = await Promise.all([
      // Clientes distintos que alguna vez tuvieron una tarjeta.
      this.prisma.customerRewardGoal
        .groupBy({ by: ['customerId'], where: { businessId } })
        .then((rows) => rows.length),
      this.prisma.customerRewardGoal.count({
        where: { businessId, status: RewardGoalStatus.ACTIVE },
      }),
      this.prisma.customerRewardGoal.count({
        where: { businessId, unlockedAt: { not: null } },
      }),
      this.prisma.customerRewardGoal.count({
        where: { businessId, redeemedAt: { not: null } },
      }),
      // La recompensa vigente = el beneficio autorizado como tarjeta. Puede
      // haber varios autorizados; el motor elige el menor id, así que se
      // muestra ese mismo criterio para que la UI no mienta.
      this.prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId, active: true, rewardGoalEligible: true },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, benefitId: true },
      }),
      // Regalo de bienvenida: sale de `Business.welcomeBenefitId`, NO de
      // `Benefit.active` — son conceptos distintos (ver
      // `BenefitsService.grantWelcomeGift`).
      this.prisma.business
        .findUnique({
          where: { id: businessId },
          select: { welcomeBenefit: { select: { id: true, title: true } } },
        })
        .then((row) => row?.welcomeBenefit ?? null),
      this.buildRecentActivity(businessId),
      this.prisma.benefit.count({ where: { businessId } }),
      this.plans.getSelfServiceStatus(businessId),
    ]);

    const stampsRequired =
      settings.rewardGoalMinVisits ?? settings.rewardGoalMaxVisits ?? null;

    return {
      enabled: settings.rewardGoalsEnabled,
      // Capacidad independiente — ver `RetentionSettings.benefitsEnabled`.
      // Sellos y Beneficios pueden estar prendidos, apagados, o cualquier
      // combinación de los dos al mismo tiempo.
      benefitsEnabled: settings.benefitsEnabled,
      feedbackBonusEnabled: settings.rewardGoalFeedbackBonusEnabled,
      stampsRequired,
      reward: rewardBenefit
        ? { name: rewardBenefit.name, benefitId: rewardBenefit.benefitId }
        : null,
      welcomeGift: welcomeBenefit
        ? { name: welcomeBenefit.title, benefitId: welcomeBenefit.id }
        : null,
      stats: {
        customersParticipating,
        cardsInProgress,
        unlockedTotal,
        redeemedTotal,
      },
      recentActivity,
      benefitsCount,
      // Self-service (plan Free / trial de Beneficios) — `null` en
      // `maxCustomers` significa "sin tope" (Pro, o sin Subscription —
      // LEGACY/Platform Admin/negocios anteriores a esta feature).
      plan: {
        maxCustomers: selfService.maxCustomers,
        benefitsTrialExpired: selfService.benefitsTrialExpired,
        trialEndsAt: selfService.trialEndsAt?.toISOString() ?? null,
        isPro: selfService.isPro,
        planName: selfService.planName,
      },
    };
  }

  /**
   * ON/OFF simple — para cuando YA hay sellos y recompensa configurados
   * (activar de nuevo tras una pausa, o pausar temporalmente). Prender por
   * primera vez sin config previa no pasa por acá: `updateStampsCardConfig`
   * configura Y activa en un solo paso, igual que el onboarding.
   *
   * Apagar SOLO cambia `rewardGoalsEnabled`/`progressReminderEnabled` — no
   * cancela tarjetas en curso ni borra la recompensa configurada, así que
   * volver a activar restaura el mismo programa sin pedir nada de nuevo.
   */
  async setStampsCardEnabled(
    businessId: string,
    dto: SetStampsCardEnabledDto,
    actorUserId?: string,
  ) {
    const current = await this.settings.getOrCreate(businessId);
    if (current.rewardGoalsEnabled === dto.enabled) {
      return this.getOverview(businessId);
    }

    if (dto.enabled) {
      const reward = await this.prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId, active: true, rewardGoalEligible: true },
      });
      if (!reward || !current.rewardGoalMinVisits) {
        throw new BadRequestException(
          'Configurá los sellos y la recompensa antes de activar la tarjeta',
        );
      }
    }

    await this.prisma.retentionSettings.update({
      where: { businessId },
      data: dto.enabled
        ? { rewardGoalsEnabled: true }
        : { rewardGoalsEnabled: false, progressReminderEnabled: false },
    });

    if (dto.enabled) {
      // Cambio de modalidad reversible (Programa → Configuración): un
      // negocio que arrancó "solo Beneficios" y activa sellos más tarde
      // necesita el plan Free (tope de 50 clientes participantes) igual que
      // si lo hubiera elegido en el onboarding. Nunca pisa una Subscription
      // existente (Pro sigue Pro).
      await this.plans.ensureFreeSubscriptionIfMissing(businessId);
      // Si Beneficios ya estaba (o queda) prendido en este momento, esta es
      // la primera vez que el negocio tiene un plan self-service real — el
      // trial de 30 días arranca acá si nunca corrió. Sin esto, un negocio
      // que activa sellos primero y Beneficios ya viene prendido por
      // default tendría Beneficios Pro gratis para siempre.
      if (current.benefitsEnabled) {
        await this.plans.startBenefitsTrialIfNeeded(businessId);
      }
    }

    await this.programAudit.record({
      businessId,
      actorUserId,
      type: dto.enabled ? 'card_activated' : 'card_deactivated',
      message: dto.enabled
        ? 'Activaste la tarjeta de sellos'
        : 'Desactivaste la tarjeta de sellos',
    });

    return this.getOverview(businessId);
  }

  /**
   * Capacidad independiente de sellos: visibilidad pública del catálogo de
   * Beneficios (regalo de bienvenida + beneficio activo del check-in).
   * Apagarla nunca borra el catálogo — solo deja de mostrarlo/entregarlo
   * (ver `BenefitsService#resolveActiveBenefit`/`getWelcomeGiftState`).
   */
  async setBenefitsEnabled(
    businessId: string,
    dto: SetBenefitsEnabledDto,
    actorUserId?: string,
  ) {
    const current = await this.settings.getOrCreate(businessId);
    if (current.benefitsEnabled === dto.enabled) {
      return this.getOverview(businessId);
    }

    await this.prisma.retentionSettings.update({
      where: { businessId },
      data: { benefitsEnabled: dto.enabled },
    });

    if (dto.enabled) {
      // Primera vez que se prende de VERDAD (no el default de schema): esto
      // es lo que arranca el trial de 30 días de Beneficios si nunca corrió,
      // y asegura el plan Free si el negocio todavía no tenía Subscription.
      await this.plans.ensureFreeSubscriptionIfMissing(businessId);
      await this.plans.startBenefitsTrialIfNeeded(businessId);
    }

    await this.programAudit.record({
      businessId,
      actorUserId,
      type: dto.enabled
        ? 'benefits_catalog_activated'
        : 'benefits_catalog_deactivated',
      message: dto.enabled
        ? 'Activaste el catálogo de beneficios'
        : 'Desactivaste el catálogo de beneficios',
    });

    return this.getOverview(businessId);
  }

  /**
   * Configura sellos necesarios + recompensa (+ bonus feedback) y activa la
   * tarjeta si todavía no lo estaba — misma lógica que el paso "Beneficios +
   * sellos" del onboarding (`OnboardingService.saveProgram`), disponible acá
   * para cuando el negocio ya terminó el alta y quiere cambiar la config.
   *
   * Snapshot de historia: esto NUNCA edita el `Benefit`/`RetentionIncentive
   * Definition` que ya está autorizado como recompensa — crea o reusa (por
   * título) uno nuevo y desautoriza el anterior. Los `CustomerRewardGoal` ya
   * activos siguen apuntando por FK a la definición vieja, así que un cliente
   * a mitad de tarjeta nunca ve cambiar su objetivo ni su recompensa.
   */
  async updateStampsCardConfig(
    businessId: string,
    dto: UpdateStampsCardConfigDto,
    actorUserId?: string,
  ) {
    const before = await this.settings.getOrCreate(businessId);
    const wasEnabled = before.rewardGoalsEnabled;

    const rewardBenefitId = await this.resolveRewardBenefit(
      businessId,
      dto.rewardBenefitId,
      dto.rewardTitle,
      (dto.rewardType as BenefitType) ?? BenefitType.gift,
    );
    if (!rewardBenefitId) {
      throw new BadRequestException(
        'Elegí o creá una recompensa para la tarjeta',
      );
    }

    await this.prisma.retentionIncentiveDefinition.updateMany({
      where: { businessId, rewardGoalEligible: true },
      data: { rewardGoalEligible: false },
    });
    await this.benefits.setRetentionBridge(businessId, rewardBenefitId, {
      rewardGoalEligible: true,
    });

    await this.prisma.retentionSettings.update({
      where: { businessId },
      data: {
        rewardGoalsEnabled: true,
        rewardGoalMinVisits: dto.stampsRequired,
        rewardGoalMaxVisits: dto.stampsRequired,
        rewardGoalFeedbackBonusEnabled: dto.feedbackBonusEnabled ?? false,
        progressReminderEnabled: true,
      },
    });

    const reward = await this.prisma.benefit.findUnique({
      where: { id: rewardBenefitId },
      select: { title: true },
    });

    await this.programAudit.record({
      businessId,
      actorUserId,
      type: wasEnabled ? 'card_config_changed' : 'card_activated',
      message: wasEnabled
        ? `Cambiaste la tarjeta a ${dto.stampsRequired} sellos → ${reward?.title ?? 'tu recompensa'}`
        : `Activaste la tarjeta de sellos: ${dto.stampsRequired} sellos → ${reward?.title ?? 'tu recompensa'}`,
      metadata: { stampsRequired: dto.stampsRequired, rewardBenefitId },
    });

    // §9 trigger C — this call always turns `progressReminderEnabled` on
    // (see above), which is exactly the moment "Cerca del premio" needs its
    // own infrastructure to exist. A no-op if it already does. If the
    // business's engine kill switch happens to still be off (e.g. it was
    // never onboarded through the self-service flow, or was explicitly
    // turned off from Notificaciones), this safely reports
    // `skipped_engine_not_ready` rather than throwing — Programa does not
    // flip that switch on this business's behalf.
    await this.retentionBootstrap.ensureDefaultRetentionSetup(businessId);

    return this.getOverview(businessId);
  }

  /** Historial de Programa: eventos auditados + eventos reconstruibles con fecha real. */
  async getHistory(businessId: string) {
    const [audited, unlocked, redeemed, benefitIssued, benefitRedeemed] =
      await Promise.all([
        this.programAudit.list(businessId, HISTORY_LIMIT),
        this.prisma.customerRewardGoal.findMany({
          where: { businessId, unlockedAt: { not: null } },
          orderBy: { unlockedAt: 'desc' },
          take: HISTORY_LIMIT,
          select: {
            id: true,
            unlockedAt: true,
            customer: { select: { name: true } },
            incentiveDefinition: { select: { name: true } },
          },
        }),
        this.prisma.customerRewardGoal.findMany({
          where: { businessId, redeemedAt: { not: null } },
          orderBy: { redeemedAt: 'desc' },
          take: HISTORY_LIMIT,
          select: {
            id: true,
            redeemedAt: true,
            customer: { select: { name: true } },
            incentiveDefinition: { select: { name: true } },
          },
        }),
        this.prisma.benefitParticipation.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_LIMIT,
          select: {
            id: true,
            createdAt: true,
            customer: { select: { name: true } },
            benefitTitleSnapshot: true,
            benefit: { select: { title: true } },
          },
        }),
        this.prisma.benefitParticipation.findMany({
          where: { businessId, redeemedAt: { not: null } },
          orderBy: { redeemedAt: 'desc' },
          take: HISTORY_LIMIT,
          select: {
            id: true,
            redeemedAt: true,
            customer: { select: { name: true } },
            benefitTitleSnapshot: true,
            benefit: { select: { title: true } },
          },
        }),
      ]);

    const items = [
      ...audited.map((e) => ({
        id: `audit-${e.id}`,
        message: e.message,
        occurredAt: e.createdAt.toISOString(),
      })),
      ...unlocked.map((g) => ({
        id: `unlocked-${g.id}`,
        message: `${g.customer?.name ?? 'Un cliente'} completó su tarjeta (${g.incentiveDefinition?.name ?? 'recompensa'})`,
        occurredAt: (g.unlockedAt as Date).toISOString(),
      })),
      ...redeemed.map((g) => ({
        id: `card-redeemed-${g.id}`,
        message: `${g.customer?.name ?? 'Un cliente'} canjeó la recompensa de la tarjeta (${g.incentiveDefinition?.name ?? 'recompensa'})`,
        occurredAt: (g.redeemedAt as Date).toISOString(),
      })),
      // El título mostrado es SIEMPRE el que se prometió en el momento — no
      // el título actual del catálogo, que puede haber cambiado desde
      // entonces (ver `benefitTitleSnapshot` en schema.prisma).
      ...benefitIssued.map((p) => ({
        id: `benefit-issued-${p.id}`,
        message: `${p.customer?.name ?? 'Un cliente'} recibió el beneficio "${p.benefitTitleSnapshot ?? p.benefit.title}"`,
        occurredAt: p.createdAt.toISOString(),
      })),
      ...benefitRedeemed.map((p) => ({
        id: `benefit-redeemed-${p.id}`,
        message: `${p.customer?.name ?? 'Un cliente'} canjeó el beneficio "${p.benefitTitleSnapshot ?? p.benefit.title}"`,
        occurredAt: (p.redeemedAt as Date).toISOString(),
      })),
    ];

    return items
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, HISTORY_LIMIT);
  }

  /**
   * Devuelve el id del beneficio a usar: el existente si se pasó uno, o uno
   * nuevo creado con ese título (reusado por título si ya existe, para que
   * reenviar el mismo formulario no duplique). Espejo de
   * `OnboardingService['resolveBenefit']` — mismo criterio, distinto caller.
   */
  private async resolveRewardBenefit(
    businessId: string,
    benefitId: string | undefined,
    title: string | undefined,
    type: BenefitType,
  ): Promise<string | null> {
    if (benefitId) {
      const existing = await this.prisma.benefit.findFirst({
        where: { id: benefitId, businessId },
        select: { id: true },
      });
      return existing?.id ?? null;
    }
    const name = title?.trim();
    if (!name) return null;

    const sameTitle = await this.prisma.benefit.findFirst({
      where: { businessId, title: name },
      select: { id: true },
    });
    if (sameTitle) return sameTitle.id;

    const created = await this.prisma.benefit.create({
      data: { businessId, title: name, type, active: false },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Actividad del programa únicamente — nunca el timeline completo del
   * cliente. Cuatro fuentes, mezcladas y ordenadas por fecha real.
   */
  private async buildRecentActivity(
    businessId: string,
  ): Promise<LoyaltyProgramActivityItem[]> {
    const take = RECENT_ACTIVITY_LIMIT;

    const [unlocked, redeemed, stamps, feedback] = await Promise.all([
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, unlockedAt: { not: null } },
        orderBy: { unlockedAt: 'desc' },
        take,
        select: {
          id: true,
          unlockedAt: true,
          customer: { select: { name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, redeemedAt: { not: null } },
        orderBy: { redeemedAt: 'desc' },
        take,
        select: {
          id: true,
          redeemedAt: true,
          customer: { select: { name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
      this.prisma.rewardGoalBonusStamp.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.checkinFeedback.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          createdAt: true,
          score: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    const items: LoyaltyProgramActivityItem[] = [
      ...unlocked.map((g) => ({
        id: `unlocked-${g.id}`,
        type: 'unlocked' as const,
        customerName: g.customer?.name ?? null,
        detail: g.incentiveDefinition?.name ?? null,
        occurredAt: (g.unlockedAt as Date).toISOString(),
      })),
      ...redeemed.map((g) => ({
        id: `redeemed-${g.id}`,
        type: 'redeemed' as const,
        customerName: g.customer?.name ?? null,
        detail: g.incentiveDefinition?.name ?? null,
        occurredAt: (g.redeemedAt as Date).toISOString(),
      })),
      ...stamps.map((s) => ({
        id: `stamp-${s.id}`,
        type: 'stamp' as const,
        customerName: s.customer?.name ?? null,
        detail: 'Sello extra por feedback',
        occurredAt: s.createdAt.toISOString(),
      })),
      ...feedback.map((f) => ({
        id: `feedback-${f.id}`,
        type: 'feedback' as const,
        customerName: f.customer?.name ?? null,
        detail: `${f.score} de 5`,
        occurredAt: f.createdAt.toISOString(),
      })),
    ];

    return items
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, RECENT_ACTIVITY_LIMIT);
  }
}
