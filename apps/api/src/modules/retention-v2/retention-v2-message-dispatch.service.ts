import { Injectable, Logger } from '@nestjs/common';
import { MessageStatus, RetentionObjective } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { retentionMessageEmail } from '../../jobs/email-templates';
import { buildMiFlikkerLink } from '../public/public-messaging.service';
import { RetentionSettingsService } from './retention-settings.service';
import { PlansService } from '../plans/plans.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';
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
    private readonly whatsApp: WhatsAppBspService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly plans: PlansService,
    private readonly cooldown: AutomationCooldownService,
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
    const automationEnabled = isProgressReminder
      ? settings.progressReminderEnabled
      : settings.automaticCampaignsEnabled;

    if (!message.business.retentionEngineV2Enabled || !automationEnabled) {
      return this.skipTerminal(message, 'AUTOMATION_DISABLED');
    }

    if (message.customer.optedOut) {
      return this.skipTerminal(message, 'OPTED_OUT');
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
      return this.deferNonTerminal(
        message,
        'AWAITING_PRIORITY_WINDOW',
        PRIORITY_RETRY_DELAY_MS,
      );
    }
    if (confirmed === 'outranked') {
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
      return this.skipTerminal(message, 'NO_CONTACT_CHANNEL');
    }

    // Migración WHAPI → WaSenderAPI: antes miraba `WHAPI_TOKEN` directo, con
    // el proveedor hardcodeado en el nombre del check. Ahora le pregunta a
    // la abstracción — el proveedor activo decide qué significa "disponible"
    // (ver `WhatsAppProvider.isAvailable()`).
    if (!(await this.whatsApp.isChannelAvailable())) {
      return this.skipTerminal(message, 'CHANNEL_NOT_CONFIGURED');
    }

    if (
      message.business.messageCountCurrentMonth >=
      message.business.messageQuotaMonthly
    ) {
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
      return { status: 'already_processed' };
    }

    try {
      // El link de "Mi Flikker" se agrega ACÁ, al momento de mandar — nunca
      // en `message.body` (eso pasó por el validador de grounding de la
      // IA; agregarlo después de esa validación evita cualquier
      // interacción con esa capa, y el reclamo atómico de más arriba ya
      // garantiza que esto se ejecuta una sola vez por Message).
      const text = `${message.body}\n\nVas todos tus premios y lugares en Mi Flikker: ${buildMiFlikkerLink()}`;
      const result = await this.whatsApp.sendText({
        phone: message.customer.phoneE164,
        text,
      });

      await this.prisma.$transaction([
        this.prisma.message.update({
          where: { id: messageId },
          data: {
            status: MessageStatus.sent,
            sentAt: now,
            whatsappMsgId: result.whatsappMessageId,
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
        metadata: { whatsappMessageId: result.whatsappMessageId },
      });

      return { status: 'sent', whatsappMessageId: result.whatsappMessageId };
    } catch (error) {
      // Transient: put the row back exactly where the claim found it so a
      // retried job (see RetentionV2Worker) can re-validate everything fresh
      // and try again — never left stuck in `sending`.
      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.queued },
      });
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.decisions.record({
        businessId: message.businessId,
        customerId: message.customerId,
        assignmentId: message.retentionAssignment.id,
        decisionCode: DECISION_CODES.MESSAGE_SEND_FAILED,
        metadata: { error: errorMessage, terminal: false },
      });
      this.logger.warn(
        `Retention V2 WhatsApp send failed for message ${messageId}: ${errorMessage}`,
      );
      throw error;
    }
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
