import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { WhatsAppBspService } from './whatsapp-bsp.service';

export type OwnerLifecycleEmailKind =
  | 'first_week'
  | 'weekly_summary_v2'
  | 'monthly_summary'
  | 'first_month'
  | 'trial_ending_5d'
  | 'trial_ending_2d'
  | 'milestone_whatsapp';

export type OwnerLifecycleEmailOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_no_recipient'
  | 'skipped_unavailable'
  | 'failed';

/**
 * Mismo idioma que `LifecycleEmailsService.sendOnce` (fila creada ANTES de
 * enviar, el índice único es la garantía real), pero sobre
 * `OwnerLifecycleEmailLog` — que no tiene `customerId` porque el
 * destinatario es la lista de OWNER/ADMIN del negocio, no un Customer. Ver
 * el comentario del modelo en schema.prisma para el significado de
 * `dedupeKey` por `kind`.
 *
 * Dos canales, un solo idioma de idempotencia: `sendOnce` (email) y
 * `sendOnceWhatsApp` (hitos) comparten `claim`/`markSent`/`markFailed` —
 * la reserva atómica es la misma, solo cambia el transporte final.
 */
@Injectable()
export class OwnerLifecycleEmailLogService {
  private readonly logger = new Logger(OwnerLifecycleEmailLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  async sendOnce(input: {
    businessId: string;
    kind: OwnerLifecycleEmailKind;
    dedupeKey: string;
    to: string[];
    subject: string;
    html: string;
  }): Promise<OwnerLifecycleEmailOutcome> {
    // Nunca reservar el slot de idempotencia para un envío que de entrada no
    // tiene a quién mandarse — así un negocio sin OWNER/ADMIN con email no
    // "gasta" esa ocurrencia (mismo criterio que `LifecycleEmailsService`).
    if (input.to.length === 0) return 'skipped_no_recipient';

    const claim = await this.claim(
      input.businessId,
      input.kind,
      input.dedupeKey,
    );
    if (claim === 'skipped_duplicate') return claim;

    if (!this.email.isAvailable()) {
      await this.markFailed(claim.logId, 'EMAIL_NOT_CONFIGURED');
      return 'skipped_unavailable';
    }

    try {
      await this.email.send({
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      await this.markSent(claim.logId);
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Owner lifecycle email send failed (${input.kind}): ${message}`,
      );
      await this.markFailed(claim.logId, message.slice(0, 500));
      return 'failed';
    }
  }

  /**
   * Mismo mecanismo que `sendOnce`, pero por WhatsApp — para los hitos
   * (`OwnerMilestoneWhatsAppService`). WhatsApp no soporta múltiples
   * destinatarios en un solo envío como el email: se manda a cada teléfono
   * por separado, best-effort (un número roto no aborta a los demás).
   * `sent` significa que al menos un teléfono lo recibió.
   */
  async sendOnceWhatsApp(input: {
    businessId: string;
    kind: OwnerLifecycleEmailKind;
    dedupeKey: string;
    to: string[];
    text: string;
  }): Promise<OwnerLifecycleEmailOutcome> {
    if (input.to.length === 0) return 'skipped_no_recipient';

    const claim = await this.claim(
      input.businessId,
      input.kind,
      input.dedupeKey,
    );
    if (claim === 'skipped_duplicate') return claim;

    if (!(await this.whatsApp.isChannelAvailable())) {
      await this.markFailed(claim.logId, 'WHATSAPP_NOT_CONFIGURED');
      return 'skipped_unavailable';
    }

    let anySent = false;
    for (const phone of input.to) {
      try {
        await this.whatsApp.sendText({ phone, text: input.text });
        anySent = true;
      } catch (error) {
        this.logger.warn(
          `Owner milestone WhatsApp send failed for ${phone}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (anySent) {
      await this.markSent(claim.logId);
      return 'sent';
    }
    await this.markFailed(claim.logId, 'ALL_WHATSAPP_SENDS_FAILED');
    return 'failed';
  }

  /** Ya se mandó (o se intentó) esta ocurrencia puntual — sin gastar el slot. */
  async alreadyLogged(
    businessId: string,
    kind: OwnerLifecycleEmailKind,
    dedupeKey: string,
  ): Promise<boolean> {
    const row = await this.prisma.ownerLifecycleEmailLog.findUnique({
      where: {
        businessId_kind_dedupeKey: { businessId, kind, dedupeKey },
      },
      select: { id: true },
    });
    return row !== null;
  }

  private async claim(
    businessId: string,
    kind: OwnerLifecycleEmailKind,
    dedupeKey: string,
  ): Promise<{ logId: string } | 'skipped_duplicate'> {
    const logId = await this.claimOnce(businessId, kind, dedupeKey);
    return logId ? { logId } : 'skipped_duplicate';
  }

  /**
   * El reclamo atómico real, expuesto para callers que necesitan reservar
   * VARIOS slots por separado antes de un único envío combinado (los
   * hitos de WhatsApp: N milestones cruzados a la vez, un solo mensaje —
   * ver `OwnerMilestoneWhatsAppService`). La fila se crea ANTES de
   * intentar cualquier envío; el índice único `(businessId, kind,
   * dedupeKey)` es lo que de verdad impide un segundo envío, nunca una
   * lectura-y-luego-escritura. `null` = ya estaba reclamado.
   */
  async claimOnce(
    businessId: string,
    kind: OwnerLifecycleEmailKind,
    dedupeKey: string,
  ): Promise<string | null> {
    try {
      const log = await this.prisma.ownerLifecycleEmailLog.create({
        data: { businessId, kind, dedupeKey, status: 'sent' },
        select: { id: true },
      });
      return log.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  markSent(logId: string) {
    return this.prisma.ownerLifecycleEmailLog.update({
      where: { id: logId },
      data: { sentAt: new Date() },
    });
  }

  markFailed(logId: string, errorMessage: string) {
    return this.prisma.ownerLifecycleEmailLog.update({
      where: { id: logId },
      data: { status: 'failed', errorMessage: errorMessage.slice(0, 500) },
    });
  }
}
