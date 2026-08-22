import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

export type OwnerLifecycleEmailKind =
  | 'first_week'
  | 'weekly_summary_v2'
  | 'monthly_summary'
  | 'first_month'
  | 'trial_ending_5d'
  | 'trial_ending_2d'
  | 'milestone';

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
 */
@Injectable()
export class OwnerLifecycleEmailLogService {
  private readonly logger = new Logger(OwnerLifecycleEmailLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
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

    let logId: string;
    try {
      const log = await this.prisma.ownerLifecycleEmailLog.create({
        data: {
          businessId: input.businessId,
          kind: input.kind,
          dedupeKey: input.dedupeKey,
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
      await this.prisma.ownerLifecycleEmailLog.update({
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
      await this.prisma.ownerLifecycleEmailLog.update({
        where: { id: logId },
        data: { sentAt: new Date() },
      });
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Owner lifecycle email send failed (${input.kind}): ${message}`,
      );
      await this.prisma.ownerLifecycleEmailLog.update({
        where: { id: logId },
        data: { status: 'failed', errorMessage: message.slice(0, 500) },
      });
      return 'failed';
    }
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
}
