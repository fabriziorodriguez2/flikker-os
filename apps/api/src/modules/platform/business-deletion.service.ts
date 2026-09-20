import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BusinessStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Borrado REAL — de un cliente dentro de un negocio, o de un negocio entero.
 *
 * Por qué no alcanza con `DELETE FROM "Business"`: de las 59 relaciones
 * directas a `Business`, **31 son `Restrict`** (el default de Prisma para
 * relaciones requeridas). El borrado falla en la primera. Y `Customer`, que
 * es una de esas 31, tiene a su vez 10 hijos `Restrict` propios, algunos con
 * nietos. El orden de abajo sale de recorrer ese grafo, no de intuición.
 *
 * Tres reglas que gobiernan todo el archivo:
 *
 *  1. **La identidad global nunca se toca.** `FlikkerAccount` es global
 *     (`phoneE164` único, sin `businessId`) y `Customer.flikkerAccountId` es
 *     `SetNull`, así que borrar Customers no la roza. No hay que escribir
 *     nada para preservarla — hay que no escribir nada que la borre.
 *  2. **Lo que es del negocio y no del cliente, se conserva.** Una
 *     `GoogleReview` atribuida a un mensaje del cliente, o un `RaffleDraw`
 *     que ganó: la fila es del negocio. Se le anula la referencia, no se
 *     borra.
 *  3. **`User` global sobrevive.** Se borra la `Membership` (la relación con
 *     ESTE negocio), nunca la cuenta.
 */

export interface ResetCustomerResult {
  businessId: string;
  flikkerAccountId: string;
  customerIds: string[];
  /** Filas borradas por tabla, solo las que borraron algo. */
  deleted: Record<string, number>;
  totalDeleted: number;
  flikkerAccountPreserved: boolean;
  customersInOtherBusinesses: number;
}

export interface HardDeleteResult {
  businessId: string;
  businessName: string;
  deleted: Record<string, number>;
  totalDeleted: number;
  flikkerAccountsPreserved: number;
  usersPreserved: number;
}

/** Acumula conteos sin ensuciar el resultado con ceros. */
function tally(into: Record<string, number>, key: string, count: number) {
  if (count > 0) into[key] = (into[key] ?? 0) + count;
}

@Injectable()
export class BusinessDeletionService {
  private readonly logger = new Logger(BusinessDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────
  // Reset de un cliente dentro de un negocio
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Borra TODO el estado tenant-scoped de una persona dentro de UN negocio,
   * dejando intacta su identidad global y su relación con los demás.
   *
   * Se resuelve por `(businessId, flikkerAccountId)` y no por una lista de
   * ids: una misma persona puede tener VARIOS `Customer` en el mismo negocio
   * (alta manual, alta por QR, re-alta después de un cambio de sesión). En
   * Bar Fraternidad hay tres. Borrar solo "el que tiene las visitas" dejaría
   * a los otros dos con el mismo teléfono, y el próximo check-in los
   * encontraría — el reset no habría servido de nada.
   */
  async resetCustomerForBusiness(input: {
    businessId: string;
    flikkerAccountId: string;
  }): Promise<ResetCustomerResult> {
    const { businessId, flikkerAccountId } = input;

    const customers = await this.prisma.customer.findMany({
      where: { businessId, flikkerAccountId },
      select: { id: true },
    });
    const customerIds = customers.map((c) => c.id);

    const customersInOtherBusinesses = await this.prisma.customer.count({
      where: { flikkerAccountId, businessId: { not: businessId } },
    });

    if (customerIds.length === 0) {
      return {
        businessId,
        flikkerAccountId,
        customerIds: [],
        deleted: {},
        totalDeleted: 0,
        flikkerAccountPreserved: true,
        customersInOtherBusinesses,
      };
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const counts: Record<string, number> = {};
      await this.deleteCustomerScopedRows(tx, customerIds, counts);
      const gone = await tx.customer.deleteMany({
        where: { id: { in: customerIds } },
      });
      tally(counts, 'Customer', gone.count);
      return counts;
    });

    // La cuenta global tiene que seguir existiendo. Se verifica, no se asume.
    const account = await this.prisma.flikkerAccount.findUnique({
      where: { id: flikkerAccountId },
      select: { id: true },
    });

    return {
      businessId,
      flikkerAccountId,
      customerIds,
      deleted,
      totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
      flikkerAccountPreserved: account !== null,
      customersInOtherBusinesses,
    };
  }

  /**
   * Las 10 relaciones `Restrict` que cuelgan de `Customer`, en orden, más los
   * nietos que a su vez cuelgan de ellas. Las 12 relaciones `Cascade`
   * (`Visit` no, `CustomerRewardGoal` sí, sesiones, eventos, misiones,
   * desafíos, feedback de check-in, bonus stamps, asignaciones, outcomes,
   * email logs, contacto de automatización) se van solas con el `Customer` y
   * por eso no aparecen acá.
   */
  private async deleteCustomerScopedRows(
    tx: Prisma.TransactionClient,
    customerIds: string[],
    counts: Record<string, number>,
  ) {
    const byCustomer = { customerId: { in: customerIds } };

    /*
      Primero: desatar lo que es del NEGOCIO pero apunta al cliente. Una
      reseña de Google no deja de existir porque el cliente se borre — lo
      único que se pierde es la atribución. Lo mismo con un sorteo que ganó.
    */
    const messages = await tx.message.findMany({
      where: byCustomer,
      select: { id: true },
    });
    const messageIds = messages.map((m) => m.id);

    if (messageIds.length > 0) {
      const unattributed = await tx.googleReview.updateMany({
        where: { attributedMessageId: { in: messageIds } },
        data: { attributedMessageId: null },
      });
      tally(
        counts,
        'GoogleReview.attributedMessageId → null',
        unattributed.count,
      );
    }

    const unwon = await tx.raffleDraw.updateMany({
      where: { winnerCustomerId: { in: customerIds } },
      data: { winnerCustomerId: null },
    });
    tally(counts, 'RaffleDraw.winnerCustomerId → null', unwon.count);

    // Nietos de Message (los tres son Restrict sobre `messageId`).
    tally(
      counts,
      'CampaignExecution',
      (await tx.campaignExecution.deleteMany({ where: byCustomer })).count,
    );
    tally(
      counts,
      'FeedbackResponse',
      (await tx.feedbackResponse.deleteMany({ where: byCustomer })).count,
    );
    tally(
      counts,
      'RetentionSend',
      (await tx.retentionSend.deleteMany({ where: byCustomer })).count,
    );

    // Hijos Restrict directos.
    tally(
      counts,
      'ManualCampaignContact',
      (await tx.manualCampaignContact.deleteMany({ where: byCustomer })).count,
    );
    tally(
      counts,
      'AppointmentNotification',
      (
        await tx.appointmentNotification.deleteMany({
          where: { contactId: { in: customerIds } },
        })
      ).count,
    );
    tally(
      counts,
      'BenefitParticipation',
      (await tx.benefitParticipation.deleteMany({ where: byCustomer })).count,
    );
    tally(
      counts,
      'Visit',
      (await tx.visit.deleteMany({ where: byCustomer })).count,
    );

    // Message antes que ServiceEvent: `Message.serviceEventId` es Restrict.
    tally(
      counts,
      'Message',
      (await tx.message.deleteMany({ where: byCustomer })).count,
    );
    tally(
      counts,
      'ServiceEvent',
      (await tx.serviceEvent.deleteMany({ where: byCustomer })).count,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Hard delete de un negocio
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Borrado definitivo de un negocio archivado.
   *
   * SOLO acepta `status = ARCHIVED`. Un negocio activo no se puede borrar ni
   * por API ni por UI: archivar primero es un paso deliberado y reversible,
   * y es la única forma de que un borrado irreversible requiera dos
   * decisiones separadas en el tiempo.
   */
  async hardDeleteBusiness(businessId: string): Promise<HardDeleteResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, status: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    if (business.status !== BusinessStatus.ARCHIVED) {
      throw new BadRequestException(
        'Solo se puede eliminar definitivamente un negocio archivado. Archivalo primero.',
      );
    }

    // Se cuentan ANTES de borrar: después ya no hay a quién preguntarle.
    const [accounts, users] = await Promise.all([
      this.prisma.customer
        .findMany({
          where: { businessId, flikkerAccountId: { not: null } },
          select: { flikkerAccountId: true },
          distinct: ['flikkerAccountId'],
        })
        .then((rows) => rows.length),
      this.prisma.membership
        .findMany({
          where: { businessId },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((rows) => rows.length),
    ]);

    const deleted = await this.prisma.$transaction(
      async (tx) => {
        const counts: Record<string, number> = {};

        /*
          El ciclo primero. `Business.welcomeBenefitId → Benefit` y
          `Benefit.businessId → Business` se apuntan mutuamente; sin romperlo
          no hay orden posible que funcione.
        */
        await tx.business.update({
          where: { id: businessId },
          data: { welcomeBenefitId: null },
        });

        const customerIds = (
          await tx.customer.findMany({
            where: { businessId },
            select: { id: true },
          })
        ).map((c) => c.id);

        if (customerIds.length > 0) {
          await this.deleteCustomerScopedRows(tx, customerIds, counts);
          tally(
            counts,
            'Customer',
            (await tx.customer.deleteMany({ where: { businessId } })).count,
          );
        }

        /*
          Nietos de `Review` que NO tienen `businessId` propio.

          Esto no salió del mapa de FKs a Business —justamente porque no
          apuntan a Business— sino de un fallo real: los dos negocios con
          reseñas etiquetadas reventaron contra
          `ReviewTagRelation_tagId_fkey`. Son tablas puente
          (`Review`↔`ReviewTag`) e historial, las dos `Restrict` sobre
          `reviewId`, así que hay que alcanzarlas navegando desde las
          reseñas del negocio.
        */
        const reviewIds = (
          await tx.review.findMany({
            where: { businessId },
            select: { id: true },
          })
        ).map((r) => r.id);

        if (reviewIds.length > 0) {
          const byReview = { where: { reviewId: { in: reviewIds } } };
          tally(
            counts,
            'ReviewTagRelation',
            (await tx.reviewTagRelation.deleteMany(byReview)).count,
          );
          tally(
            counts,
            'ReviewStatusHistory',
            (await tx.reviewStatusHistory.deleteMany(byReview)).count,
          );
        }

        /*
          Las 31 relaciones Restrict que quedan, hojas primero. Las 28
          Cascade no aparecen: el `delete` final del Business las arrastra.
        */
        const byBusiness = { where: { businessId } };
        const restrictTables: Array<[string, Promise<{ count: number }>]> = [
          ['WidgetEvent', tx.widgetEvent.deleteMany(byBusiness)],
          ['ScanEvent', tx.scanEvent.deleteMany(byBusiness)],
          ['ReviewTag', tx.reviewTag.deleteMany(byBusiness)],
          ['Response', tx.response.deleteMany(byBusiness)],
          ['GoogleReview', tx.googleReview.deleteMany(byBusiness)],
          ['Review', tx.review.deleteMany(byBusiness)],
          ['Message', tx.message.deleteMany(byBusiness)],
          ['ServiceEvent', tx.serviceEvent.deleteMany(byBusiness)],
          ['RaffleDraw', tx.raffleDraw.deleteMany(byBusiness)],
          ['CalendarEvent', tx.calendarEvent.deleteMany(byBusiness)],
          [
            'GoogleCalendarIntegration',
            tx.googleCalendarIntegration.deleteMany(byBusiness),
          ],
          ['ShopifyOrder', tx.shopifyOrder.deleteMany(byBusiness)],
          ['ShopifyIntegration', tx.shopifyIntegration.deleteMany(byBusiness)],
          ['Widget', tx.widget.deleteMany(byBusiness)],
          ['QrCode', tx.qrCode.deleteMany(byBusiness)],
          ['Campaign', tx.campaign.deleteMany(byBusiness)],
          ['ManualCampaign', tx.manualCampaign.deleteMany(byBusiness)],
          ['RetentionStep', tx.retentionStep.deleteMany(byBusiness)],
          ['BusinessGoal', tx.businessGoal.deleteMany(byBusiness)],
          ['BusinessPlan', tx.businessPlan.deleteMany(byBusiness)],
          ['Subscription', tx.subscription.deleteMany(byBusiness)],
          ['Branch', tx.branch.deleteMany(byBusiness)],
          ['Membership', tx.membership.deleteMany(byBusiness)],
          ['AuditLog', tx.auditLog.deleteMany(byBusiness)],
          [
            'ImpersonationLog',
            tx.impersonationLog.deleteMany({
              where: { targetBusinessId: businessId },
            }),
          ],
        ];

        for (const [name, op] of restrictTables) {
          tally(counts, name, (await op).count);
        }

        await tx.business.delete({ where: { id: businessId } });
        tally(counts, 'Business', 1);
        return counts;
      },
      // El grafo es largo y algunos negocios traen decenas de miles de
      // filas; el default de 5s no alcanza.
      { timeout: 120_000, maxWait: 15_000 },
    );

    this.logger.warn(
      `Hard delete ejecutado: ${business.name} (${businessId}) — ${Object.values(
        deleted,
      ).reduce((a, b) => a + b, 0)} filas.`,
    );

    return {
      businessId,
      businessName: business.name,
      deleted,
      totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
      flikkerAccountsPreserved: accounts,
      usersPreserved: users,
    };
  }

  /**
   * Borra por lotes las tablas de alto volumen ANTES de abrir la transacción
   * principal.
   *
   * `WidgetEvent` es telemetría pura: un negocio archivado del piloto tiene
   * 48.941 filas. Meterlas en la misma transacción que todo lo demás la
   * mantendría abierta minutos, tomando locks sobre tablas que el resto del
   * producto está usando. Y son borrados idempotentes y sin relaciones
   * salientes: si el proceso se corta a la mitad, lo único que queda es
   * menos telemetría de un negocio que igual se va a borrar.
   *
   * Se llama aparte y a propósito: `hardDeleteBusiness` sigue siendo correcto
   * sin esto, solo más lento.
   */
  async purgeHighVolumeRows(
    businessId: string,
    batchSize = 2000,
  ): Promise<{ widgetEvents: number }> {
    let widgetEvents = 0;
    for (;;) {
      const batch = await this.prisma.widgetEvent.findMany({
        where: { businessId },
        select: { id: true },
        take: batchSize,
      });
      if (batch.length === 0) break;
      const gone = await this.prisma.widgetEvent.deleteMany({
        where: { id: { in: batch.map((r) => r.id) } },
      });
      widgetEvents += gone.count;
      if (batch.length < batchSize) break;
    }
    if (widgetEvents > 0) {
      this.logger.log(
        `Purga por lotes: ${widgetEvents} WidgetEvent de ${businessId}.`,
      );
    }
    return { widgetEvents };
  }
}
