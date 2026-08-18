import { Injectable, Logger } from '@nestjs/common';
import { MessageStatus, RetentionObjective } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { retentionMessageEmail } from '../../jobs/email-templates';
import { RetentionSettingsService } from './retention-settings.service';
import { PlansService } from '../plans/plans.service';
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
  | { status: 'already_processed' }
  | { status: 'not_retention_v2' };

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
      const result = await this.whatsApp.sendText({
        phone: message.customer.phoneE164,
        text: message.body,
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
}
