import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsService } from '../benefits/benefits.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import {
  CustomerLoyaltyService,
  type LoyaltyFilter,
} from '../customers/loyalty/customer-loyalty.service';
import { VisitSourcesService } from '../visit-sources/visit-sources.service';
import { PlansService } from '../plans/plans.service';
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
 *    `ensureRedemptionCode`, que ya es idempotente.
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly campaigns: CampaignsService,
    private readonly benefits: BenefitsService,
    private readonly visitSources: VisitSourcesService,
    private readonly plans: PlansService,
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

    let messageBody = dto.message.trim();
    let benefitTitle: string | null = null;

    if (dto.benefitId) {
      // "Futuras promociones con Benefit también deben quedar bloqueadas" —
      // esta YA es esa promoción (una campaña manual que promete un
      // beneficio). Mismo guard centralizado que crear un beneficio o
      // autorizar reactivación; una promoción SIN beneficio (mensaje suelto)
      // nunca pasa por acá y sigue funcionando siempre.
      await this.plans.assertBenefitsProActionAllowed(businessId);

      /**
       * Solo se puede prometer un beneficio que el cliente pueda ABRIR.
       *
       * Investigando el flujo real: `/redeem/{token}` es del empleado (pide
       * sesión de panel), y Mi Flikker solo muestra el beneficio de una
       * tarjeta ya desbloqueada. La única superficie donde un cliente ve un
       * beneficio con su código es el check-in, y ahí se muestra el beneficio
       * ACTIVO del negocio (`resolveActiveBenefit`).
       *
       * Por eso la promoción solo acepta ese: mandar "tenés un 2x1" con un
       * beneficio que el cliente no puede abrir en ningún lado es exactamente
       * lo que no queremos. La alternativa era construir una segunda pantalla
       * de canje, que es justo lo que no hay que hacer.
       */
      const active = await this.benefits.resolveActiveBenefit(businessId);
      if (!active || active.id !== dto.benefitId) {
        throw new BadRequestException(
          'Ese beneficio no está activo. Activalo en Programa para poder ofrecerlo.',
        );
      }
      benefitTitle = active.title;

      // Un código por cliente, idempotente por el único (benefitId,
      // customerId). Reenviar la misma promoción no emite un segundo código,
      // y es el MISMO código que el check-in le mostraría igual.
      if (this.benefits.isRedeemable(active.type)) {
        for (const recipient of recipients) {
          await this.benefits.registerParticipation(
            businessId,
            active.id,
            recipient.customerId,
          );
          await this.benefits.ensureRedemptionCode(
            businessId,
            active.id,
            recipient.customerId,
          );
        }
      }

      // El link es el acceso de siempre del negocio: el cliente lo abre, lo
      // reconocemos y ve su beneficio con el código. Nada de códigos técnicos
      // largos pegados en el WhatsApp.
      const link = await this.checkinLink(businessId);
      messageBody = `${messageBody}\n\n🎁 ${active.title}`;
      if (link) messageBody = `${messageBody}\n${link}`;
    }

    const result = await this.campaigns.sendManual(businessId, userId, {
      recipients: recipients.map((r) => ({
        customerId: r.customerId,
        name: r.name,
        phoneE164: r.phoneE164,
      })),
      messageBody,
    });

    return { ...result, audience: dto.audience, benefitTitle };
  }

  /**
   * El acceso del negocio, o `null` si por algún motivo no tiene uno.
   *
   * Es el MISMO destino que el QR del mostrador: un punto de acceso, un
   * token, un destino. La promoción no genera un link propio ni un QR nuevo.
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
        select: { id: true, name: true, phoneE164: true },
      })
      .then((rows) =>
        rows.map((r) => ({
          customerId: r.id,
          name: r.name,
          phoneE164: r.phoneE164,
        })),
      );
  }
}
