import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Benefit, BenefitType } from '@prisma/client';
import {
  BenefitsRepository,
  type BenefitData,
  type RetentionBridgeSnapshot,
} from './benefits.repository';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { PlansService } from '../plans/plans.service';
import { CreateBenefitDto } from './dto/create-benefit.dto';
import { UpdateBenefitDto } from './dto/update-benefit.dto';
import { UpdateBenefitRetentionBridgeDto } from './dto/update-benefit-retention-bridge.dto';

export interface LastDrawView {
  winnerName: string | null;
  winnerPhone: string | null;
  participantsCount: number;
  periodKey: string;
  drawnAt: Date;
}

export interface RetentionBridgeView {
  recoveryEnabled: boolean;
  rewardGoalEnabled: boolean;
  /**
   * True once the linked incentive has a percentage, fixed, or estimated
   * cost value — i.e. enabling "recuperación" would not need to ask for one.
   * False (including when there is no bridge yet) means the owner will be
   * asked for `estimatedCost` before recovery can be turned on.
   */
  hasKnownValue: boolean;
}

/** Piloto V2 — deny-by-default view for a Benefit with no bridge yet (legacy or brand new). */
const EMPTY_BRIDGE: RetentionBridgeView = {
  recoveryEnabled: false,
  rewardGoalEnabled: false,
  hasKnownValue: false,
};

function toBridgeView(
  definition: RetentionBridgeSnapshot | null | undefined,
): RetentionBridgeView {
  if (!definition) return EMPTY_BRIDGE;
  return {
    recoveryEnabled: definition.automationEligible,
    rewardGoalEnabled: definition.rewardGoalEligible,
    hasKnownValue:
      definition.percentageValue != null ||
      definition.fixedValue != null ||
      definition.estimatedCost != null,
  };
}

@Injectable()
export class BenefitsService {
  constructor(
    private readonly repository: BenefitsRepository,
    private readonly programAudit: ProgramAuditService,
    private readonly retentionSettings: RetentionSettingsService,
    private readonly retentionBootstrap: RetentionV2BootstrapService,
    private readonly plans: PlansService,
  ) {}

  async list(businessId: string) {
    const benefits = await this.repository.findMany(businessId);
    return this.attachLastDraws(this.attachRetentionBridge(benefits));
  }

  getActive(businessId: string) {
    return this.repository.findActive(businessId);
  }

  async getOne(businessId: string, id: string) {
    const benefit = await this.repository.findOne(businessId, id);
    if (!benefit) throw new NotFoundException('Benefit not found');
    const [withBridge] = this.attachRetentionBridge([benefit]);
    const [withDraw] = await this.attachLastDraws([withBridge]);
    return withDraw;
  }

  /**
   * Piloto V2 — the single write path for "Usar para recuperar clientes" /
   * "Usar como recompensa por visitas" on a Benefit card. /dashboard/
   * beneficios is the only caller: Retention V2's own UI only ever lists and
   * authorizes what already exists (never creates).
   *
   * Ajuste #2 (pre-piloto) — REVERTIDO: hasta esta tanda, activar
   * "recuperación" sin ningún `percentageValue`/`fixedValue`/`estimatedCost`
   * conocido lanzaba `NEEDS_ESTIMATED_COST`. Pedido explícito: el costo NUNCA
   * es requisito para autorizar un beneficio — solo importa para estimar
   * economía (y, si el dueño más adelante quiere presupuestar por MONTO en
   * vez de por cantidad, ahí sí necesita configurarlo). Ver el mismo cambio,
   * misma razón, en `RetentionIncentivesService.validateConfiguration`.
   */
  async setRetentionBridge(
    businessId: string,
    benefitId: string,
    dto: UpdateBenefitRetentionBridgeDto,
    actorUserId?: string,
  ): Promise<RetentionBridgeView> {
    const current = await this.repository.findRetentionBridge(
      businessId,
      benefitId,
    );
    if (!current) throw new NotFoundException('Benefit not found');

    // Historial — solo se registran las transiciones REALES (patch trae el
    // campo Y cambia respecto al estado anterior), nunca un patch que
    // reafirma lo que ya estaba.
    const wasAutomationEligible =
      current.retentionIncentiveDefinition?.automationEligible ?? false;

    // Autorizar un beneficio para reactivación es una acción Pro de
    // Beneficios (automatización real, no la recompensa básica de sellos):
    // mismo guard centralizado que bloquea crear beneficios nuevos una vez
    // vencido el trial. Nunca gatea `rewardGoalEnabled` (sellos) — eso es
    // Free y queda sin tocar, sellos y Beneficios son independientes.
    if (dto.recoveryEnabled === true && !wasAutomationEligible) {
      await this.plans.assertBenefitsProActionAllowed(businessId);
    }

    // Mismo guardrail que Notificaciones (§12: "centralizar la operación en
    // backend" — no dos caminos con distinta semántica). Programa no tiene
    // un input de límite propio (vive en Notificaciones — §4), así que acá
    // solo puede fallar pidiendo que se configure ahí; nunca autoriza un
    // beneficio que después no puede emitirse.
    if (dto.recoveryEnabled === true && !wasAutomationEligible) {
      await this.retentionSettings.assertBudgetReadyToAuthorize(businessId);
    }

    const updated = await this.repository.setRetentionBridge(
      businessId,
      benefitId,
      {
        automationEligible: dto.recoveryEnabled,
        rewardGoalEligible: dto.rewardGoalEnabled,
        estimatedCost: dto.estimatedCost,
      },
    );

    if (
      dto.recoveryEnabled !== undefined &&
      dto.recoveryEnabled !== wasAutomationEligible
    ) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: dto.recoveryEnabled
          ? 'benefit_reactivation_authorized'
          : 'benefit_reactivation_revoked',
        message: dto.recoveryEnabled
          ? `Autorizaste "${current.title}" para reactivación`
          : `Revocaste "${current.title}" de reactivación`,
        metadata: { benefitId },
      });
    }

    const wasRewardGoalEligible =
      current.retentionIncentiveDefinition?.rewardGoalEligible ?? false;
    if (dto.rewardGoalEnabled === true && !wasRewardGoalEligible) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: 'card_config_changed',
        message: `Cambiaste la recompensa de la tarjeta a "${current.title}"`,
        metadata: { benefitId },
      });
    }

    // §12 — Programa autoriza para reactivación exactamente igual que
    // Notificaciones, así que también dispara el mismo bootstrap: la nueva
    // generación con (o sin) este beneficio se arma acá, no solo cuando el
    // dueño pasa por Notificaciones. No-op si la forma deseada no cambió.
    if (
      dto.recoveryEnabled !== undefined &&
      dto.recoveryEnabled !== wasAutomationEligible
    ) {
      await this.retentionBootstrap.ensureDefaultRetentionSetup(businessId);
    }

    return toBridgeView(updated);
  }

  async create(
    businessId: string,
    dto: CreateBenefitDto,
    actorUserId?: string,
  ) {
    // Self-service Beneficios (prueba 30 días): al vencer, el catálogo
    // existente sigue intacto y visible — lo único que se bloquea es crear
    // beneficios NUEVOS. Guard centralizado en `PlansService` (mismo que
    // usa `setRetentionBridge` para reactivación) — un solo lugar decide
    // qué es una "acción Pro de Beneficios". Sin Subscription (LEGACY,
    // Platform Admin, cualquier negocio anterior a esta feature) esto
    // nunca se activa.
    await this.plans.assertBenefitsProActionAllowed(businessId);

    const dates = this.resolveDates(dto.startDate, dto.endDate);
    const created = await this.repository.create(businessId, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      terms: dto.terms,
      recurrence: dto.recurrence,
      active: dto.active ?? false,
      ...dates,
    });
    await this.programAudit.record({
      businessId,
      actorUserId,
      type: 'benefit_created',
      message: `Creaste el beneficio "${created.title}"`,
      metadata: { benefitId: created.id },
    });
    return created;
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateBenefitDto,
    actorUserId?: string,
  ) {
    // Regla de producto: "no cambiar una promesa que ya tiene un cliente".
    // Bloquear el rename/retipado NO es por `rewardGoalEligible` (eso es
    // demasiado amplio: un beneficio recién autorizado como recompensa, sin
    // ningún cliente todavía juntando sellos para él, no le rompe nada a
    // nadie) — es por si existe al menos un `CustomerRewardGoal` VIVO
    // (ACTIVE o UNLOCKED) que promete ESTA definición ahora mismo. Un
    // REDEEMED/EXPIRED/CANCELLED viejo no bloquea: ya no hay ninguna promesa
    // pendiente colgando de él, y el catálogo tiene que poder seguir
    // evolucionando.
    //
    // El historial de esos clientes viejos queda a salvo de todas formas:
    // `RetentionIncentiveDefinition.name` se fija al autorizar y nunca sigue
    // un rename posterior del Benefit (`BenefitsRepository.createBridge
    // Definition` solo hace `create`), y cada `BenefitParticipation` guarda
    // su propio `benefitTitleSnapshot` — ninguna de las dos lecturas
    // históricas depende del título ACTUAL del Benefit.
    if (dto.title !== undefined || dto.type !== undefined) {
      const current = await this.repository.findRetentionBridge(businessId, id);
      const definitionId = current?.retentionIncentiveDefinition?.id;
      if (definitionId) {
        const liveGoals = await this.repository.countLiveGoalsForDefinition(
          businessId,
          definitionId,
        );
        if (liveGoals > 0) {
          throw new BadRequestException(
            'Hay clientes con una tarjeta en curso o una recompensa lista para retirar que promete este beneficio. Creá uno nuevo y asignalo desde Sellos en vez de editar este.',
          );
        }
      }
    }

    const data: Partial<BenefitData> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.recurrence !== undefined) data.recurrence = dto.recurrence;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      Object.assign(data, this.resolveDates(dto.startDate, dto.endDate));
    }

    const updated = await this.repository.update(businessId, id, data);
    if (!updated) throw new NotFoundException('Benefit not found');
    await this.programAudit.record({
      businessId,
      actorUserId,
      type: 'benefit_edited',
      message: `Editaste el beneficio "${updated.title}"`,
      metadata: { benefitId: updated.id },
    });
    return updated;
  }

  async activate(businessId: string, id: string) {
    const updated = await this.repository.setActive(businessId, id, true);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async deactivate(businessId: string, id: string) {
    const updated = await this.repository.setActive(businessId, id, false);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async remove(businessId: string, id: string) {
    const removed = await this.repository.remove(businessId, id);
    if (!removed) throw new NotFoundException('Benefit not found');
    return { ok: true };
  }

  async getParticipants(businessId: string, id: string) {
    // Ensure the benefit belongs to the tenant before listing participants.
    await this.getOne(businessId, id);
    return this.repository.findParticipants(businessId, id);
  }

  /**
   * Returns the business's active benefit, but only when it is currently valid:
   * type is not `none` and (if set) the current date is within its window.
   * Returns null otherwise so callers fall back to the legacy offer text.
   * Shared by the legacy QR capture flow and the new check-in flow.
   *
   * `customerId` (opcional) es lo que hace posible "no mostrar/emitir NUEVOS
   * beneficios directos, pero los ya emitidos siguen siendo canjeables": con
   * el trial de Beneficios vencido y sin Pro, un cliente que YA tiene una
   * `BenefitParticipation` para este beneficio (un código ya entregado) lo
   * sigue viendo y puede canjearlo — el resto (sin `customerId`, o con uno
   * que nunca recibió nada de este beneficio) no ve una oferta nueva.
   *
   * `plans.isBenefitsBlocked` es siempre `false` para LEGACY/Platform
   * Admin/self-service que nunca activó el trial (`Business.
   * benefitsTrialStartedAt` nunca se pobló) — este gate es puramente
   * aditivo para ellos, cero cambio de comportamiento; por eso es seguro
   * que la función siga siendo la MISMA que usa el flujo LEGACY.
   */
  async resolveActiveBenefit(
    businessId: string,
    now: Date = new Date(),
    customerId?: string,
  ): Promise<Benefit | null> {
    // Capacidad independiente de sellos (Programa → Configuración). Apagada
    // = no se muestra/entrega públicamente, pero el catálogo y su historial
    // siguen intactos — nada se borra. Default `true`, así que esto es
    // puramente aditivo para todo negocio que nunca tocó el toggle nuevo.
    const settings = await this.retentionSettings.getOrCreate(businessId);
    if (!settings.benefitsEnabled) return null;

    const benefit = await this.repository.findActive(businessId);
    if (!benefit) return null;
    if (benefit.type === BenefitType.none) return null;
    if (benefit.startDate && benefit.startDate > now) return null;
    if (benefit.endDate && benefit.endDate < now) return null;

    if (await this.plans.isBenefitsBlocked(businessId)) {
      if (!customerId) return null;
      const existing = await this.repository.findRedemption(
        businessId,
        benefit.id,
        customerId,
      );
      if (!existing) return null;
    }

    return benefit;
  }

  /** A benefit that can be redeemed at the counter (has a code): not raffle/none. */
  isRedeemable(type: BenefitType): boolean {
    return type !== BenefitType.none && type !== BenefitType.raffle;
  }

  /**
   * Elige (o limpia, con `null`) el regalo de bienvenida del negocio. No
   * toca `Benefit.active`: un beneficio puede ser el regalo de bienvenida
   * sin ser el beneficio visible del check-in, y viceversa.
   */
  async setWelcomeGift(businessId: string, benefitId: string | null) {
    if (benefitId) {
      const benefit = await this.repository.findOne(businessId, benefitId);
      if (!benefit) throw new NotFoundException('Benefit not found');
      if (!this.isRedeemable(benefit.type)) {
        throw new BadRequestException(
          'Ese tipo de beneficio no se puede entregar como regalo de bienvenida',
        );
      }
    }
    return this.repository.setWelcomeBenefit(businessId, benefitId);
  }

  /**
   * Regalo de bienvenida — se entrega UNA sola vez, en el primer registro.
   *
   * Deliberadamente separado de `resolveActiveBenefit`/`Benefit.active`:
   * `active` significa "beneficio visible en el check-in" y se re-asegura en
   * cada visita, así que no puede representar "una sola vez, la primera vez".
   * La fuente de verdad es `Business.welcomeBenefitId`.
   *
   * Idempotente por construcción: la unicidad de
   * `BenefitParticipation(benefitId, customerId)` hace que un segundo intento
   * (reintento, doble submit, refresh) devuelva el mismo código en vez de
   * emitir otro. Nunca se llama desde `checkin()`, solo desde el registro.
   */
  async grantWelcomeGift(
    businessId: string,
    customerId: string,
    now: Date = new Date(),
  ): Promise<{ benefitId: string; code: string | null } | null> {
    // Mismo toggle que `resolveActiveBenefit`: apagado el catálogo de
    // Beneficios, tampoco se entrega el regalo de bienvenida — pero
    // `Business.welcomeBenefitId` no se toca, así que reactivar lo restaura.
    const settings = await this.retentionSettings.getOrCreate(businessId);
    if (!settings.benefitsEnabled) return null;

    // "No entregar nuevo regalo de bienvenida" con el trial vencido y sin
    // Pro — esto solo se llama UNA vez, en el registro, así que bloquear la
    // función entera nunca afecta a un regalo que un cliente YA recibió (su
    // canje sigue funcionando vía `getWelcomeGiftState`/`findRedemption`,
    // que no pasan por este guard).
    if (await this.plans.isBenefitsBlocked(businessId)) return null;

    const business = await this.repository.findWelcomeBenefit(businessId);
    const benefit = business?.welcomeBenefit;
    if (!benefit) return null;
    // `active` NO se chequea a propósito: significa "beneficio visible en el
    // check-in", que es otro concepto. Quien gobierna la bienvenida es
    // `Business.welcomeBenefitId`; para dejar de entregarla se limpia ese
    // campo, no se desactiva el beneficio. (Chequear `active` acá volvía a
    // acoplar las dos cosas — lo detectó el test e2e del onboarding, que
    // crea el beneficio de bienvenida con `active: false`.)
    if (!this.isRedeemable(benefit.type)) return null;
    if (benefit.startDate && benefit.startDate > now) return null;
    if (benefit.endDate && benefit.endDate < now) return null;

    const participation = await this.repository.ensureRedemptionCode(
      businessId,
      benefit.id,
      customerId,
    );
    return {
      benefitId: benefit.id,
      code: participation?.redemptionCode ?? null,
    };
  }

  /**
   * Estado del regalo de bienvenida para mostrar. Desaparece una vez
   * canjeado — no vuelve a ofrecerse en visitas posteriores.
   */
  async getWelcomeGiftState(businessId: string, customerId: string) {
    const settings = await this.retentionSettings.getOrCreate(businessId);
    if (!settings.benefitsEnabled) return null;

    const business = await this.repository.findWelcomeBenefit(businessId);
    const benefit = business?.welcomeBenefit;
    if (!benefit) return null;

    const participation = await this.repository.findRedemption(
      businessId,
      benefit.id,
      customerId,
    );
    // Sin participación = nunca se le otorgó (cliente anterior a que el
    // negocio configurara la bienvenida). Canjeado = ya lo usó.
    if (!participation?.redemptionCode || participation.redeemedAt) return null;

    return {
      title: benefit.title,
      description: benefit.description,
      type: benefit.type,
      code: participation.redemptionCode,
    };
  }

  /** Ensures the customer holds a redemption code for the benefit. */
  ensureRedemptionCode(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
    );
  }

  /** Reads the customer's redemption state for a benefit (code + redeemed). */
  findRedemption(businessId: string, benefitId: string, customerId: string) {
    return this.repository.findRedemption(businessId, benefitId, customerId);
  }

  /**
   * Records that a customer opts into a benefit (e.g. a raffle entry).
   * Used by the public QR flow; kept here so tenancy stays server-side.
   */
  registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.repository.registerParticipation(
      businessId,
      benefitId,
      customerId,
    );
  }

  private resolveDates(
    startRaw?: string,
    endRaw?: string,
  ): Pick<BenefitData, 'startDate' | 'endDate'> {
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;

    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is invalid');
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is invalid');
    }
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }

    return { startDate, endDate };
  }

  /**
   * Replaces the raw `retentionIncentiveDefinition` relation (only present
   * because the repository includes it) with the small derived view the
   * frontend actually needs. Legacy benefits with no bridge yet get
   * `EMPTY_BRIDGE` — deny-by-default, satisfied by construction.
   */
  private attachRetentionBridge<
    T extends {
      retentionIncentiveDefinition?: RetentionBridgeSnapshot | null;
    },
  >(
    benefits: T[],
  ): (Omit<T, 'retentionIncentiveDefinition'> & {
    retentionBridge: RetentionBridgeView;
  })[] {
    return benefits.map(({ retentionIncentiveDefinition, ...rest }) => ({
      ...rest,
      retentionBridge: toBridgeView(retentionIncentiveDefinition),
    }));
  }

  /** Attaches `lastDraw` to raffle-type benefits; other types get `lastDraw: null`. */
  private async attachLastDraws<T extends { id: string; type: BenefitType }>(
    benefits: T[],
  ): Promise<(T & { lastDraw: LastDrawView | null })[]> {
    return Promise.all(
      benefits.map(async (benefit) => {
        if (benefit.type !== BenefitType.raffle) {
          return { ...benefit, lastDraw: null };
        }
        const draw = await this.repository.findLatestDraw(benefit.id);
        return {
          ...benefit,
          lastDraw: draw
            ? {
                winnerName: draw.winner?.name ?? null,
                winnerPhone: draw.winner?.phoneE164 ?? null,
                participantsCount: draw.participantsCount,
                periodKey: draw.periodKey,
                drawnAt: draw.drawnAt,
              }
            : null,
        };
      }),
    );
  }
}
