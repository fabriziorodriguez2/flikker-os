import { Injectable, Logger } from '@nestjs/common';
import {
  MessageStatus,
  RetentionExperimentStatus,
  RetentionObjective,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MessagingService,
  type SendMessageOutcome,
} from '../../jobs/messaging/messaging.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { retentionMessageEmail } from '../../jobs/email-templates';
import { buildMiFlikkerLink } from '../public/public-messaging.service';
import { RetentionSettingsService } from './retention-settings.service';
import { PlansService } from '../plans/plans.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';
import { PolicyGateService } from '../policy/policy-gate.service';
import {
  NO_MARKETING_CONSENT,
  hasEmailMarketingConsent,
  hasWhatsappMarketingConsent,
} from '../policy/marketing-consent';
import { planExecutionAllowed } from '../policy/plan-execution';
import { policyBlockerCode } from './retention-v2-send.service';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from './retention-decision-log.service';

/**
 * Sends the one WhatsApp message a `RetentionAssignment` produced.
 *
 * This is the piece that was missing: `RetentionV2SendService` only ever got
 * as far as creating a `queued` `Message` row — nothing consumed it. That
 * gap is invisible in the DB (an assignment reads as SENT) but real: no
 * WhatsApp ever left the building. This service is the consumer.
 *
 * Everything here is re-validated, not trusted from creation time — the
 * message can sit in the BullMQ queue for a while, and in that window the
 * owner can flip the engine or an automation off, the customer can opt out,
 * or the monthly quota can fill up from other sends. Acting on stale state
 * is exactly how an "automatic" system does something the owner no longer
 * wants.
 *
 * Scoping: only ever touches a `Message` that has a `retentionAssignment` —
 * that FK is what the schema documents as the unambiguous signal of "this is
 * a Retention V2 message" (see Message.retentionAssignment in schema.prisma).
 * Every other message type (reviews, repeats, shopify, ...) already has its
 * own sender and must never be touched from here.
 */

export type DispatchOutcome =
  | { status: 'sent'; whatsappMessageId: string }
  | { status: 'skipped'; reasonCode: string }
  | { status: 'deferred'; reasonCode: string; retryDelayMs: number }
  | { status: 'already_processed' }
  | { status: 'not_retention_v2' };

/**
 * Reintento fijo cuando el envío cae fuera del horario permitido — no se
 * calcula la hora exacta en que abre la ventana (haría falta aritmética de
 * zona horaria por negocio); en cambio se reintenta cada tanto hasta que
 * `isWithinSendingWindow` diga que sí. `dispatch()` revalida todo desde
 * cero en cada intento, así que un reintento nunca manda algo que dejó de
 * corresponder (cliente que se dio de baja, automatización apagada, etc.).
 */
const WINDOW_RETRY_DELAY_MS = 30 * 60_000;
/**
 * Reintento cuando el cooldown global todavía no dejó pasar el período de
 * gracia de esta automatización — más corto porque la ventana de gracia
 * misma es corta (`AutomationCooldownService.gracePeriodMs`).
 */
const PRIORITY_RETRY_DELAY_MS = 2 * 60_000;
/** Canal caído: se reintenta cada tanto y se abandona pasado este plazo. */
const CHANNEL_RETRY_DELAY_MS = 30 * 60_000;
/** Campaña de Intelligence pausada: se vuelve a mirar cada hora. */
const PLAN_PAUSED_RETRY_DELAY_MS = 60 * 60_000;
const CHANNEL_GIVE_UP_MS = 48 * 60 * 60_000;

type FailedSend = Extract<SendMessageOutcome, { status: 'failed' }>;
/**
 * Fallas que no son del mensaje sino del remitente: se reintentan más tarde
 * sin gastar los reintentos de BullMQ.
 */
const RETRY_LATER_DELAY_MS: Partial<Record<FailedSend['errorClass'], number>> =
  {
    RATE_LIMITED: 60_000,
    SESSION_UNAVAILABLE: CHANNEL_RETRY_DELAY_MS,
    ACCOUNT_RESTRICTED: CHANNEL_RETRY_DELAY_MS,
    SENDER_PAUSED: CHANNEL_RETRY_DELAY_MS,
  };

interface SkippableMessage {
  id: string;
  businessId: string;
  customerId: string;
  retentionAssignment: { id: string } | null;
}

@Injectable()
export class RetentionV2MessageDispatchService {
  private readonly logger = new Logger(RetentionV2MessageDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly decisions: RetentionDecisionLogService,
    private readonly messaging: MessagingService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly plans: PlansService,
    private readonly cooldown: AutomationCooldownService,
    private readonly policyGate: PolicyGateService,
  ) {}

  private load(messageId: string) {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        business: true,
        customer: true,
        retentionAssignment: { include: { experiment: true } },
      },
    });
  }

  async dispatch(
    messageId: string,
    now: Date = new Date(),
  ): Promise<DispatchOutcome> {
    const message = await this.load(messageId);
    if (!message) return { status: 'skipped', reasonCode: 'NOT_FOUND' };

    // Scoping gate — see class docstring. Never dispatched, never touched.
    if (!message.retentionAssignment) {
      return { status: 'not_retention_v2' };
    }

    // First idempotency gate, before any other work: a terminal or
    // already-claimed row is never reprocessed by this call.
    if (message.status !== MessageStatus.queued) {
      return { status: 'already_processed' };
    }

    if (!message.body) {
      // Every Retention V2 message must be created with a body (see
      // RetentionV2SendService.createMessage). A missing one means either a
      // pre-migration row or a bug — fail loud rather than send a blank
      // WhatsApp message.
      return this.skipTerminal(message, 'MISSING_BODY');
    }

    const settings = await this.settings.getOrCreate(message.businessId);
    // Dry run never creates a RetentionAssignment in the first place (see
    // retention-v2-evaluate.service.ts) — this should be unreachable. Kept
    // as an explicit stop rather than trusting that invariant blindly, since
    // "dry run must never send" is a hard requirement, not an optimization.
    if (settings.dryRunEnabled) {
      return this.skipTerminal(message, 'DRY_RUN');
    }

    const isProgressReminder =
      message.retentionAssignment.experiment.objective ===
      RetentionObjective.REWARD_GOAL_PROGRESS;
    const isPlan =
      message.retentionAssignment.experiment.objective ===
      RetentionObjective.INTELLIGENCE_PLAN;
    const automationEnabled = isPlan
      ? await planExecutionAllowed(this.prisma, message.businessId)
      : isProgressReminder
        ? settings.progressReminderEnabled
        : settings.automaticCampaignsEnabled;

    if (!message.business.retentionEngineV2Enabled || !automationEnabled) {
      return this.skipTerminal(message, 'AUTOMATION_DISABLED');
    }

    // Una campaña de Intelligence pausada no despacha lo ya encolado (queda
    // esperando, sin tocar); una cancelada o cerrada no lo despacha nunca.
    if (isPlan) {
      const experimentStatus = message.retentionAssignment.experiment.status;
      if (experimentStatus === RetentionExperimentStatus.PAUSED) {
        return this.deferNonTerminal(
          message,
          'PLAN_PAUSED',
          PLAN_PAUSED_RETRY_DELAY_MS,
        );
      }
      if (experimentStatus !== RetentionExperimentStatus.RUNNING) {
        return this.skipTerminal(message, 'PLAN_STOPPED');
      }
    }

    if (message.customer.optedOut) {
      return this.skipTerminal(message, 'OPTED_OUT');
    }

    // Segunda capa del consentimiento (la primera es la elegibilidad al
    // reclutar y al crear el mensaje): se mira justo antes de llamar al
    // proveedor, con o sin política aceptada.
    if (
      !(await hasWhatsappMarketingConsent(
        this.prisma,
        message.businessId,
        message.customerId,
      ))
    ) {
      return this.skipTerminal(message, NO_MARKETING_CONSENT);
    }

    // Ventana horaria, revalidada acá y no solo al crear el Message
    // (`RetentionV2SendService`): puede pasar tiempo real entre encolar y
    // que el worker efectivamente llame a `dispatch()` (reintentos, cola
    // con backlog), y ese tiempo puede cruzar el borde de la ventana
    // permitida. NO es terminal — pedido explícito: "no debe descartarse
    // silenciosamente, debe quedar pendiente/reintentarse en la próxima
    // hora válida". El Message queda `queued`, sin tocar; el worker
    // reencola el reintento (ver RetentionV2Worker.dispatchMessage).
    if (
      !this.settings.isWithinSendingWindow(
        settings,
        message.business.timezone,
        now,
      )
    ) {
      return this.deferNonTerminal(
        message,
        'OUTSIDE_SENDING_WINDOW',
        WINDOW_RETRY_DELAY_MS,
      );
    }

    // Motor de políticas (solo con la política aceptada): reserva atómica del
    // costo de ESTE mensaje, revalidando consentimiento, frecuencia entre
    // canales, destinatarios por semana, presupuesto y kill switch. La clave
    // es el mensaje: un reintento reusa la misma reserva, nunca suma otra.
    const policy = await this.policyGate.reserve(
      {
        businessId: message.businessId,
        effect: {
          source: 'AUTOPILOT',
          actorRole: null,
          kind: 'MESSAGE',
          createsCampaign: false,
          candidateCustomerIds: [message.customerId],
          incentive: null,
          // Un plan ya contó a su grupo en el alcance semanal al aprobarse:
          // ni el cambio de semana ni pasar a 150 clientes lo recortan.
          authorizedCampaign: isPlan,
        },
        now,
        excludeMessageId: message.id,
      },
      {
        idempotencyKey: `autopilot:${message.id}`,
        userId: null,
        sourceRef: message.id,
      },
    );
    if (policy.status === 'REPLAY' || policy.status === 'IN_PROGRESS') {
      return { status: 'already_processed' };
    }
    if (policy.status === 'DENIED') {
      const code = policyBlockerCode(policy.decision);
      if (!code) {
        return this.deferNonTerminal(
          message,
          'OUTSIDE_SENDING_WINDOW',
          WINDOW_RETRY_DELAY_MS,
        );
      }
      return this.skipTerminal(message, `POLICY_${code}`);
    }
    const reservationId =
      policy.status === 'RESERVED' ? policy.reservation.id : null;
    const releasePolicy = async (reason: string) => {
      if (reservationId) await this.policyGate.release(reservationId, reason);
    };

    // Cooldown global con prioridad determinística — Cumpleaños > Sellos
    // por vencer > Casi llegás > Te extrañamos (ver AutomationCooldownService).
    // Reservar primero: si algo de MAYOR prioridad reserva después,
    // todavía puede robarle el turno a esto mientras no se haya confirmado.
    const kind = isProgressReminder ? 'progress_reminder' : 'reactivation';
    const reserved = await this.cooldown.reserve({
      businessId: message.businessId,
      customerId: message.customerId,
      kind,
      now,
    });
    if (reserved === 'blocked' || reserved === 'outranked') {
      await releasePolicy('RECENT_CONTACT');
      return this.skipTerminal(message, 'RECENT_CONTACT');
    }

    // Si NINGUNA automatización de mayor prioridad puede aplicar hoy para
    // este negocio (ambos toggles apagados), no hay nada de qué protegerse:
    // esperar el período de gracia solo demoraría el envío sin motivo. Esto
    // es leer un toggle ya existente (mismo patrón que `automationEnabled`
    // arriba), no duplicar la lógica de elegibilidad de Cumpleaños/Sellos.
    const higherPriorityMayApply =
      settings.birthdayEmailEnabled ||
      (settings.rewardGoalsEnabled && settings.stampsExpiryEmailEnabled);

    // Confirmar recién habilita mandar — antes de que pase el período de
    // gracia de este `kind`, "casi llegás"/"te extrañamos" esperan (no
    // terminal, se reintenta) para darle tiempo a Cumpleaños/Sellos por
    // vencer a robarle el turno si también son elegibles hoy para este
    // mismo cliente, aunque su cron haya corrido después por accidente.
    const confirmed = await this.cooldown.confirm({
      customerId: message.customerId,
      kind,
      now,
      skipGraceIfUncontested: !higherPriorityMayApply,
    });
    if (confirmed === 'not_ready') {
      await releasePolicy('AWAITING_PRIORITY_WINDOW');
      return this.deferNonTerminal(
        message,
        'AWAITING_PRIORITY_WINDOW',
        PRIORITY_RETRY_DELAY_MS,
      );
    }
    if (confirmed === 'outranked') {
      await releasePolicy('RECENT_CONTACT');
      return this.skipTerminal(message, 'RECENT_CONTACT');
    }

    // Email (Pro) — canal ADICIONAL, independiente del WhatsApp de acá
    // abajo: corre igual si no hay WhatsApp configurado, y su resultado
    // nunca afecta el `DispatchOutcome` de este método (WhatsApp sigue
    // siendo la automatización "real"; el email es un extra de plan). El
    // mismo `body` que Retention V2 ya compuso para el WhatsApp — no se
    // redacta un segundo mensaje.
    void this.maybeSendEmail(message, isProgressReminder).catch((error) => {
      this.logger.warn(
        `Retention V2 email side-channel failed for message ${messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    if (!message.customer.phoneE164) {
      await releasePolicy('NO_CONTACT_CHANNEL');
      return this.skipTerminal(message, 'NO_CONTACT_CHANNEL');
    }

    // Canal caído (sesión de WaSender desconectada o remitente en pausa por
    // un error reciente): "todavía no", no "nunca". Se reintenta y recién se
    // abandona si el mensaje lleva demasiado esperando.
    if (!(await this.messaging.isChannelAvailable(message.businessId, now))) {
      await releasePolicy('CHANNEL_UNAVAILABLE');
      const waitingMs = now.getTime() - new Date(message.createdAt).getTime();
      if (waitingMs > CHANNEL_GIVE_UP_MS) {
        return this.skipTerminal(message, 'CHANNEL_UNAVAILABLE');
      }
      return this.deferNonTerminal(
        message,
        'CHANNEL_UNAVAILABLE',
        CHANNEL_RETRY_DELAY_MS,
      );
    }

    if (
      message.business.messageCountCurrentMonth >=
      message.business.messageQuotaMonthly
    ) {
      await releasePolicy('QUOTA_EXCEEDED');
      return this.skipTerminal(message, 'QUOTA_EXCEEDED');
    }

    // ── Atomic claim ──────────────────────────────────────────────────────
    // A single UPDATE ... WHERE status = 'queued' is what makes this safe
    // under concurrency: Postgres serializes the row-level update, so a
    // second worker racing this exact messageId reads count: 0 below and
    // backs off instead of also calling the provider.
    const claim = await this.prisma.message.updateMany({
      where: { id: messageId, status: MessageStatus.queued },
      data: { status: MessageStatus.sending },
    });
    if (claim.count === 0) {
      await releasePolicy('ALREADY_PROCESSED');
      return { status: 'already_processed' };
    }

    // El link de "Mi Flikker" se agrega ACÁ, al momento de mandar — nunca
    // en `message.body` (eso pasó por el validador de grounding de la IA;
    // agregarlo después de esa validación evita cualquier interacción con
    // esa capa).
    const text = `${message.body}\n\nVas todos tus premios y lugares en Mi Flikker: ${buildMiFlikkerLink()}`;
    // Segunda llave anti-duplicados, además del reclamo de arriba: la clave
    // de idempotencia del intento. Aunque algo falle DESPUÉS de que el
    // proveedor aceptó (y la fila vuelva a `queued`), un reintento nunca
    // vuelve a llamar al proveedor.
    const outcome = await this.messaging.send(
      {
        businessId: message.businessId,
        customerId: message.customerId,
        messageId,
        purpose: 'AUTOPILOT',
        idempotencyKey: `retention-v2:${messageId}`,
        to: message.customer.phoneE164,
        text,
      },
      now,
    );

    if (outcome.status === 'duplicate') {
      await releasePolicy('DUPLICATE_SEND');
      await this.decisions.record({
        businessId: message.businessId,
        customerId: message.customerId,
        assignmentId: message.retentionAssignment.id,
        decisionCode: DECISION_CODES.MESSAGE_SEND_SKIPPED,
        metadata: { reasonCode: 'DUPLICATE_SEND' },
      });
      return { status: 'already_processed' };
    }

    if (outcome.status === 'failed') {
      return this.handleSendFailure(message, outcome, releasePolicy, {
        reservationId,
        now,
      });
    }

    await this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.sent,
          sentAt: now,
          whatsappMsgId: outcome.providerMessageId,
        },
      }),
      this.prisma.business.update({
        where: { id: message.businessId },
        data: { messageCountCurrentMonth: { increment: 1 } },
      }),
    ]);

    await this.decisions.record({
      businessId: message.businessId,
      customerId: message.customerId,
      assignmentId: message.retentionAssignment.id,
      decisionCode: DECISION_CODES.MESSAGE_SENT,
      metadata: { whatsappMessageId: outcome.providerMessageId },
    });
    if (reservationId) {
      await this.policyGate.commit(reservationId, {
        messagesSent: 1,
        incentivesIssued: 0,
        sourceRef: messageId,
      });
    }

    return { status: 'sent', whatsappMessageId: outcome.providerMessageId };
  }

  /**
   * Qué hacer cuando el proveedor no tomó (o no se sabe si tomó) el mensaje:
   *
   * - Resultado desconocido (timeout): pudo haber salido. Nunca se reenvía;
   *   el mensaje queda fallido y el costo se cuenta como gastado.
   * - Sesión caída, cuenta restringida, remitente en pausa o límite de
   *   velocidad: "todavía no". Vuelve a `queued` y se reintenta más tarde.
   * - Error transitorio del proveedor: vuelve a `queued` y se relanza para
   *   que BullMQ reintente (comportamiento de siempre).
   * - Destinatario inválido u otro rechazo definitivo: fallido, sin reintento.
   */
  private async handleSendFailure(
    message: SkippableMessage,
    outcome: FailedSend,
    releasePolicy: (reason: string) => Promise<void>,
    ctx: { reservationId: string | null; now: Date },
  ): Promise<DispatchOutcome> {
    const recordFailure = (terminal: boolean) =>
      this.decisions.record({
        businessId: message.businessId,
        customerId: message.customerId,
        assignmentId: message.retentionAssignment?.id ?? null,
        decisionCode: DECISION_CODES.MESSAGE_SEND_FAILED,
        metadata: {
          errorClass: outcome.errorClass,
          error: outcome.message,
          terminal,
        },
      });
    const setStatus = (status: MessageStatus) =>
      this.prisma.message.update({
        where: { id: message.id },
        data: { status },
      });

    if (!outcome.safeToResend) {
      await setStatus(MessageStatus.failed);
      await recordFailure(true);
      if (ctx.reservationId) {
        await this.policyGate.commit(ctx.reservationId, {
          messagesSent: 1,
          incentivesIssued: 0,
          sourceRef: message.id,
        });
      }
      await this.policyGate.checkHealth(message.businessId, ctx.now);
      return { status: 'skipped', reasonCode: 'PROVIDER_OUTCOME_UNKNOWN' };
    }

    await releasePolicy(outcome.errorClass);
    const retryLater = RETRY_LATER_DELAY_MS[outcome.errorClass];
    if (retryLater !== undefined || outcome.retryable) {
      await setStatus(MessageStatus.queued);
      await recordFailure(false);
      await this.policyGate.checkHealth(message.businessId, ctx.now);
      if (retryLater !== undefined) {
        return this.deferNonTerminal(message, outcome.errorClass, retryLater);
      }
      this.logger.warn(
        `Retention V2 WhatsApp send failed for message ${message.id}: ${outcome.message}`,
      );
      throw new Error(outcome.message);
    }

    await setStatus(MessageStatus.failed);
    await recordFailure(true);
    await this.policyGate.checkHealth(message.businessId, ctx.now);
    return { status: 'skipped', reasonCode: `PROVIDER_${outcome.errorClass}` };
  }

  /**
   * "Casi llegás" / "Te extrañamos" por email — Pro únicamente. Best-effort:
   * nunca lanza hacia `dispatch()` (el caller ya envuelve esto en un
   * `.catch`), nunca reclama ni muta el `Message` (eso sigue siendo del
   * WhatsApp), y no reintenta — `sendOnce` decide sent/failed/duplicate y
   * ese estado queda en `EmailLog`, no en `Message`.
   */
  private async maybeSendEmail(
    message: {
      id: string;
      businessId: string;
      customerId: string;
      body: string | null;
      business: { name: string };
      customer: { name: string; email: string | null };
    },
    isProgressReminder: boolean,
  ): Promise<void> {
    if (!message.customer.email || !message.body) return;
    if (!(await this.plans.hasProAccess(message.businessId))) return;
    // Email promocional: su propio consentimiento, no el de WhatsApp.
    if (
      !(await hasEmailMarketingConsent(
        this.prisma,
        message.businessId,
        message.customerId,
      ))
    ) {
      return;
    }

    const { subject, html } = retentionMessageEmail({
      businessName: message.business.name,
      customerName: message.customer.name,
      messageBody: message.body,
      isProgressReminder,
    });

    await this.lifecycleEmails.sendOnce({
      businessId: message.businessId,
      customerId: message.customerId,
      kind: isProgressReminder ? 'progress_reminder' : 'reactivation',
      channel: 'email',
      dedupeKey: message.id,
      to: message.customer.email,
      subject,
      html,
    });
  }

  /**
   * Called by the worker once BullMQ has exhausted its attempts for this
   * message, so the row does not stay `queued` forever after a run of
   * transient provider failures. Only ever moves `queued` -> `failed`; a
   * message that meanwhile succeeded or was claimed by an overlapping retry
   * is left alone.
   */
  async markPermanentlyFailed(messageId: string, error: unknown) {
    const updated = await this.prisma.message.updateMany({
      where: { id: messageId, status: MessageStatus.queued },
      data: { status: MessageStatus.failed },
    });
    if (updated.count === 0) return;

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        businessId: true,
        customerId: true,
        retentionAssignment: { select: { id: true } },
      },
    });
    await this.decisions.record({
      businessId: message?.businessId ?? '',
      customerId: message?.customerId ?? null,
      assignmentId: message?.retentionAssignment?.id ?? null,
      decisionCode: DECISION_CODES.MESSAGE_SEND_FAILED,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        terminal: true,
      },
    });
  }

  /** Marks a queued message as terminally skipped (never retried). */
  private async skipTerminal(
    message: SkippableMessage,
    reasonCode: string,
  ): Promise<DispatchOutcome> {
    await this.prisma.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.failed },
    });
    await this.decisions.record({
      businessId: message.businessId,
      customerId: message.customerId,
      assignmentId: message.retentionAssignment?.id ?? null,
      decisionCode: DECISION_CODES.MESSAGE_SEND_SKIPPED,
      metadata: { reasonCode },
    });
    return { status: 'skipped', reasonCode };
  }

  /**
   * Registra el motivo pero NUNCA toca `message.status` — sigue `queued`,
   * así que un reintento (real, vía `RetentionV2Worker` reencolando con
   * delay) vuelve a pasar por `dispatch()` entero, revalidando todo desde
   * cero. La diferencia con `skipTerminal`: esto es "todavía no", no
   * "nunca".
   */
  private async deferNonTerminal(
    message: SkippableMessage,
    reasonCode: string,
    retryDelayMs: number,
  ): Promise<DispatchOutcome> {
    await this.decisions.record({
      businessId: message.businessId,
      customerId: message.customerId,
      assignmentId: message.retentionAssignment?.id ?? null,
      decisionCode: DECISION_CODES.MESSAGE_SEND_SKIPPED,
      metadata: { reasonCode, terminal: false },
    });
    return { status: 'deferred', reasonCode, retryDelayMs };
  }
}
