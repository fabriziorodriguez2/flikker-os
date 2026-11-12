import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessPolicy,
  IntelligencePlanStatus,
  PolicyPauseReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import {
  BALANCED_PRESET,
  POLICY_VERSION,
  SMALL_BUSINESS_CUSTOMER_THRESHOLD,
  configBlockers,
  weeklyRecipientCap,
  type PolicyConfig,
} from './policy-rules';
import {
  heldAmounts,
  incentiveLiabilityThisMonth,
  loadUsage,
  marketingMessagesSentThisMonth,
} from './policy-usage';
import type { PolicyValuesDto } from './dto/policy.dto';

/**
 * Configuración de la política por negocio. Lo que ya vivía en
 * `RetentionSettings` (frecuencia, ventana, tope de incentivos) se lee y se
 * escribe ahí; acá solo lo nuevo. Ningún cambio se aplica solo: aceptar,
 * editar y reanudar son acciones explícitas del dueño, auditadas.
 */
@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(
    businessId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{
    config: PolicyConfig;
    policy: BusinessPolicy | null;
    averageTicketAmount: Prisma.Decimal | null;
  }> {
    const [business, policy, settings] = await Promise.all([
      db.business.findUnique({
        where: { id: businessId },
        select: { currency: true, timezone: true },
      }),
      db.businessPolicy.findUnique({ where: { businessId } }),
      this.settings.getOrCreate(businessId),
    ]);
    if (!business) throw new NotFoundException('Negocio no encontrado');
    const num = (v: Prisma.Decimal | null | undefined) =>
      v === null || v === undefined ? null : Number(v);
    return {
      policy,
      averageTicketAmount: settings.averageTicketAmount,
      config: {
        acceptedAt: policy?.acceptedAt ?? null,
        acceptedVersion: policy?.acceptedVersion ?? null,
        confirmedCurrency: policy?.confirmedCurrency ?? null,
        confirmedTimezone: policy?.confirmedTimezone ?? null,
        businessCurrency: business.currency,
        businessTimezone: business.timezone,
        paused: policy?.paused ?? false,
        pausedReason: policy?.pausedReason ?? null,
        messagingBudgetMonthly: num(policy?.messagingBudgetMonthly),
        incentiveBudgetMonthly: num(settings.maxEstimatedIncentiveCostPerMonth),
        weeklyReachPercent: policy?.weeklyReachPercent ?? null,
        maxNewCampaignsPerWeek: policy?.maxNewCampaignsPerWeek ?? null,
        maxCampaignSharePercent: policy?.maxCampaignSharePercent ?? null,
        minDaysBetweenPromotions: settings.minimumDaysBetweenRetentionMessages,
        maxPromotionsPer30Days: settings.maximumRetentionMessagesPer30Days,
        sendingHourStart: settings.sendingHourStart,
        sendingHourEnd: settings.sendingHourEnd,
        allowedSendingDays: settings.allowedSendingDays,
        messageUnitCost: num(policy?.messageUnitCost),
        messageUnitCostCurrency: policy?.messageUnitCostCurrency ?? null,
      },
    };
  }

  /** ¿Las promociones y Autopilot de este negocio pasan por el motor? */
  async isAccepted(businessId: string): Promise<boolean> {
    const policy = await this.prisma.businessPolicy.findUnique({
      where: { businessId },
      select: { acceptedAt: true },
    });
    return Boolean(policy?.acceptedAt);
  }

  /** Lo que ve la pantalla: configuración, preset, uso y qué falta. */
  async view(businessId: string, now: Date = new Date()) {
    const { config, policy, averageTicketAmount } =
      await this.getConfig(businessId);
    const tz = config.businessTimezone;
    const [sent, liability, held, week, campaigns] = await Promise.all([
      marketingMessagesSentThisMonth(this.prisma, businessId, tz, now),
      incentiveLiabilityThisMonth(this.prisma, {
        businessId,
        timezone: tz,
        now,
        averageTicketAmount,
        includeReactivation: true,
      }),
      heldAmounts(this.prisma, businessId, tz, now),
      loadUsage(this.prisma, {
        businessId,
        timezone: tz,
        now,
        candidates: [],
        messageUnitCost: config.messageUnitCost,
        averageTicketAmount,
      }),
      // Campañas de Intelligence en curso, con su costo estimado.
      this.prisma.intelligencePlan.findMany({
        where: {
          businessId,
          status: {
            in: [
              IntelligencePlanStatus.EXECUTING,
              IntelligencePlanStatus.MEASURING,
            ],
          },
        },
        orderBy: { executedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          executedAt: true,
          estimatedCost: true,
        },
      }),
    ]);
    const { base } = week;
    const weekly = weeklyRecipientCap(config, base);
    // Cómo queda desde el lunes con la base de hoy: si cambia el modo, el
    // dueño lo ve antes de que pase.
    const next = weeklyRecipientCap(config, {
      registered: base.registered,
      contactable: base.contactable,
    });
    const missing: string[] = [];
    if (config.messageUnitCost === null) missing.push('MESSAGE_UNIT_COST');
    if (config.acceptedAt && config.messagingBudgetMonthly === null) {
      missing.push('MESSAGING_BUDGET');
    }
    if (config.acceptedAt && config.incentiveBudgetMonthly === null) {
      missing.push('INCENTIVE_BUDGET');
    }
    return {
      policyVersion: POLICY_VERSION,
      version: policy?.version ?? 0,
      accepted: Boolean(config.acceptedAt),
      acceptedAt: config.acceptedAt,
      acceptedVersion: config.acceptedVersion,
      business: {
        currency: config.businessCurrency,
        timezone: config.businessTimezone,
      },
      confirmed: {
        currency: config.confirmedCurrency,
        timezone: config.confirmedTimezone,
      },
      paused: config.paused,
      pausedReason: config.pausedReason,
      pausedAt: policy?.pausedAt ?? null,
      values: {
        messagingBudgetMonthly: config.messagingBudgetMonthly,
        incentiveBudgetMonthly: config.incentiveBudgetMonthly,
        weeklyReachPercent: config.weeklyReachPercent,
        maxNewCampaignsPerWeek: config.maxNewCampaignsPerWeek,
        minDaysBetweenPromotions: config.minDaysBetweenPromotions,
        maxPromotionsPer30Days: config.maxPromotionsPer30Days,
        sendingHourStart: config.sendingHourStart,
        sendingHourEnd: config.sendingHourEnd,
        maxCampaignSharePercent: config.maxCampaignSharePercent,
      },
      preset: BALANCED_PRESET,
      messageUnitCost: config.messageUnitCost,
      messageUnitCostCurrency: config.messageUnitCostCurrency,
      usage: {
        messagesSentThisMonth: sent,
        messagingSpentThisMonth:
          sent * (config.messageUnitCost ?? 0) + held.messaging,
        incentiveLiabilityThisMonth: liability.cost + held.incentives,
        issuancesWithUnknownCost: liability.unknownCost,
        customersWithWhatsappConsent: base.contactable,
      },
      incentives: {
        budgetSet: config.incentiveBudgetMonthly !== null,
        committed: round2(liability.cost),
        consumed: round2(liability.consumed),
        /** Reservado por campañas que están saliendo ahora. */
        inFlight: round2(held.incentives),
        byIncentive: liability.byIncentive.map((i) => ({
          ...i,
          committedCost: round2(i.committedCost),
          consumedCost: round2(i.consumedCost),
        })),
        campaigns: campaigns.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          executedAt: c.executedAt,
          estimatedCost:
            c.estimatedCost === null ? null : Number(c.estimatedCost),
        })),
      },
      weeklyReach: {
        mode: weekly.mode,
        threshold: SMALL_BUSINESS_CUSTOMER_THRESHOLD,
        registeredCustomers: base.registered,
        contactableCustomers: base.contactable,
        capThisWeek: weekly.cap,
        contactedThisWeek: week.recipientsThisWeek.size,
        registeredAtWeekStart: base.registeredAtWeekStart ?? base.registered,
        /** Solo si la semana que viene cambia el modo (p. ej. de 149 a 150). */
        nextWeek:
          next.mode !== weekly.mode
            ? { mode: next.mode, estimatedCap: next.cap }
            : null,
      },
      blockers: configBlockers(config),
      missing,
    };
  }

  /**
   * Aceptación explícita. El dueño confirma la moneda y la zona horaria que
   * ve (tienen que coincidir con las del negocio) y TODOS los valores: nada
   * queda en un default que no vio.
   */
  async accept(
    businessId: string,
    userId: string,
    dto: PolicyValuesDto & {
      confirmedCurrency: string;
      confirmedTimezone: string;
      policyVersion: number;
    },
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { currency: true, timezone: true },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (dto.policyVersion !== POLICY_VERSION) {
      throw new ConflictException(
        'La política cambió mientras la leías. Recargá la página.',
      );
    }
    if (
      dto.confirmedCurrency !== business.currency ||
      dto.confirmedTimezone !== business.timezone
    ) {
      throw new BadRequestException(
        `La moneda y la zona horaria confirmadas tienen que ser las del negocio (${business.currency}, ${business.timezone}). Si están mal, corregilas primero en la configuración del negocio.`,
      );
    }
    assertWindow(dto.sendingHourStart, dto.sendingHourEnd);

    const before = await this.getConfig(businessId);
    const now = new Date();
    const policy = await this.prisma.$transaction(async (tx) => {
      await this.writeSettings(tx, businessId, dto);
      return tx.businessPolicy.upsert({
        where: { businessId },
        create: {
          businessId,
          ...policyColumns(dto),
          acceptedVersion: POLICY_VERSION,
          acceptedAt: now,
          acceptedByUserId: userId,
          confirmedCurrency: dto.confirmedCurrency,
          confirmedTimezone: dto.confirmedTimezone,
        },
        update: {
          ...policyColumns(dto),
          acceptedVersion: POLICY_VERSION,
          acceptedAt: now,
          acceptedByUserId: userId,
          confirmedCurrency: dto.confirmedCurrency,
          confirmedTimezone: dto.confirmedTimezone,
          version: { increment: 1 },
        },
      });
    });
    await this.audit.log({
      action: 'POLICY_ACCEPTED',
      entityType: 'BusinessPolicy',
      entityId: policy.id,
      userId,
      businessId,
      metadata: {
        policyVersion: POLICY_VERSION,
        currency: dto.confirmedCurrency,
        timezone: dto.confirmedTimezone,
        values: valuesOf(dto),
        previous: before.config.acceptedAt ? valuesOf(before.config) : null,
      },
    });
    return this.view(businessId);
  }

  /** Edición de una política ya aceptada. `expectedVersion` evita pisar a otro. */
  async update(
    businessId: string,
    userId: string,
    dto: PolicyValuesDto & { expectedVersion: number },
  ) {
    const current = await this.prisma.businessPolicy.findUnique({
      where: { businessId },
    });
    if (!current?.acceptedAt) {
      throw new BadRequestException('Primero tenés que aceptar la política.');
    }
    assertWindow(dto.sendingHourStart, dto.sendingHourEnd);
    const before = await this.getConfig(businessId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.businessPolicy.updateMany({
        where: { businessId, version: dto.expectedVersion },
        data: { ...policyColumns(dto), version: { increment: 1 } },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Alguien cambió la política mientras la editabas. Recargá para ver la versión actual.',
        );
      }
      await this.writeSettings(tx, businessId, dto);
      return tx.businessPolicy.findUniqueOrThrow({ where: { businessId } });
    });
    await this.audit.log({
      action: 'POLICY_UPDATED',
      entityType: 'BusinessPolicy',
      entityId: updated.id,
      userId,
      businessId,
      metadata: { before: valuesOf(before.config), after: valuesOf(dto) },
    });
    return this.view(businessId);
  }

  /** Kill switch. Idempotente: pausar algo pausado no cambia el motivo. */
  async pause(
    businessId: string,
    userId: string | null,
    reason: PolicyPauseReason,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const policy = await this.ensureRow(businessId);
    const claim = await this.prisma.businessPolicy.updateMany({
      where: { businessId, paused: false },
      data: {
        paused: true,
        pausedReason: reason,
        pausedAt: new Date(),
        pausedByUserId: userId,
        version: { increment: 1 },
      },
    });
    if (claim.count === 0) return false;
    await this.audit.log({
      action: 'POLICY_PAUSED',
      entityType: 'BusinessPolicy',
      entityId: policy.id,
      userId,
      businessId,
      metadata: { reason, ...metadata },
    });
    return true;
  }

  async resume(businessId: string, userId: string) {
    const policy = await this.ensureRow(businessId);
    const claim = await this.prisma.businessPolicy.updateMany({
      where: { businessId, paused: true },
      data: {
        paused: false,
        pausedReason: null,
        pausedAt: null,
        pausedByUserId: null,
        version: { increment: 1 },
      },
    });
    if (claim.count > 0) {
      await this.audit.log({
        action: 'POLICY_RESUMED',
        entityType: 'BusinessPolicy',
        entityId: policy.id,
        userId,
        businessId,
        metadata: { previousReason: policy.pausedReason },
      });
    }
    return this.view(businessId);
  }

  /** Platform Admin: el costo por mensaje que el proveedor no informa. */
  async setMessageUnitCost(
    businessId: string,
    adminUserId: string,
    unitCost: number | null,
    currency: string | null,
  ) {
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      throw new BadRequestException('El costo por mensaje no es válido.');
    }
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { currency: true },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (unitCost !== null && currency !== business.currency) {
      throw new BadRequestException(
        `El costo tiene que estar en la moneda del negocio (${business.currency}).`,
      );
    }
    const before = await this.ensureRow(businessId);
    const policy = await this.prisma.businessPolicy.update({
      where: { businessId },
      data: {
        messageUnitCost: unitCost,
        messageUnitCostCurrency: unitCost === null ? null : currency,
        messageUnitCostSetAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.audit.log({
      action: 'POLICY_MESSAGE_COST_SET',
      entityType: 'BusinessPolicy',
      entityId: policy.id,
      userId: adminUserId,
      businessId,
      metadata: {
        before: before.messageUnitCost ? Number(before.messageUnitCost) : null,
        after: unitCost,
        currency,
      },
    });
    return {
      businessId,
      messageUnitCost: unitCost,
      messageUnitCostCurrency: policy.messageUnitCostCurrency,
    };
  }

  /** La fila vacía no gobierna nada (sin `acceptedAt`); solo guarda estado. */
  private async ensureRow(businessId: string): Promise<BusinessPolicy> {
    try {
      return await this.prisma.businessPolicy.upsert({
        where: { businessId },
        create: { businessId },
        update: {},
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.businessPolicy.findUniqueOrThrow({
          where: { businessId },
        });
      }
      throw error;
    }
  }

  private async writeSettings(
    tx: Prisma.TransactionClient,
    businessId: string,
    dto: PolicyValuesDto,
  ) {
    await this.settings.getOrCreate(businessId);
    await tx.retentionSettings.update({
      where: { businessId },
      data: {
        maxEstimatedIncentiveCostPerMonth: dto.incentiveBudgetMonthly,
        minimumDaysBetweenRetentionMessages: dto.minDaysBetweenPromotions,
        maximumRetentionMessagesPer30Days: dto.maxPromotionsPer30Days,
        sendingHourStart: dto.sendingHourStart,
        sendingHourEnd: dto.sendingHourEnd,
      },
    });
  }
}

function assertWindow(start: number, end: number) {
  if (start >= end) {
    throw new BadRequestException(
      'La hora de inicio de envíos tiene que ser anterior a la de fin.',
    );
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function policyColumns(dto: PolicyValuesDto) {
  return {
    messagingBudgetMonthly: dto.messagingBudgetMonthly,
    weeklyReachPercent: dto.weeklyReachPercent,
    maxNewCampaignsPerWeek: dto.maxNewCampaignsPerWeek,
    maxCampaignSharePercent: dto.maxCampaignSharePercent,
  };
}

function valuesOf(v: {
  messagingBudgetMonthly: number | null;
  incentiveBudgetMonthly: number | null;
  weeklyReachPercent: number | null;
  maxNewCampaignsPerWeek: number | null;
  maxCampaignSharePercent: number | null;
  minDaysBetweenPromotions: number;
  maxPromotionsPer30Days: number;
  sendingHourStart: number;
  sendingHourEnd: number;
}) {
  return {
    messagingBudgetMonthly: v.messagingBudgetMonthly,
    incentiveBudgetMonthly: v.incentiveBudgetMonthly,
    weeklyReachPercent: v.weeklyReachPercent,
    maxNewCampaignsPerWeek: v.maxNewCampaignsPerWeek,
    maxCampaignSharePercent: v.maxCampaignSharePercent,
    minDaysBetweenPromotions: v.minDaysBetweenPromotions,
    maxPromotionsPer30Days: v.maxPromotionsPer30Days,
    sendingHourStart: v.sendingHourStart,
    sendingHourEnd: v.sendingHourEnd,
  };
}
