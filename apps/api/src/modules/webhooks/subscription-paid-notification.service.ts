import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventClaimService } from '../domain-events/domain-event-claim.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { renderWelcomeProEmail } from '../../jobs/registration-subscription-email-templates';
import { resolveCheckoutPricing } from '../public/checkout-pricing';
import {
  getFlikkerOwnerNotificationEmail,
  getFlikkerOwnerNotificationPhone,
  getGettingStartedPdfUrl,
} from '../../config/owner-notifications';

const EVENT_TYPE = 'SUBSCRIPTION_PAID';

/**
 * Parte 5, §12 — se dispara UNA vez por `CheckoutLead`, justo después de
 * que `MercadoPagoWebhookService` confirma la transición real
 * `CHECKOUT_CREATED -> PAID` y activa Pro en el Business (nunca antes: un
 * webhook `authorized` que todavía no pasó todas las validaciones de
 * `MercadoPagoWebhookService#reconcile` no dispara nada acá).
 *
 * Idempotente vía `DomainEventClaimService`
 * (`SUBSCRIPTION_PAID:<checkoutLeadId>`) — un webhook duplicado que ya
 * encontró el lead en PAID ni siquiera llega a llamar a `fire` (ver
 * `reconcile`), pero el claim es la garantía real, no esa guarda.
 *
 * Solo aplica al checkout AUTENTICADO (`businessId`/`requestedByUserId` no
 * nulos) — el flujo público viejo nunca tuvo notificaciones de pago
 * automatizadas, y esta tanda no se las agrega.
 */
@Injectable()
export class SubscriptionPaidNotificationService {
  private readonly logger = new Logger(
    SubscriptionPaidNotificationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly claims: DomainEventClaimService,
    private readonly email: EmailService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  async fire(checkoutLeadId: string): Promise<void> {
    const claimed = await this.claims.claimOnce(EVENT_TYPE, checkoutLeadId);
    if (!claimed) return;

    const lead = await this.prisma.checkoutLead.findUnique({
      where: { id: checkoutLeadId },
      select: { plan: true, businessId: true, requestedByUserId: true },
    });
    if (!lead?.businessId || !lead.requestedByUserId) {
      this.logger.warn(
        `${EVENT_TYPE}: lead ${checkoutLeadId} sin businessId/requestedByUserId — nada que notificar (¿flujo público viejo?).`,
      );
      return;
    }

    const [user, business] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: lead.requestedByUserId },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          notificationWhatsapp: true,
        },
      }),
      this.prisma.business.findUnique({
        where: { id: lead.businessId },
        select: { name: true, phone: true },
      }),
    ]);
    if (!user || !business) {
      this.logger.warn(
        `${EVENT_TYPE}: no se encontró User/Business para lead ${checkoutLeadId} — nada que notificar.`,
      );
      return;
    }

    const pricing = resolveCheckoutPricing(lead.plan);

    await this.sendCustomerEmail(user, business.name);
    await this.sendCustomerWhatsApp(user);
    await this.sendOwnerNotification({
      user,
      business,
      plan: lead.plan,
      amount: pricing.amount,
      currency: pricing.currency,
      businessId: lead.businessId,
      checkoutLeadId,
    });
  }

  private async sendCustomerEmail(
    user: { firstName: string; email: string },
    businessName: string,
  ): Promise<void> {
    if (!this.email.isAvailable()) {
      this.logger.log(`${EVENT_TYPE}: email no configurado — se omite.`);
      return;
    }
    try {
      const { subject, html } = renderWelcomeProEmail({
        firstName: user.firstName,
        businessName,
        gettingStartedPdfUrl: getGettingStartedPdfUrl(),
      });
      await this.email.send({ to: user.email, subject, html });
    } catch (error) {
      this.logger.warn(
        `${EVENT_TYPE}: envío de email Pro falló: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendCustomerWhatsApp(user: {
    firstName: string;
    notificationWhatsapp: string | null;
  }): Promise<void> {
    if (!user.notificationWhatsapp) {
      this.logger.log(
        `${EVENT_TYPE}: usuario sin WhatsApp de notificación — se omite.`,
      );
      return;
    }
    const pdfUrl = getGettingStartedPdfUrl();
    const pdfLine = pdfUrl ? ` Guía de primeros pasos: ${pdfUrl}` : '';
    try {
      await this.whatsApp.sendText({
        phone: user.notificationWhatsapp,
        text: `${user.firstName}, tu suscripción Pro ya está activa — sin tope de clientes y Beneficios sin límite de prueba.${pdfLine}`,
      });
    } catch (error) {
      this.logger.warn(
        `${EVENT_TYPE}: envío de WhatsApp Pro falló: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendOwnerNotification(input: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
      notificationWhatsapp: string | null;
    };
    business: { name: string; phone: string | null };
    plan: string;
    amount: number;
    currency: string;
    businessId: string;
    checkoutLeadId: string;
  }): Promise<void> {
    const ownerPhone = getFlikkerOwnerNotificationPhone();
    const ownerEmail = getFlikkerOwnerNotificationEmail();
    if (!ownerPhone && !ownerEmail) {
      this.logger.log(
        `${EVENT_TYPE}: sin contacto owner configurado — se omite notificación interna.`,
      );
      return;
    }

    // Nunca secretos ni datos de tarjeta — solo lo que el pedido pidió
    // explícitamente (§12).
    const phone =
      input.user.notificationWhatsapp ?? input.business.phone ?? 'sin teléfono';
    const lines = [
      'Nuevo Pro en Flikker',
      `${input.user.firstName} ${input.user.lastName} — ${input.business.name}`,
      input.user.email,
      phone,
      `Plan: ${input.plan} — ${input.currency} ${input.amount}`,
      `businessId: ${input.businessId}`,
      `checkoutLeadId: ${input.checkoutLeadId}`,
    ];

    if (ownerPhone) {
      try {
        await this.whatsApp.sendText({
          phone: ownerPhone,
          text: lines.join('\n'),
        });
      } catch (error) {
        this.logger.warn(
          `${EVENT_TYPE}: notificación WhatsApp al owner falló: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (ownerEmail && this.email.isAvailable()) {
      try {
        await this.email.send({
          to: ownerEmail,
          subject: `Nuevo Pro: ${input.business.name}`,
          html: `<pre style="font-family:inherit;white-space:pre-wrap;">${lines
            .map((line) => line.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
            .join('\n')}</pre>`,
        });
      } catch (error) {
        this.logger.warn(
          `${EVENT_TYPE}: notificación email al owner falló: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
