import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

/**
 * Los cinco tipos de email de "Notificaciones" — string, no enum, para que
 * un tipo nuevo nunca necesite una migración (ver el comentario de
 * `EmailLog` en schema.prisma).
 */
export type LifecycleEmailKind =
  | 'stamps_expiry'
  | 'progress_reminder'
  | 'reactivation'
  | 'birthday'
  | 'promotion';

export type LifecycleEmailOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_no_email'
  | 'skipped_unavailable'
  | 'failed';

/**
 * El ÚNICO lugar que manda un email de "Notificaciones" y el único que sabe
 * cómo evitar mandarlo dos veces. Cada automatización (sellos por vencer,
 * casi llegás, cumpleaños, reactivación, promociones) sigue decidiendo A
 * QUIÉN y CUÁNDO con su propia lógica de siempre (reward goals, Retention
 * V2, un sweep de cumpleaños) — esto no es un motor nuevo, es la mecánica
 * compartida de "mandalo, pero solo una vez, y dejá registro".
 *
 * Idempotencia: la fila de `EmailLog` se crea ANTES de intentar el envío,
 * con el mismo patrón que `ensureRedemptionCode`/`RewardGoalBonusStamp` —
 * el índice único `(businessId, kind, dedupeKey)` es lo que realmente
 * impide un segundo envío (un reintento, un sweep que corre dos veces
 * concurrentemente), no una lectura-y-luego-escritura que podría perder una
 * carrera.
 */
@Injectable()
export class LifecycleEmailsService {
  private readonly logger = new Logger(LifecycleEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async sendOnce(input: {
    businessId: string;
    customerId: string;
    kind: LifecycleEmailKind;
    /** Único por (businessId, kind) — ver los ejemplos en `EmailLog` en schema.prisma. */
    dedupeKey: string;
    to: string | null;
    subject: string;
    html: string;
  }): Promise<LifecycleEmailOutcome> {
    // Nunca intentar reservar el dedupe key para un envío que de entrada no
    // tiene destinatario — así un cliente sin email nunca "gasta" el slot de
    // idempotencia (§ pedido explícito: "no enviar si falta email").
    if (!input.to) return 'skipped_no_email';

    let logId: string;
    try {
      const log = await this.prisma.emailLog.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId,
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          // Optimista — se corrige a 'failed' abajo si el envío no sale.
          status: 'sent',
        },
        select: { id: true },
      });
      logId = log.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'skipped_duplicate';
      }
      throw error;
    }

    if (!this.email.isAvailable()) {
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: { status: 'failed', errorMessage: 'EMAIL_NOT_CONFIGURED' },
      });
      return 'skipped_unavailable';
    }

    try {
      await this.email.send({
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: { sentAt: new Date() },
      });
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email send failed (${input.kind}): ${message}`);
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: { status: 'failed', errorMessage: message.slice(0, 500) },
      });
      return 'failed';
    }
  }
}
