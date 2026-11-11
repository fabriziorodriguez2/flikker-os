import { Injectable, Logger } from '@nestjs/common';
import { DeliveryAttemptStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getWhatsAppProvider } from '../whatsapp-provider.factory';
import type { WhatsAppProvider } from '../whatsapp-provider';
import {
  classifyDeliveryError,
  recipientHash,
  type DeliveryErrorClass,
} from './delivery-errors';

/**
 * Remitente de un negocio: proveedor + sesión/cuenta desde la que sale el
 * mensaje. Hoy todos los negocios comparten una sesión de WaSender
 * (`WHATSAPP_SENDER_SESSION`, por defecto "shared"); cuando haya una por
 * comercio, este es el único lugar que cambia.
 */
export interface MessagingSender {
  provider: WhatsAppProvider;
  session: string;
}

export interface SendMessageInput {
  businessId: string;
  customerId?: string | null;
  messageId?: string | null;
  /** Qué camino manda (AUTOPILOT, PROMOTION, ...). */
  purpose: string;
  /** Mismo envío lógico = misma clave. Es lo que impide duplicados. */
  idempotencyKey: string;
  to: string;
  text: string;
}

export type SendMessageOutcome =
  | { status: 'sent'; providerMessageId: string; attemptId: string }
  /**
   * Ya hay un intento vivo con esta clave. `previous` dice cuál: ACCEPTED =
   * ya salió; IN_FLIGHT = otro lo está mandando; UNKNOWN = no se sabe.
   */
  | { status: 'duplicate'; previous: DeliveryAttemptStatus | null }
  | {
      status: 'failed';
      errorClass: DeliveryErrorClass | 'SENDER_PAUSED';
      retryable: boolean;
      /** False = pudo haber salido: el que llama no debe reenviar. */
      safeToResend: boolean;
      message: string;
    };

/**
 * Tras un error de sesión o de cuenta, el remitente queda en pausa este
 * tiempo: nadie más le pega al proveedor hasta que pase (un solo envío
 * "prueba" después). Evita insistir contra una sesión caída o una cuenta
 * restringida, que es justo lo que empeora una restricción de WhatsApp.
 */
export const SENDER_PAUSE_MS = 15 * 60_000;
const SENDER_PAUSING_CLASSES: DeliveryErrorClass[] = [
  'SESSION_UNAVAILABLE',
  'ACCOUNT_RESTRICTED',
];

/**
 * Capa de mensajería entre los motores (Autopilot, Intelligence) y el
 * proveedor. No decide A QUIÉN se escribe —eso es de la política y el
 * consentimiento, antes de llegar acá—; decide CÓMO se manda sin duplicar:
 *
 * 1. Reclama la clave de idempotencia con una fila IN_FLIGHT (índice único
 *    parcial): un segundo intento concurrente o un reintento ve el reclamo y
 *    no llama al proveedor.
 * 2. Llama al proveedor.
 * 3. Registra el resultado: ACCEPTED, FAILED (seguro reintentar, libera la
 *    clave) o UNKNOWN (pudo haber salido: la clave queda tomada).
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolveSender(businessId: string): MessagingSender {
    // `businessId` todavía no cambia nada: es el punto de extensión para
    // sesiones por comercio.
    void businessId;
    return {
      provider: getWhatsAppProvider(),
      session: process.env.WHATSAPP_SENDER_SESSION?.trim() || 'shared',
    };
  }

  /** ¿Puede salir un mensaje de este negocio ahora? */
  async isChannelAvailable(businessId: string, now = new Date()) {
    const sender = this.resolveSender(businessId);
    if (await this.senderPaused(sender, now)) return false;
    return sender.provider.isAvailable();
  }

  async send(
    input: SendMessageInput,
    now: Date = new Date(),
  ): Promise<SendMessageOutcome> {
    const sender = this.resolveSender(input.businessId);

    if (await this.senderPaused(sender, now)) {
      return {
        status: 'failed',
        errorClass: 'SENDER_PAUSED',
        retryable: true,
        safeToResend: true,
        message:
          'El remitente está en pausa por un error reciente de sesión o cuenta.',
      };
    }

    let attemptId: string;
    try {
      const attempt = await this.prisma.messageDeliveryAttempt.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId ?? null,
          messageId: input.messageId ?? null,
          purpose: input.purpose,
          idempotencyKey: input.idempotencyKey,
          provider: sender.provider.name,
          senderSession: sender.session,
          recipientHash: recipientHash(input.to),
          status: DeliveryAttemptStatus.IN_FLIGHT,
          createdAt: now,
        },
        select: { id: true },
      });
      attemptId = attempt.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const live = await this.prisma.messageDeliveryAttempt.findFirst({
          where: {
            idempotencyKey: input.idempotencyKey,
            status: {
              in: [
                DeliveryAttemptStatus.IN_FLIGHT,
                DeliveryAttemptStatus.ACCEPTED,
                DeliveryAttemptStatus.UNKNOWN,
              ],
            },
          },
          select: { status: true },
        });
        return { status: 'duplicate', previous: live?.status ?? null };
      }
      throw error;
    }

    let providerMessageId: string;
    try {
      const result = await sender.provider.sendText({
        to: input.to,
        text: input.text,
      });
      providerMessageId = result.providerMessageId;
    } catch (error) {
      const verdict = classifyDeliveryError(error);
      await this.prisma.messageDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: verdict.safeToResend
            ? DeliveryAttemptStatus.FAILED
            : DeliveryAttemptStatus.UNKNOWN,
          errorClass: verdict.errorClass,
          httpStatus: verdict.httpStatus,
          errorCode: verdict.errorCode,
          errorMessage: verdict.message,
          finishedAt: new Date(),
        },
      });
      this.logger.warn(
        `Envío ${input.purpose} ${verdict.errorClass} (negocio ${input.businessId}, intento ${attemptId}): ${verdict.message}`,
      );
      return {
        status: 'failed',
        errorClass: verdict.errorClass,
        retryable: verdict.retryable,
        safeToResend: verdict.safeToResend,
        message: verdict.message,
      };
    }

    try {
      await this.prisma.messageDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: DeliveryAttemptStatus.ACCEPTED,
          providerMessageId,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      // El proveedor ya lo tomó: el intento queda IN_FLIGHT (la clave sigue
      // tomada, así que nadie lo reenvía) y se informa como enviado.
      this.logger.error(
        `Intento ${attemptId} aceptado por el proveedor pero no se pudo registrar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return { status: 'sent', providerMessageId, attemptId };
  }

  /**
   * En pausa si el último intento terminado de esta sesión, dentro de la
   * ventana, falló por sesión o cuenta. Un envío aceptado después la levanta.
   */
  private async senderPaused(sender: MessagingSender, now: Date) {
    const last = await this.prisma.messageDeliveryAttempt.findFirst({
      where: {
        provider: sender.provider.name,
        senderSession: sender.session,
        status: {
          in: [DeliveryAttemptStatus.ACCEPTED, DeliveryAttemptStatus.FAILED],
        },
        createdAt: { gte: new Date(now.getTime() - SENDER_PAUSE_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true, errorClass: true },
    });
    return (
      last?.status === DeliveryAttemptStatus.FAILED &&
      SENDER_PAUSING_CLASSES.includes(last.errorClass as DeliveryErrorClass)
    );
  }
}
