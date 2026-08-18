import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { WhatsAppBspService } from './whatsapp-bsp.service';

/**
 * Los cinco tipos de mensaje de "Notificaciones" — string, no enum, para que
 * un tipo nuevo nunca necesite una migración (ver el comentario de
 * `EmailLog` en schema.prisma).
 */
export type LifecycleEmailKind =
  | 'stamps_expiry'
  | 'progress_reminder'
  | 'reactivation'
  | 'birthday'
  | 'promotion';

export type LifecycleMessageChannel = 'email' | 'whatsapp';

export type LifecycleEmailOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'skipped_no_email'
  | 'skipped_unavailable'
  | 'failed';

/**
 * El ÚNICO lugar que manda un mensaje automático de "Notificaciones" y el
 * único que sabe cómo evitar mandarlo dos veces. A pesar del nombre
 * (histórico — nació solo para email), también manda WhatsApp: `channel`
 * decide el transporte real (`EmailService` o `WhatsAppBspService`), y las
 * dos comparten la misma idempotencia y el mismo historial (`EmailLog`).
 *
 * Cada automatización (sellos por vencer, casi llegás, cumpleaños,
 * reactivación, promociones) sigue decidiendo A QUIÉN y CUÁNDO con su propia
 * lógica de siempre (reward goals, Retention V2, un sweep de cumpleaños) —
 * esto no es un motor nuevo, es la mecánica compartida de "mandalo, pero
 * solo una vez, y dejá registro".
 *
 * Idempotencia: la fila de `EmailLog` se crea ANTES de intentar el envío,
 * con el mismo patrón que `ensureRedemptionCode`/`RewardGoalBonusStamp` —
 * el índice único `(businessId, kind, channel, dedupeKey)` es lo que
 * realmente impide un segundo envío (un reintento, un sweep que corre dos
 * veces concurrentemente), no una lectura-y-luego-escritura que podría
 * perder una carrera. `channel` entra en la unicidad para que el email y el
 * WhatsApp de la MISMA ocurrencia (mismo kind + dedupeKey) reserven slots
 * independientes — ninguno se lee como duplicado del otro.
 */
@Injectable()
export class LifecycleEmailsService {
  private readonly logger = new Logger(LifecycleEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  async sendOnce(input: {
    businessId: string;
    customerId: string;
    kind: LifecycleEmailKind;
    channel: LifecycleMessageChannel;
    /** Único por (businessId, kind, channel) — ver los ejemplos en `EmailLog` en schema.prisma. */
    dedupeKey: string;
    /** Email address (channel: 'email') o teléfono E164 (channel: 'whatsapp'). */
    to: string | null;
    /** Requeridos cuando channel es 'email'. */
    subject?: string;
    html?: string;
    /** Requerido cuando channel es 'whatsapp'. */
    text?: string;
  }): Promise<LifecycleEmailOutcome> {
    // Nunca intentar reservar el dedupe key para un envío que de entrada no
    // tiene destinatario — así un cliente sin email/teléfono nunca "gasta"
    // el slot de idempotencia (§ pedido explícito: "no enviar si falta
    // email").
    if (!input.to) return 'skipped_no_email';

    let logId: string;
    try {
      const log = await this.prisma.emailLog.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId,
          kind: input.kind,
          channel: input.channel,
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

    const available =
      input.channel === 'email'
        ? this.email.isAvailable()
        : await this.whatsApp.isChannelAvailable();
    if (!available) {
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: {
          status: 'failed',
          errorMessage:
            input.channel === 'email'
              ? 'EMAIL_NOT_CONFIGURED'
              : 'WHATSAPP_NOT_CONFIGURED',
        },
      });
      return 'skipped_unavailable';
    }

    try {
      if (input.channel === 'email') {
        await this.email.send({
          to: input.to,
          subject: input.subject ?? '',
          html: input.html ?? '',
        });
      } else {
        await this.whatsApp.sendText({
          phone: input.to,
          text: input.text ?? '',
        });
      }
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: { sentAt: new Date() },
      });
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `${input.channel} send failed (${input.kind}): ${message}`,
      );
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: { status: 'failed', errorMessage: message.slice(0, 500) },
      });
      return 'failed';
    }
  }
}
