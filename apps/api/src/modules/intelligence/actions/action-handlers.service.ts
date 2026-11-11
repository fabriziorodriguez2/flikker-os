import { HttpException, Injectable } from '@nestjs/common';
import {
  BenefitType,
  CampaignChannel,
  MembershipRole,
  CampaignStatus,
  DestinationType,
  IntelligenceActionKind,
  MissionPeriodPreset,
  MissionStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { BenefitsService } from '../../benefits/benefits.service';
import { MissionService } from '../../missions/mission.service';
import { canTransition } from '../../missions/mission-rules';
import { LoyaltyProgramService } from '../../reward-goals/loyalty-program.service';
import { NotificationsPromotionsService } from '../../notifications/notifications-promotions.service';
import {
  zonedMidnightToUtc,
  localParts,
} from '../../../jobs/owner-lifecycle-time';
import { parseDay } from '../reports/report-math';
import {
  ACTION_MODE,
  AUDIENCE_LABELS,
  computeDataVersion,
  type ActionParams,
  type SegmentAudience,
} from './action-plan';
import { PolicyGateService } from '../../policy/policy-gate.service';
import { benefitIncentive } from '../../policy/policy-usage';
import type { PolicyEffect } from '../../policy/policy-rules';

/**
 * Lo que muestra la tarjeta antes de confirmar. Todo calculado por el
 * servidor con los datos de ahora; el modelo no escribe nada de esto.
 */
export interface ActionImpact {
  summary: string;
  before: { label: string; value: string }[];
  after: { label: string; value: string }[];
  recipients: { count: number | null; description: string };
  effectiveAt: string | null;
  channel: string;
  maxCost: string;
  risks: string[];
  undo: string;
}

export interface PreparedAction {
  title: string;
  impact: ActionImpact;
  /** null en borradores y simulaciones: no hay nada que pueda quedar viejo. */
  dataVersion: string | null;
  /** Qué toca (para caducar propuestas anteriores sobre lo mismo). */
  target: string;
}

export interface ActionContext {
  businessId: string;
  userId: string;
  /** Rol del que pide, resuelto por el backend (membership), nunca del modelo. */
  role: MembershipRole;
  now: Date;
}

/** Una regla de negocio dice que no. El mensaje es para el dueño. */
export class ActionRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NO_RECIPIENTS = {
  count: 0,
  description: 'Nadie: no se contacta a ningún cliente.',
};
const NO_CHANNEL = 'Ninguno: no se envía ningún mensaje.';
const NO_COST = 'Sin costo.';

const CHANNEL_LABELS: Partial<Record<CampaignChannel, string>> = {
  QR_COUNTER: 'QR en el mostrador',
  QR_TABLE: 'QR en las mesas',
  QR_CHECKOUT: 'QR en la caja',
  QR_PACKAGING: 'QR en el packaging',
  SOCIAL_BIO: 'Link en redes',
  WEBSITE: 'Link en la web',
  IN_PERSON: 'En persona',
  EVENT: 'Evento',
  OTHER: 'Otro',
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  COMPLETED: 'Terminada',
  ARCHIVED: 'Archivada',
};

const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  ENDED: 'Terminada',
};

function day(date: Date | null, timezone: string): string {
  if (!date) return 'Sin fecha';
  const p = localParts(date, timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'campana'}-${randomBytes(3).toString('hex')}`;
}

/**
 * Cada operación del agente, sobre los servicios de dominio de siempre:
 * `prepare` valida y calcula el impacto sin escribir; `execute` escribe. Las
 * dos reciben el negocio del servidor, nunca del modelo.
 */
@Injectable()
export class ActionHandlersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly benefits: BenefitsService,
    private readonly missions: MissionService,
    private readonly loyalty: LoyaltyProgramService,
    private readonly promotions: NotificationsPromotionsService,
    private readonly policyGate: PolicyGateService,
  ) {}

  async prepare(
    kind: IntelligenceActionKind,
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    try {
      await this.assertPolicy(kind, ctx, params);
      return await this.plan(kind, ctx, params);
    } catch (error) {
      throw toRejection(error);
    }
  }

  /**
   * Motor de políticas para los cambios con impacto (modo B). Corre al
   * proponer, al confirmar (que vuelve a preparar) y otra vez al ejecutar:
   * ni una tool call armada a mano ni una confirmación vieja lo saltean.
   * Frenar algo (pausar) nunca se bloquea: no cuesta plata.
   */
  private async assertPolicy(
    kind: IntelligenceActionKind,
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<void> {
    if (ACTION_MODE[kind] !== 'CONFIRM') return;
    if (kind === 'PAUSE_CAMPAIGN') return;
    if (kind === 'SET_MISSION_STATUS' && params.status === 'PAUSED') return;

    const incentive = await this.programIncentive(kind, ctx, params);
    const effect: PolicyEffect = {
      source: 'INTELLIGENCE',
      actorRole: ctx.role,
      kind: 'PROGRAM',
      createsCampaign: false,
      candidateCustomerIds: [],
      incentive,
    };
    const { decision } = await this.policyGate.evaluate({
      businessId: ctx.businessId,
      effect,
      now: ctx.now,
    });
    if (!decision.allowed) {
      const first = decision.blockers[0];
      throw new ActionRejectedError(
        `POLICY_${first.code}`,
        [...new Set(decision.blockers.map((b) => b.message))].join(' '),
      );
    }
  }

  /** El premio que entrega el cambio, con su costo estimado (o null si no hay premio). */
  private async programIncentive(
    kind: IntelligenceActionKind,
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PolicyEffect['incentive']> {
    let benefitId: string | null = null;
    if (kind === 'ACTIVATE_BENEFIT') benefitId = params.benefitId as string;
    if (kind === 'UPDATE_STAMPS_CARD') {
      benefitId = (await this.stampsCardState(ctx.businessId)).rewardBenefitId;
    }
    if (kind === 'SET_MISSION_STATUS') {
      const mission = await this.prisma.mission.findFirst({
        where: { id: params.missionId as string, businessId: ctx.businessId },
        select: { rewardBenefitId: true },
      });
      benefitId = mission?.rewardBenefitId ?? null;
    }
    if (!benefitId) return null;
    const settings = await this.prisma.retentionSettings.findUnique({
      where: { businessId: ctx.businessId },
      select: { averageTicketAmount: true },
    });
    const resolved = await benefitIncentive(
      this.prisma,
      ctx.businessId,
      benefitId,
      settings?.averageTicketAmount ?? null,
    );
    // Beneficio inexistente: lo rechaza el paso siguiente con su 404 propio.
    return resolved ? resolved.incentive : null;
  }

  private plan(
    kind: IntelligenceActionKind,
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    switch (kind) {
      case 'CREATE_SEGMENT':
        return this.prepareSegment(ctx, params);
      case 'CREATE_CAMPAIGN_DRAFT':
        return this.prepareCampaignDraft(ctx, params);
      case 'UPDATE_CAMPAIGN_DRAFT':
        return this.prepareCampaignDraftUpdate(ctx, params);
      case 'CREATE_REWARD_DRAFT':
        return this.prepareRewardDraft(params);
      case 'CREATE_MISSION_DRAFT':
        return this.prepareMissionDraft(ctx, params);
      case 'SCHEDULE_CAMPAIGN':
        return this.prepareSchedule(ctx, params);
      case 'PAUSE_CAMPAIGN':
        return this.preparePause(ctx, params);
      case 'UPDATE_STAMPS_CARD':
        return this.prepareStampsCard(ctx, params);
      case 'ACTIVATE_BENEFIT':
        return this.prepareActivateBenefit(ctx, params);
      case 'SET_MISSION_STATUS':
        return this.prepareMissionStatus(ctx, params);
      case 'SEND_PROMOTION':
        return this.preparePromotion(ctx, params);
    }
  }

  async execute(
    kind: IntelligenceActionKind,
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<Record<string, unknown>> {
    try {
      await this.assertPolicy(kind, ctx, params);
      return await this.run(kind, ctx, params);
    } catch (error) {
      throw toRejection(error);
    }
  }

  private async run(
    kind: IntelligenceActionKind,
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<Record<string, unknown>> {
    const { businessId, userId } = ctx;
    switch (kind) {
      case 'CREATE_SEGMENT': {
        const audience = params.audience as SegmentAudience;
        const { recipientCount } = await this.promotions.preview(
          businessId,
          audience,
        );
        return { audience, label: AUDIENCE_LABELS[audience], recipientCount };
      }
      case 'CREATE_CAMPAIGN_DRAFT': {
        const destinationUrl = await this.googleReviewUrl(
          businessId,
          params.destination as string,
        );
        const created = await this.campaigns.create(
          businessId,
          {
            name: params.name as string,
            slug: slugify(params.name as string),
            channel: params.channel as CampaignChannel,
            destinationType: params.destination as DestinationType,
            ...(destinationUrl ? { destinationUrl } : {}),
            ...(params.description
              ? { description: params.description as string }
              : {}),
            enableLanding: params.destination === 'LANDING_ONLY',
          },
          userId,
        );
        return {
          campaignId: created.id,
          name: created.name,
          status: created.status,
        };
      }
      case 'UPDATE_CAMPAIGN_DRAFT': {
        // Revalida al ejecutar: el borrador pudo dejar de serlo.
        await this.requireDraftCampaign(
          businessId,
          params.campaignId as string,
        );
        const updated = await this.campaigns.update(
          businessId,
          params.campaignId as string,
          {
            ...(params.name !== null ? { name: params.name as string } : {}),
            ...(params.description !== null
              ? { description: params.description as string }
              : {}),
          },
          userId,
        );
        return { campaignId: updated.id, name: updated.name };
      }
      case 'CREATE_REWARD_DRAFT': {
        const created = await this.benefits.create(
          businessId,
          {
            type: params.type as BenefitType,
            title: params.title as string,
            ...(params.description
              ? { description: params.description as string }
              : {}),
            ...(params.terms ? { terms: params.terms as string } : {}),
            active: false,
          },
          userId,
        );
        return { benefitId: created.id, title: created.title, active: false };
      }
      case 'CREATE_MISSION_DRAFT': {
        const created = await this.missions.create(
          businessId,
          {
            name: params.name as string,
            description: params.description as string | null,
            targetVisits: params.targetVisits as number,
            periodPreset: params.periodPreset as MissionPeriodPreset,
            periodDays: params.periodDays as number | null,
            rewardBenefitId: params.rewardBenefitId as string | null,
            activate: false,
          },
          ctx.now,
        );
        return { missionId: created.id, status: MissionStatus.DRAFT };
      }
      case 'SCHEDULE_CAMPAIGN': {
        const campaign = await this.requireSchedulableCampaign(
          businessId,
          params.campaignId as string,
        );
        const timezone = await this.timezone(businessId);
        const startsAt = toLocalMidnight(params.startsOn as string, timezone);
        const endsAt = params.endsOn
          ? toLocalMidnight(params.endsOn as string, timezone)
          : null;
        await this.campaigns.update(
          businessId,
          campaign.id,
          {
            startsAt: startsAt.toISOString(),
            ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
          },
          userId,
        );
        const updated = await this.campaigns.updateStatus(
          businessId,
          campaign.id,
          { status: CampaignStatus.ACTIVE },
        );
        return { campaignId: updated.id, status: updated.status };
      }
      case 'PAUSE_CAMPAIGN': {
        const updated = await this.campaigns.updateStatus(
          businessId,
          params.campaignId as string,
          { status: CampaignStatus.PAUSED },
        );
        return { campaignId: updated.id, status: updated.status };
      }
      case 'UPDATE_STAMPS_CARD': {
        const current = await this.stampsCardState(businessId);
        const feedbackBonusEnabled =
          (params.feedbackBonusEnabled as boolean | null) ??
          current.feedbackBonusEnabled;
        await this.loyalty.updateStampsCardConfig(
          businessId,
          {
            rewardBenefitId: current.rewardBenefitId ?? undefined,
            stampsRequired: params.stampsRequired as number,
            feedbackBonusEnabled,
          },
          userId,
        );
        return {
          stampsRequired: params.stampsRequired,
          feedbackBonusEnabled,
        };
      }
      case 'ACTIVATE_BENEFIT': {
        const updated = await this.benefits.activate(
          businessId,
          params.benefitId as string,
        );
        return { benefitId: updated.id, active: updated.active };
      }
      case 'SET_MISSION_STATUS': {
        await this.missions.setStatus(
          businessId,
          params.missionId as string,
          params.status as MissionStatus,
          ctx.now,
        );
        return { missionId: params.missionId, status: params.status };
      }
      case 'SEND_PROMOTION':
        // Nunca: en esta etapa el agente solo simula envíos.
        throw new ActionRejectedError(
          'DRY_RUN_ONLY',
          'Los envíos desde Intelligence están en modo simulación.',
        );
    }
  }

  // -------------------------------------------------------------------------
  // Modo A: borradores
  // -------------------------------------------------------------------------

  private async prepareSegment(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const audience = params.audience as SegmentAudience;
    const { recipientCount } = await this.promotions.preview(
      ctx.businessId,
      audience,
    );
    return {
      title: `Segmento: ${AUDIENCE_LABELS[audience]}`,
      dataVersion: null,
      target: `segment:${audience}`,
      impact: {
        summary: `Guardar el segmento "${AUDIENCE_LABELS[audience]}" (${recipientCount} clientes contactables hoy).`,
        before: [],
        after: [
          { label: 'Segmento', value: AUDIENCE_LABELS[audience] },
          { label: 'Clientes contactables hoy', value: String(recipientCount) },
        ],
        recipients: NO_RECIPIENTS,
        effectiveAt: null,
        channel: NO_CHANNEL,
        maxCost: NO_COST,
        risks: [
          'Es una foto de hoy: la audiencia se recalcula cada vez que se usa.',
        ],
        undo: 'No cambia nada en tu negocio.',
      },
    };
  }

  private async prepareCampaignDraft(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    await this.googleReviewUrl(ctx.businessId, params.destination as string);
    const channel = params.channel as CampaignChannel;
    return {
      title: `Borrador de campaña: ${params.name as string}`,
      dataVersion: null,
      target: `campaign:new:${params.name as string}`,
      impact: {
        summary: `Crear la campaña "${params.name as string}" en borrador.`,
        before: [],
        after: [
          { label: 'Nombre', value: params.name as string },
          { label: 'Dónde', value: CHANNEL_LABELS[channel] ?? channel },
          {
            label: 'Destino',
            value:
              params.destination === 'GOOGLE_REVIEW'
                ? 'Reseña en Google'
                : 'Página de Flikker',
          },
          { label: 'Estado', value: STATUS_LABELS.DRAFT },
        ],
        recipients: NO_RECIPIENTS,
        effectiveAt: null,
        channel: NO_CHANNEL,
        maxCost: NO_COST,
        risks: [
          'Cuenta para el límite de campañas de tu plan aunque esté en borrador.',
        ],
        undo: 'Podés archivarla desde Campañas.',
      },
    };
  }

  private async prepareCampaignDraftUpdate(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const campaign = await this.requireDraftCampaign(
      ctx.businessId,
      params.campaignId as string,
    );
    if (params.name === null && params.description === null) {
      throw new ActionRejectedError(
        'NOTHING_TO_CHANGE',
        'No hay ningún cambio para aplicar.',
      );
    }
    const before: ActionImpact['before'] = [];
    const after: ActionImpact['after'] = [];
    if (params.name !== null) {
      before.push({ label: 'Nombre', value: campaign.name });
      after.push({ label: 'Nombre', value: params.name as string });
    }
    if (params.description !== null) {
      before.push({
        label: 'Descripción',
        value: campaign.description ?? 'Sin descripción',
      });
      after.push({ label: 'Descripción', value: params.description as string });
    }
    return {
      title: `Editar borrador: ${campaign.name}`,
      dataVersion: null,
      target: `campaign:${campaign.id}`,
      impact: {
        summary: `Editar el borrador "${campaign.name}".`,
        before,
        after,
        recipients: NO_RECIPIENTS,
        effectiveAt: null,
        channel: NO_CHANNEL,
        maxCost: NO_COST,
        risks: [],
        undo: 'Podés volver a editarla desde Campañas.',
      },
    };
  }

  private prepareRewardDraft(params: ActionParams): Promise<PreparedAction> {
    return Promise.resolve({
      title: `Recompensa en borrador: ${params.title as string}`,
      dataVersion: null,
      target: `benefit:new:${params.title as string}`,
      impact: {
        summary: `Crear el beneficio "${params.title as string}" sin activarlo.`,
        before: [],
        after: [
          { label: 'Beneficio', value: params.title as string },
          { label: 'Estado', value: 'Inactivo (no se ofrece a nadie)' },
        ],
        recipients: NO_RECIPIENTS,
        effectiveAt: null,
        channel: NO_CHANNEL,
        maxCost: NO_COST,
        risks: [],
        undo: 'Podés borrarlo desde Programa → Beneficios.',
      },
    });
  }

  private async prepareMissionDraft(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    if (
      params.periodPreset === MissionPeriodPreset.NEXT_N_DAYS
        ? params.periodDays === null
        : params.periodDays !== null
    ) {
      throw new ActionRejectedError(
        'INVALID_PERIOD',
        'La cantidad de días solo va con "próximos N días", y ahí es obligatoria.',
      );
    }
    let rewardTitle = 'Sin premio';
    if (params.rewardBenefitId) {
      const benefit = await this.prisma.benefit.findFirst({
        where: {
          id: params.rewardBenefitId as string,
          businessId: ctx.businessId,
          isInternalCarrier: false,
        },
        select: { title: true },
      });
      if (!benefit) {
        throw new ActionRejectedError(
          'NOT_FOUND',
          'Ese beneficio no existe en tu catálogo.',
        );
      }
      rewardTitle = benefit.title;
    }
    return {
      title: `Misión en borrador: ${params.name as string}`,
      dataVersion: null,
      target: `mission:new:${params.name as string}`,
      impact: {
        summary: `Crear la misión "${params.name as string}" en borrador.`,
        before: [],
        after: [
          { label: 'Misión', value: params.name as string },
          { label: 'Visitas necesarias', value: String(params.targetVisits) },
          { label: 'Premio', value: rewardTitle },
          { label: 'Estado', value: MISSION_STATUS_LABELS.DRAFT },
        ],
        recipients: NO_RECIPIENTS,
        effectiveAt: null,
        channel: NO_CHANNEL,
        maxCost: NO_COST,
        risks: [
          'El período se fija al crearla: si la activás más tarde, el plazo ya está corriendo.',
        ],
        undo: 'Podés eliminarla desde Programa → Misiones.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Modo B: cambios con confirmación
  // -------------------------------------------------------------------------

  private async prepareSchedule(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const campaign = await this.requireSchedulableCampaign(
      ctx.businessId,
      params.campaignId as string,
    );
    const timezone = await this.timezone(ctx.businessId);
    const today = day(ctx.now, timezone);
    const startsOn = params.startsOn as string;
    const endsOn = params.endsOn as string | null;
    // Hoy Flikker no activa campañas solas en una fecha futura: ACTIVE es
    // "funcionando ya". Mejor decirlo que guardar una fecha que nadie aplica.
    if (startsOn > today) {
      throw new ActionRejectedError(
        'FUTURE_START_NOT_SUPPORTED',
        `Flikker todavía no activa campañas solas en una fecha futura. Puedo dejarla lista para activarla hoy (${today}), o la activás vos ese día.`,
      );
    }
    if (endsOn !== null && endsOn <= startsOn) {
      throw new ActionRejectedError(
        'INVALID_PERIOD',
        'La fecha de fin tiene que ser posterior a la de inicio.',
      );
    }
    return {
      title: `Activar campaña: ${campaign.name}`,
      dataVersion: campaignVersion(campaign),
      target: `campaign:${campaign.id}`,
      impact: {
        summary: `Activar "${campaign.name}" desde el ${startsOn}${endsOn ? ` hasta el ${endsOn}` : ''}.`,
        before: [
          { label: 'Estado', value: STATUS_LABELS[campaign.status] },
          { label: 'Inicio', value: day(campaign.startsAt, timezone) },
          { label: 'Fin', value: day(campaign.endsAt, timezone) },
        ],
        after: [
          { label: 'Estado', value: STATUS_LABELS.ACTIVE },
          { label: 'Inicio', value: startsOn },
          { label: 'Fin', value: endsOn ?? 'Sin fecha' },
        ],
        recipients: {
          count: null,
          description:
            'Quienes escaneen sus QR o abran su link. No se le escribe a nadie.',
        },
        effectiveAt: ctx.now.toISOString(),
        channel: `${CHANNEL_LABELS[campaign.channel] ?? campaign.channel}. ${NO_CHANNEL}`,
        maxCost: NO_COST,
        risks: [
          'Queda funcionando apenas confirmes: sus QR y links empiezan a llevar al destino.',
          ...(endsOn
            ? [
                'La fecha de fin es informativa: la campaña no se pausa sola ese día.',
              ]
            : []),
        ],
        undo: 'Podés pausarla en cualquier momento desde Campañas.',
      },
    };
  }

  private async preparePause(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: params.campaignId as string, businessId: ctx.businessId },
    });
    if (!campaign) throw notFound('Esa campaña no existe en tu negocio.');
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ActionRejectedError(
        'INVALID_STATE',
        `La campaña "${campaign.name}" no está activa (está ${STATUS_LABELS[campaign.status].toLowerCase()}).`,
      );
    }
    const automated = campaign.templateKind !== null;
    return {
      title: `Pausar campaña: ${campaign.name}`,
      dataVersion: campaignVersion(campaign),
      target: `campaign:${campaign.id}`,
      impact: {
        summary: `Pausar "${campaign.name}".`,
        before: [{ label: 'Estado', value: STATUS_LABELS.ACTIVE }],
        after: [{ label: 'Estado', value: STATUS_LABELS.PAUSED }],
        recipients: NO_RECIPIENTS,
        effectiveAt: ctx.now.toISOString(),
        channel: NO_CHANNEL,
        maxCost: NO_COST,
        risks: automated
          ? [
              'Es una campaña automática: mientras esté pausada deja de mandar sus mensajes.',
            ]
          : [
              'Mientras esté pausada, sus QR y links dejan de llevar al destino.',
            ],
        undo: 'Podés reactivarla desde Campañas.',
      },
    };
  }

  private async prepareStampsCard(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const state = await this.stampsCardState(ctx.businessId);
    // Guardar la configuración prende "Cerca del premio" (WhatsApp). Si el
    // dueño lo tiene apagado, este cambio volvería a habilitar mensajes: eso
    // se hace desde Programa, no desde acá.
    if (!state.enabled || !state.rewardBenefitId) {
      throw new ActionRejectedError(
        'NEEDS_PROGRAM_SCREEN',
        'La tarjeta de sellos no está activa. Activarla se hace desde Programa → Sellos.',
      );
    }
    if (!state.progressReminderEnabled) {
      throw new ActionRejectedError(
        'WOULD_ENABLE_MESSAGES',
        'Guardar este cambio volvería a prender los avisos de "Cerca del premio", que tenés apagados. Hacelo desde Programa → Sellos.',
      );
    }
    const feedbackBonusEnabled =
      (params.feedbackBonusEnabled as boolean | null) ??
      state.feedbackBonusEnabled;
    if (
      state.stampsRequired === params.stampsRequired &&
      state.feedbackBonusEnabled === feedbackBonusEnabled
    ) {
      throw new ActionRejectedError(
        'NOTHING_TO_CHANGE',
        'La tarjeta ya tiene esa configuración.',
      );
    }
    const bonus = (v: boolean) => (v ? 'Sí' : 'No');
    return {
      title: `Cambiar la tarjeta de sellos`,
      dataVersion: computeDataVersion(state),
      target: 'stamps-card',
      impact: {
        summary: `Tarjeta de sellos: ${params.stampsRequired as number} sellos para "${state.rewardTitle}".`,
        before: [
          {
            label: 'Sellos necesarios',
            value: String(state.stampsRequired ?? 'Sin definir'),
          },
          {
            label: 'Sello extra por opinar',
            value: bonus(state.feedbackBonusEnabled),
          },
        ],
        after: [
          {
            label: 'Sellos necesarios',
            value: String(params.stampsRequired),
          },
          {
            label: 'Sello extra por opinar',
            value: bonus(feedbackBonusEnabled),
          },
        ],
        recipients: {
          count: null,
          description:
            'Los clientes que empiecen una tarjeta nueva. No se le escribe a nadie por este cambio.',
        },
        effectiveAt: ctx.now.toISOString(),
        channel: NO_CHANNEL,
        maxCost: `Cada tarjeta completada entrega "${state.rewardTitle}", como hasta ahora.`,
        risks: [
          'Las tarjetas que ya están en curso conservan su meta; el cambio aplica a las nuevas.',
          'Queda en el historial de Programa.',
        ],
        undo: 'Podés volver a la configuración anterior desde Programa → Sellos.',
      },
    };
  }

  private async prepareActivateBenefit(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const [benefit, current] = await Promise.all([
      this.prisma.benefit.findFirst({
        where: {
          id: params.benefitId as string,
          businessId: ctx.businessId,
          isInternalCarrier: false,
        },
        select: { id: true, title: true, active: true, updatedAt: true },
      }),
      this.prisma.benefit.findFirst({
        where: {
          businessId: ctx.businessId,
          active: true,
          isInternalCarrier: false,
        },
        select: { id: true, title: true },
      }),
    ]);
    if (!benefit) throw notFound('Ese beneficio no existe en tu catálogo.');
    if (benefit.active) {
      throw new ActionRejectedError(
        'NOTHING_TO_CHANGE',
        `"${benefit.title}" ya es el beneficio activo.`,
      );
    }
    return {
      title: `Activar beneficio: ${benefit.title}`,
      dataVersion: computeDataVersion({
        benefit: [benefit.id, benefit.active, benefit.updatedAt],
        currentActive: current?.id ?? null,
      }),
      target: 'benefit:active',
      impact: {
        summary: `Ofrecer "${benefit.title}" en el check-in.`,
        before: [
          { label: 'Beneficio activo', value: current?.title ?? 'Ninguno' },
        ],
        after: [{ label: 'Beneficio activo', value: benefit.title }],
        recipients: {
          count: null,
          description:
            'Los clientes que hagan check-in desde ahora. No se le escribe a nadie.',
        },
        effectiveAt: ctx.now.toISOString(),
        channel: NO_CHANNEL,
        maxCost: `Un "${benefit.title}" por cada cliente que lo reciba y lo canjee.`,
        risks: current
          ? [
              `"${current.title}" deja de ofrecerse (solo puede haber uno activo).`,
            ]
          : [],
        undo: current
          ? `Podés volver a activar "${current.title}" desde Programa → Beneficios.`
          : 'Podés desactivarlo desde Programa → Beneficios.',
      },
    };
  }

  private async prepareMissionStatus(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const mission = await this.prisma.mission.findFirst({
      where: { id: params.missionId as string, businessId: ctx.businessId },
      select: {
        id: true,
        name: true,
        status: true,
        endsAt: true,
        updatedAt: true,
        rewardBenefit: { select: { title: true } },
      },
    });
    if (!mission) throw notFound('Esa misión no existe en tu negocio.');
    const next = params.status as MissionStatus;
    if (mission.status === next || !canTransition(mission.status, next)) {
      throw new ActionRejectedError(
        'INVALID_STATE',
        `La misión "${mission.name}" está ${MISSION_STATUS_LABELS[mission.status].toLowerCase()}: no se puede pasar a ${MISSION_STATUS_LABELS[next].toLowerCase()}.`,
      );
    }
    if (next === MissionStatus.ACTIVE && mission.endsAt <= ctx.now) {
      throw new ActionRejectedError(
        'INVALID_STATE',
        'El período de esta misión ya terminó. Creá una nueva con fechas vigentes.',
      );
    }
    const activating = next === MissionStatus.ACTIVE;
    return {
      title: `${activating ? 'Activar' : 'Pausar'} misión: ${mission.name}`,
      dataVersion: computeDataVersion([
        mission.id,
        mission.status,
        mission.updatedAt,
      ]),
      target: `mission:${mission.id}`,
      impact: {
        summary: `${activating ? 'Activar' : 'Pausar'} la misión "${mission.name}".`,
        before: [
          { label: 'Estado', value: MISSION_STATUS_LABELS[mission.status] },
        ],
        after: [{ label: 'Estado', value: MISSION_STATUS_LABELS[next] }],
        recipients: {
          count: null,
          description: activating
            ? 'Los clientes que hagan check-in mientras esté activa. No se le escribe a nadie.'
            : 'Nadie: no se contacta a ningún cliente.',
        },
        effectiveAt: ctx.now.toISOString(),
        channel: NO_CHANNEL,
        maxCost: mission.rewardBenefit
          ? `Un "${mission.rewardBenefit.title}" por cada cliente que la complete.`
          : NO_COST,
        risks: activating
          ? []
          : [
              'Mientras esté pausada no suma visitas; quienes ya participan conservan su progreso.',
            ],
        undo: activating
          ? 'Podés pausarla desde Programa → Misiones.'
          : 'Podés reactivarla desde Programa → Misiones mientras su período siga vigente.',
      },
    };
  }

  private async preparePromotion(
    ctx: ActionContext,
    params: ActionParams,
  ): Promise<PreparedAction> {
    const audience = params.audience as SegmentAudience;
    const [simulation, benefit] = await Promise.all([
      this.promotions.simulate(ctx.businessId, {
        audience,
        benefitId: (params.benefitId as string | null) ?? null,
        source: 'INTELLIGENCE',
        actorRole: ctx.role,
      }),
      params.benefitId
        ? this.prisma.benefit.findFirst({
            where: {
              id: params.benefitId as string,
              businessId: ctx.businessId,
              isInternalCarrier: false,
            },
            select: { title: true },
          })
        : Promise.resolve(null),
    ]);
    if (params.benefitId && !benefit) {
      throw notFound('Ese beneficio no existe en tu catálogo.');
    }
    const { decision } = simulation;
    const eligible = decision.eligibleCustomerIds.length;
    const excluded = simulation.recipientCount - eligible;
    const { cost } = decision;
    return {
      title: `Simulación de promoción: ${AUDIENCE_LABELS[audience]}`,
      dataVersion: null,
      target: `promotion:${audience}`,
      impact: {
        summary: decision.allowed
          ? `Simulación: promoción por WhatsApp a "${AUDIENCE_LABELS[audience]}". La política la permitiría para ${eligible} clientes. No se envía nada.`
          : `Simulación: promoción por WhatsApp a "${AUDIENCE_LABELS[audience]}". La política de tu negocio NO la permitiría hoy. No se envía nada.`,
        before: [],
        after: [
          { label: 'Mensaje', value: params.message as string },
          { label: 'Beneficio', value: benefit?.title ?? 'Sin beneficio' },
          {
            label: 'Clientes en la audiencia',
            value: String(simulation.recipientCount),
          },
          {
            label: 'Cumplen la política',
            value: `${eligible} (excluidos: ${excluded}, por consentimiento o frecuencia)`,
          },
        ],
        recipients: {
          count: eligible,
          description: `${AUDIENCE_LABELS[audience]} con consentimiento de WhatsApp y sin una promoción reciente.`,
        },
        effectiveAt: null,
        channel: 'WhatsApp (simulado: no se envía).',
        maxCost:
          eligible > 0
            ? `${cost.currency} ${cost.total} (mensajería ${cost.messaging} + incentivos ${cost.incentives}).`
            : 'Sin costo: no hay destinatarios que cumplan la política.',
        risks: [
          ...decision.blockers.map((b) => b.message),
          'Intelligence todavía no envía mensajes: para mandarla usá Notificaciones → Promociones.',
        ],
        undo: 'No hay nada que deshacer: es una simulación.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Lecturas compartidas
  // -------------------------------------------------------------------------

  private async requireDraftCampaign(businessId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
    });
    if (!campaign) throw notFound('Esa campaña no existe en tu negocio.');
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new ActionRejectedError(
        'NOT_A_DRAFT',
        `"${campaign.name}" ya no es un borrador: los cambios a una campaña ${STATUS_LABELS[campaign.status].toLowerCase()} se hacen desde Campañas.`,
      );
    }
    return campaign;
  }

  private async requireSchedulableCampaign(
    businessId: string,
    campaignId: string,
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
    });
    if (!campaign) throw notFound('Esa campaña no existe en tu negocio.');
    // Las plantillas automáticas (post-servicio, reactivación, cumpleaños)
    // mandan WhatsApp apenas están activas: fuera del alcance del agente.
    if (campaign.templateKind !== null) {
      throw new ActionRejectedError(
        'SENDS_MESSAGES',
        `"${campaign.name}" es una campaña automática que manda mensajes: se activa desde Campañas.`,
      );
    }
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.PAUSED
    ) {
      throw new ActionRejectedError(
        'INVALID_STATE',
        `La campaña "${campaign.name}" está ${STATUS_LABELS[campaign.status].toLowerCase()}: solo se puede activar un borrador o una pausada.`,
      );
    }
    return campaign;
  }

  private async stampsCardState(businessId: string) {
    const [settings, definition] = await Promise.all([
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: {
          rewardGoalsEnabled: true,
          rewardGoalMinVisits: true,
          rewardGoalFeedbackBonusEnabled: true,
          progressReminderEnabled: true,
        },
      }),
      this.prisma.retentionIncentiveDefinition.findFirst({
        where: {
          businessId,
          rewardGoalEligible: true,
          benefitId: { not: null },
        },
        select: { benefitId: true, benefit: { select: { title: true } } },
      }),
    ]);
    return {
      enabled: settings?.rewardGoalsEnabled ?? false,
      stampsRequired: settings?.rewardGoalMinVisits ?? null,
      feedbackBonusEnabled: settings?.rewardGoalFeedbackBonusEnabled ?? false,
      progressReminderEnabled: settings?.progressReminderEnabled ?? false,
      rewardBenefitId: definition?.benefitId ?? null,
      rewardTitle: definition?.benefit?.title ?? 'tu recompensa',
    };
  }

  private async timezone(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    return business?.timezone ?? 'America/Montevideo';
  }

  /** La URL de reseñas sale del negocio, nunca del modelo. */
  private async googleReviewUrl(
    businessId: string,
    destination: string,
  ): Promise<string | null> {
    if (destination !== 'GOOGLE_REVIEW') return null;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { googleBusinessProfileUrl: true, googlePlaceReviewsUri: true },
    });
    const url =
      business?.googleBusinessProfileUrl ?? business?.googlePlaceReviewsUri;
    if (!url) {
      throw new ActionRejectedError(
        'NO_GOOGLE_PROFILE',
        'Tu negocio no tiene Google conectado: la campaña puede llevar a la página de Flikker, o conectá Google desde Reseñas.',
      );
    }
    return url;
  }
}

function campaignVersion(campaign: {
  id: string;
  status: CampaignStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  updatedAt: Date;
}): string {
  return computeDataVersion([
    campaign.id,
    campaign.status,
    campaign.startsAt,
    campaign.endsAt,
    campaign.updatedAt,
  ]);
}

function toLocalMidnight(value: string, timezone: string): Date {
  const parts = parseDay(value);
  if (!parts) {
    throw new ActionRejectedError('INVALID_PERIOD', 'Fecha inválida.');
  }
  return zonedMidnightToUtc(parts.y, parts.m, parts.d, timezone);
}

function notFound(message: string): ActionRejectedError {
  return new ActionRejectedError('NOT_FOUND', message);
}

/** Un rechazo del servicio de dominio (400/403/404/409) se explica; lo demás es un error real. */
function toRejection(error: unknown): unknown {
  if (error instanceof ActionRejectedError) return error;
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 403 && /limit/i.test(error.message)) {
      return new ActionRejectedError(
        'PLAN_LIMIT',
        'Llegaste al límite de tu plan para esto.',
      );
    }
    if (status >= 400 && status < 500) {
      return new ActionRejectedError(
        status === 404 ? 'NOT_FOUND' : 'DOMAIN_RULE',
        `Flikker no permitió el cambio: ${error.message}`,
      );
    }
  }
  return error;
}
