import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BenefitIssuanceSource,
  MembershipRole,
  PolicyEffectSource,
} from '@prisma/client';
import {
  customersWithEmailMarketingConsent,
  customersWithWhatsappMarketingConsent,
} from '../policy/marketing-consent';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsService } from '../benefits/benefits.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import {
  CustomerLoyaltyService,
  type LoyaltyFilter,
} from '../customers/loyalty/customer-loyalty.service';
import { CustomerPublicUrlService } from '../public/customer-public-url.service';
import { PlansService } from '../plans/plans.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { promotionEmail } from '../../jobs/email-templates';
import { buildMiFlikkerLink } from '../public/public-messaging.service';
import type { SendPromotionDto } from './dto/send-promotion.dto';
import { PolicyService } from '../policy/policy.service';
import {
  PolicyGateService,
  denialMessage,
  summarizeExclusions,
} from '../policy/policy-gate.service';
import { benefitIncentive } from '../policy/policy-usage';
import type { PolicyDecision, PolicyEffect } from '../policy/policy-rules';

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

interface PromotionRecipient {
  customerId: string;
  name: string;
  phoneE164: string;
  email: string | null;
}

interface DeliveryResult {
  response: {
    campaignId: string;
    sent: number;
    failed: number;
    audience: PromotionAudience;
    benefitTitle: string | null;
  };
  issuedCount: number;
}

interface EffectParams {
  source: PolicyEffectSource;
  actorRole: MembershipRole | null;
  recipientIds: string[];
  benefitId?: string;
}

@Injectable()
export class NotificationsPromotionsService {
  private readonly logger = new Logger(NotificationsPromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly campaigns: CampaignsService,
    private readonly benefits: BenefitsService,
    private readonly publicUrls: CustomerPublicUrlService,
    private readonly plans: PlansService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly policies: PolicyService,
    private readonly gate: PolicyGateService,
  ) {}

  /**
   * Cuántos destinatarios tiene una audiencia. Es lo que se muestra en la
   * confirmación antes de enviar — no una estimación: es la misma consulta
   * que después arma la lista real.
   */
  async preview(
    businessId: string,
    audience: PromotionAudience,
    benefitId?: string,
  ) {
    const recipients = await this.resolveRecipients(businessId, audience);
    const { summary } = await this.consentSplit(businessId, recipients);
    const base = {
      audience,
      recipientCount: recipients.length,
      // Cuántos pueden recibirla de verdad y cuántos quedan afuera por no
      // haber autorizado promociones (con o sin política aceptada).
      consent: summary,
    };
    if (!(await this.policies.isAccepted(businessId))) return base;
    const { decision } = await this.evaluateFor(businessId, {
      source: PolicyEffectSource.PROMOTION,
      actorRole: MembershipRole.OWNER,
      recipientIds: recipients.map((r) => r.customerId),
      benefitId,
    });
    return { ...base, policy: policyView(decision) };
  }

  /**
   * La decisión del motor sobre una promoción hipotética, sin reservar nada.
   * La usa la simulación de Intelligence, que siempre está gobernada.
   */
  async simulate(
    businessId: string,
    params: {
      audience: PromotionAudience;
      benefitId?: string | null;
      source: PolicyEffectSource;
      actorRole: MembershipRole | null;
    },
  ) {
    const recipients = await this.resolveRecipients(
      businessId,
      params.audience,
    );
    const { decision, governed } = await this.evaluateFor(businessId, {
      source: params.source,
      actorRole: params.actorRole,
      recipientIds: recipients.map((r) => r.customerId),
      benefitId: params.benefitId ?? undefined,
    });
    return {
      recipientCount: recipients.length,
      governed,
      decision,
      policy: policyView(decision),
    };
  }

  async send(
    businessId: string,
    userId: string,
    dto: SendPromotionDto,
    role: MembershipRole | null = null,
  ) {
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

    // Con la política aceptada, el envío pasa por el motor: reserva atómica
    // antes de gastar, solo a destinatarios elegibles, y confirmación con lo
    // que realmente salió. Sin política, el camino de siempre.
    const split = await this.consentSplit(businessId, recipients);
    if (split.whatsapp.length === 0) {
      throw new BadRequestException(
        `Ninguno de los ${recipients.length} clientes de esta audiencia autorizó recibir promociones por WhatsApp.`,
      );
    }
    if (!(await this.policies.isAccepted(businessId))) {
      const delivered = await this.deliver(
        businessId,
        userId,
        dto,
        split.whatsapp,
        split.emailIds,
      );
      return { ...delivered.response, consent: split.summary };
    }

    const effect = await this.effectFor(businessId, {
      source: PolicyEffectSource.PROMOTION,
      actorRole: role,
      recipientIds: recipients.map((r) => r.customerId),
      benefitId: dto.benefitId,
    });
    const outcome = await this.gate.reserve(
      { businessId, effect },
      { idempotencyKey: dto.idempotencyKey ?? randomUUID(), userId },
    );
    if (outcome.status === 'REPLAY') {
      return outcome.reservation.result as Record<string, unknown>;
    }
    if (outcome.status === 'IN_PROGRESS') {
      throw new ConflictException('Esta promoción ya se está enviando.');
    }
    if (outcome.status === 'DENIED') {
      throw new BadRequestException(denialMessage(outcome.decision));
    }
    if (outcome.status === 'NOT_GOVERNED') {
      const delivered = await this.deliver(
        businessId,
        userId,
        dto,
        split.whatsapp,
        split.emailIds,
      );
      return { ...delivered.response, consent: split.summary };
    }

    const eligible = new Set(outcome.decision.eligibleCustomerIds);
    let delivered: DeliveryResult;
    try {
      delivered = await this.deliver(
        businessId,
        userId,
        dto,
        recipients.filter((r) => eligible.has(r.customerId)),
        split.emailIds,
      );
    } catch (error) {
      await this.gate.release(
        outcome.reservation.id,
        error instanceof Error ? error.message : 'Error al enviar',
      );
      throw error;
    }
    const response = {
      ...delivered.response,
      policy: policyView(outcome.decision),
      consent: split.summary,
    };
    await this.gate.commit(outcome.reservation.id, {
      messagesSent: delivered.response.sent,
      incentivesIssued: delivered.issuedCount,
      sourceRef: delivered.response.campaignId,
      result: response,
    });
    void this.gate.checkHealth(businessId);
    return response;
  }

  private async effectFor(
    businessId: string,
    params: EffectParams,
  ): Promise<PolicyEffect> {
    let incentive: PolicyEffect['incentive'] = null;
    if (params.benefitId) {
      const settings = await this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { averageTicketAmount: true },
      });
      const resolved = await benefitIncentive(
        this.prisma,
        businessId,
        params.benefitId,
        settings?.averageTicketAmount ?? null,
      );
      if (!resolved) throw new NotFoundException('Beneficio no encontrado');
      incentive = resolved.incentive;
    }
    return {
      source: params.source,
      actorRole: params.actorRole,
      kind: 'MESSAGE',
      createsCampaign: true,
      candidateCustomerIds: params.recipientIds,
      incentive,
    };
  }

  private async evaluateFor(businessId: string, params: EffectParams) {
    const effect = await this.effectFor(businessId, params);
    return this.gate.evaluate({ businessId, effect });
  }

  /** El envío en sí: idéntico con o sin política, solo cambia a quiénes. */
  private async deliver(
    businessId: string,
    userId: string,
    dto: SendPromotionDto,
    recipients: PromotionRecipient[],
    /** Quién autorizó promociones por email (solo a ellos va el email). */
    emailConsented: ReadonlySet<string>,
  ): Promise<DeliveryResult> {
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

    // "Mi Flikker" — el mismo link estable en cualquier promoción, para que
    // el cliente encuentre sus lugares/premios sin depender de guardar este
    // mensaje puntual. Al final, después del link de emisión propio (si
    // hay uno) — nunca lo reemplaza.
    messageBody = `${messageBody}\n\nVas todos tus premios y lugares en Mi Flikker: ${buildMiFlikkerLink()}`;

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
      recipients: recipients.filter((r) => emailConsented.has(r.customerId)),
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

    return {
      response: { ...result, audience: dto.audience, benefitTitle },
      issuedCount: issuedParticipationIds.length,
    };
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
   * Quién de la audiencia autorizó promociones, por canal. Tener teléfono o
   * email, o no haberse dado de baja, no es una autorización.
   */
  private async consentSplit(
    businessId: string,
    recipients: PromotionRecipient[],
  ) {
    const ids = recipients.map((r) => r.customerId);
    const [whatsappIds, emailIds] = await Promise.all([
      customersWithWhatsappMarketingConsent(this.prisma, businessId, ids),
      customersWithEmailMarketingConsent(
        this.prisma,
        businessId,
        recipients.filter((r) => r.email?.trim()).map((r) => r.customerId),
      ),
    ]);
    const withEmail = recipients.filter((r) => r.email?.trim()).length;
    return {
      whatsapp: recipients.filter((r) => whatsappIds.has(r.customerId)),
      emailIds,
      summary: {
        audience: recipients.length,
        whatsappEligible: whatsappIds.size,
        whatsappExcludedNoConsent: recipients.length - whatsappIds.size,
        emailEligible: emailIds.size,
        emailExcludedNoConsent: withEmail - emailIds.size,
      },
    };
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
   *
   * `CustomerPublicUrlService` decide V2 (`/check-in/{token}`) vs LEGACY
   * (`/qr/{businessId}`) — antes esto mandaba siempre `/check-in/`, un link
   * que un negocio LEGACY no puede abrir (`CheckinService.resolveSource` lo
   * rechaza con 404).
   */
  private checkinLink(businessId: string): Promise<string | null> {
    return this.publicUrls.checkinUrlByBusinessId(businessId);
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
  ): Promise<PromotionRecipient[]> {
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

/** Lo que el dueño (o el agente) ve de una decisión: sin ids de clientes. */
function policyView(decision: PolicyDecision) {
  return {
    allowed: decision.allowed,
    eligibleCount: decision.eligibleCustomerIds.length,
    excluded: summarizeExclusions(decision),
    blockers: decision.blockers,
    cost: decision.cost,
  };
}
