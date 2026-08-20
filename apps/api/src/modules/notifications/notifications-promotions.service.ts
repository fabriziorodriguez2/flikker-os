import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BenefitIssuanceSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsService } from '../benefits/benefits.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import {
  CustomerLoyaltyService,
  type LoyaltyFilter,
} from '../customers/loyalty/customer-loyalty.service';
import { VisitSourcesService } from '../visit-sources/visit-sources.service';
import { PlansService } from '../plans/plans.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { promotionEmail } from '../../jobs/email-templates';
import type { SendPromotionDto } from './dto/send-promotion.dto';

/**
 * Promociones — lo que el dueño decide mandar, cuando quiere.
 *
 * Es la otra mitad de Notificaciones y la diferencia con las automáticas es
 * de autoría, no de tecnología: acá el dueño elige el mensaje, la audiencia y
 * el momento; en las automáticas Flikker decide según el comportamiento del
 * cliente. Por eso no comparten lista ni configuración.
 *
 * Nada de esto es infraestructura nueva:
 *  - la audiencia sale de `CustomerLoyaltyService`, o sea de los MISMOS
 *    filtros que ve el dueño en Clientes (si "Cerca de completar" muestra 12
 *    personas, la promoción le llega a esas 12);
 *  - el envío es `CampaignsService.sendManual`, que ya existe y ya funciona;
 *  - el beneficio sale del catálogo de Programa y se emite con
 *    `issueBenefit` — cada envío es una emisión NUEVA e independiente
 *    (nunca idempotente a propósito: reenviar la misma promoción es una
 *    entrega nueva, auditable por separado, con su propio código).
 */

/** Audiencias, en los términos en que el dueño las ve en Clientes. */
export const PROMOTION_AUDIENCES = {
  todos: 'todos',
  volvieron: 'volvieron',
  ausentes: 'ausentes',
  cerca: 'cerca',
} as const satisfies Record<string, LoyaltyFilter>;

export type PromotionAudience = keyof typeof PROMOTION_AUDIENCES;

/** Tope de destinatarios por envío. Igual que el que ya usa la lista. */
const MAX_RECIPIENTS = 500;

@Injectable()
export class NotificationsPromotionsService {
  private readonly logger = new Logger(NotificationsPromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly campaigns: CampaignsService,
    private readonly benefits: BenefitsService,
    private readonly visitSources: VisitSourcesService,
    private readonly plans: PlansService,
    private readonly lifecycleEmails: LifecycleEmailsService,
  ) {}

  /**
   * Cuántos destinatarios tiene una audiencia. Es lo que se muestra en la
   * confirmación antes de enviar — no una estimación: es la misma consulta
   * que después arma la lista real.
   */
  async preview(businessId: string, audience: PromotionAudience) {
    const recipients = await this.resolveRecipients(businessId, audience);
    return { audience, recipientCount: recipients.length };
  }

  async send(businessId: string, userId: string, dto: SendPromotionDto) {
    const recipients = await this.resolveRecipients(businessId, dto.audience);

    if (recipients.length === 0) {
      throw new BadRequestException(
        'No hay clientes en esa audiencia todavía.',
      );
    }
    if (recipients.length > MAX_RECIPIENTS) {
      throw new BadRequestException(
        `La audiencia tiene ${recipients.length} clientes, más del máximo por envío (${MAX_RECIPIENTS}).`,
      );
    }

    const rawMessage = dto.message.trim();
    let messageBody = rawMessage;
    let benefitTitle: string | null = null;
    // Link POR destinatario — cada cliente ve SU propia emisión, no un link
    // genérico compartido. `genericLink` es el único fallback que queda: un
    // Benefit de sorteo/ninguno no tiene pantalla de emisión propia.
    const linkByCustomerId = new Map<string, string>();
    let genericLink: string | null = null;
    // Se completa después de `campaigns.sendManual` (necesita el id de la
    // campaña real) para poder marcar cada emisión con qué promoción la
    // mandó.
    const issuedParticipationIds: string[] = [];

    if (dto.benefitId) {
      // "Futuras promociones con Benefit también deben quedar bloqueadas" —
      // esta YA es esa promoción (una campaña manual que promete un
      // beneficio). Mismo guard centralizado que crear un beneficio o
      // autorizar reactivación; una promoción SIN beneficio (mensaje suelto)
      // nunca pasa por acá y sigue funcionando siempre.
      await this.plans.assertBenefitsProActionAllowed(businessId);
      // Si Beneficios está apagado (Programa → Configuración), el cliente
      // después no puede ver/canjear nada vía `getOtherAvailableBenefits`
      // (mismo toggle) — bloquear el envío ahora, no dejar que la promesa
      // llegue por WhatsApp/email y se rompa del otro lado.
      await this.benefits.assertBenefitsCatalogEnabled(businessId);

      /**
       * Auditado (pedido explícito): antes esto exigía que `dto.benefitId`
       * fuera el ÚNICO `active` del check-in — con 3 Benefits reales en el
       * catálogo, solo 1 podía ofrecerse en una promoción. Ese guard asumía
       * que la única forma de que el cliente "abra" un beneficio era vía el
       * activo del check-in, pero `BenefitParticipation` nunca dependió de
       * `active`: es la misma fila/mecanismo que ya usa el regalo de
       * bienvenida (`grantWelcomeGift`, que explícitamente NO chequea
       * `active`). `getOne` ya valida tenancy (404 si el Benefit no es de
       * este negocio) — cualquier Benefit real del catálogo es válido acá,
       * sin importar `active` ni `automationEligible` (eso es autorización
       * de reactivación, otra cosa).
       */
      const benefit = await this.benefits.getOne(businessId, dto.benefitId);
      benefitTitle = benefit.title;

      if (this.benefits.isRedeemable(benefit.type)) {
        /**
         * Pedido explícito: cada envío es una emisión NUEVA e
         * independiente, sin importar si el cliente ya recibió (y hasta
         * canjeó) este mismo Benefit antes, por esta promoción o por otro
         * origen — nunca se reabre ni se reusa una fila existente. Cada
         * cliente recibe su propio código y su propio link a SU emisión
         * (`/beneficio/{id}`, pantalla pública de solo lectura con el QR
         * de canje — el canje real sigue pasando exclusivamente por
         * `/redeem/{code}`, staff, sin cambios).
         *
         * Auditado (pedido explícito): todo el lote se emite dentro de UNA
         * transacción — si falla a mitad de camino (ej. un recipiente
         * 501-avo de 500), no queda un lote a medio crear. O se emiten las
         * `recipients.length` participaciones, o ninguna; nunca un envío
         * nunca-enviado dejando emisiones huérfanas sin campaña.
         */
        const issued = await this.prisma.$transaction((tx) =>
          Promise.all(
            recipients.map((recipient) =>
              this.benefits.issueBenefit(
                {
                  businessId,
                  benefitId: benefit.id,
                  customerId: recipient.customerId,
                  source: BenefitIssuanceSource.PROMOTION,
                },
                tx,
              ),
            ),
          ),
        );
        for (let i = 0; i < recipients.length; i++) {
          const participation = issued[i];
          issuedParticipationIds.push(participation.id);
          linkByCustomerId.set(
            recipients[i].customerId,
            this.issuanceLink(participation.id),
          );
        }
        messageBody = `${messageBody}\n\n🎁 ${benefit.title}\n{link}`;
      } else {
        // Sorteo/ninguno: no hay código para canjear ni pantalla de emisión
        // propia — mismo link genérico del negocio de siempre.
        for (const recipient of recipients) {
          await this.benefits.registerParticipation(
            businessId,
            benefit.id,
            recipient.customerId,
          );
        }
        genericLink = await this.checkinLink(businessId);
        messageBody = `${messageBody}\n\n🎁 ${benefit.title}`;
        if (genericLink) messageBody = `${messageBody}\n${genericLink}`;
      }
    }

    const result = await this.campaigns.sendManual(businessId, userId, {
      recipients: recipients.map((r) => ({
        customerId: r.customerId,
        name: r.name,
        phoneE164: r.phoneE164,
        link: linkByCustomerId.get(r.customerId),
      })),
      messageBody,
    });

    if (issuedParticipationIds.length > 0) {
      // La promoción YA se mandó en este punto — un fallo acá es solo
      // metadata de trazabilidad perdida (`campaignId` queda null), nunca
      // una emisión huérfana ni un beneficio que el cliente no pueda usar.
      // No debe tirar: eso le devolvería un 500 al dueño sobre un envío
      // que en los hechos sí funcionó.
      await this.prisma.benefitParticipation
        .updateMany({
          where: { id: { in: issuedParticipationIds } },
          data: { campaignId: result.campaignId },
        })
        .catch((error) => {
          this.logger.warn(
            `No se pudo asociar campaignId=${result.campaignId} a ${issuedParticipationIds.length} emisiones: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    // Email (Pro) — canal adicional para la MISMA promoción, para los
    // destinatarios que además tienen email. Nunca bloquea ni afecta el
    // resultado de la campaña por WhatsApp de arriba.
    void this.maybeSendEmails({
      businessId,
      campaignId: result.campaignId,
      recipients,
      rawMessage,
      benefitTitle,
      linkByCustomerId,
      genericLink,
    }).catch((error) => {
      this.logger.warn(
        `Promotion email side-channel failed for campaign ${result.campaignId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return { ...result, audience: dto.audience, benefitTitle };
  }

  private async maybeSendEmails(input: {
    businessId: string;
    campaignId: string;
    recipients: { customerId: string; name: string; email: string | null }[];
    rawMessage: string;
    benefitTitle: string | null;
    linkByCustomerId: Map<string, string>;
    genericLink: string | null;
  }): Promise<void> {
    const recipientsWithEmail = input.recipients.filter((r) => r.email);
    if (recipientsWithEmail.length === 0) return;
    if (!(await this.plans.hasProAccess(input.businessId))) return;

    const business = await this.prisma.business.findUnique({
      where: { id: input.businessId },
      select: { name: true },
    });
    if (!business) return;

    for (const recipient of recipientsWithEmail) {
      const link =
        input.linkByCustomerId.get(recipient.customerId) ?? input.genericLink;
      const { subject, html } = promotionEmail({
        businessName: business.name,
        customerName: recipient.name,
        messageBody: input.rawMessage,
        benefitTitle: input.benefitTitle,
        checkinLink: link,
      });
      await this.lifecycleEmails.sendOnce({
        businessId: input.businessId,
        customerId: recipient.customerId,
        kind: 'promotion',
        channel: 'email',
        dedupeKey: `${input.campaignId}:${recipient.customerId}`,
        to: recipient.email,
        subject,
        html,
      });
    }
  }

  /**
   * El link a la pantalla pública de UNA emisión concreta
   * (`GET /public/benefit-issuances/:id` del lado del cliente) — solo
   * lectura: muestra el Benefit y su QR de canje, nunca confirma nada. El
   * canje real sigue pasando por `/redeem/{code}` (staff).
   */
  private issuanceLink(participationId: string): string {
    const base = (process.env.WEB_BASE_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    return `${base}/beneficio/${participationId}`;
  }

  /**
   * El acceso del negocio, o `null` si por algún motivo no tiene uno.
   *
   * Es el MISMO destino que el QR del mostrador: un punto de acceso, un
   * token, un destino. Solo se usa como fallback para Benefits de
   * sorteo/ninguno, que no tienen una pantalla de emisión propia.
   */
  private async checkinLink(businessId: string): Promise<string | null> {
    const source = await this.visitSources.ensureDefaultSource(businessId);
    return source ? this.visitSources.buildCheckinUrl(source.token) : null;
  }

  /**
   * Resuelve la audiencia a personas concretas.
   *
   * Reusa el mismo servicio que pinta la lista de Clientes, así que las
   * definiciones no pueden divergir: "hace tiempo que no vienen" significa
   * exactamente lo mismo en las dos pantallas.
   *
   * Se pide el rol OWNER para que los teléfonos vengan completos — son los
   * que hay que marcar para enviar. El enmascarado es una decisión de
   * presentación, no de datos.
   */
  private async resolveRecipients(
    businessId: string,
    audience: PromotionAudience,
  ) {
    const { data } = await this.loyalty.list(businessId, {
      filter: PROMOTION_AUDIENCES[audience],
      limit: MAX_RECIPIENTS + 1,
      role: 'OWNER',
    });

    const ids = data.map((row) => row.id);
    if (ids.length === 0) return [];

    // Los que pidieron no recibir mensajes quedan afuera, siempre. Esto no es
    // configurable ni se puede saltear desde la UI.
    return this.prisma.customer
      .findMany({
        where: {
          businessId,
          id: { in: ids },
          isActive: true,
          optedOut: false,
        },
        select: { id: true, name: true, phoneE164: true, email: true },
      })
      .then((rows) =>
        rows.map((r) => ({
          customerId: r.id,
          name: r.name,
          phoneE164: r.phoneE164,
          email: r.email,
        })),
      );
  }
}
