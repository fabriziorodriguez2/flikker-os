import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventClaimService } from '../domain-events/domain-event-claim.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { renderWelcomeFreeEmail } from '../../jobs/registration-subscription-email-templates';
import { getFlikkerOwnerNotificationPhone } from '../../config/owner-notifications';

const EVENT_TYPE = 'REGISTRATION_COMPLETED';

/**
 * Parte 5, §11 — se dispara UNA vez por Business, justo después de que
 * `OnboardingService.saveBusiness` deja User + Business + Membership +
 * Subscription FREE correctamente creados (nunca antes — un registro a
 * medio terminar no dispara nada).
 *
 * Idempotente vía `DomainEventClaimService` (`REGISTRATION_COMPLETED:
 * <businessId>`) — si `saveBusiness` se llama de nuevo para el mismo
 * negocio (reanudar un draft, doble submit), el claim ya está tomado y
 * esto es un no-op silencioso.
 *
 * Cada canal (email/WhatsApp/owner) se intenta por separado — uno que
 * falla no bloquea a los demás — pero el claim ya quedó tomado antes de
 * intentar nada: no hay reintento automático del evento completo (ver
 * comentario de `DomainEventClaimService`).
 */
@Injectable()
export class RegistrationCompletedService {
  private readonly logger = new Logger(RegistrationCompletedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claims: DomainEventClaimService,
    private readonly email: EmailService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  /**
   * `alreadyPro`: Parte 5D — un Business que nace pagado (checkout
   * pre-onboarding resuelto antes de `saveBusiness`) nunca debe recibir el
   * email/WhatsApp de bienvenida al plan GRATIS — sería contradictorio con
   * lo que acaba de pagar. El aviso al owner de Flikker SÍ se manda
   * siempre: le interesa saber de todo registro nuevo, y el aviso de "Nuevo
   * Pro" (vía `SUBSCRIPTION_PAID`) es un mensaje distinto, no un duplicado.
   */
  async fire(
    businessId: string,
    userId: string,
    options: { alreadyPro?: boolean } = {},
  ): Promise<void> {
    const claimed = await this.claims.claimOnce(EVENT_TYPE, businessId);
    if (!claimed) return;

    const [user, business] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          notificationWhatsapp: true,
        },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
    ]);
    if (!user || !business) {
      this.logger.warn(
        `${EVENT_TYPE}: no se encontró User/Business (business ${businessId}) — nada que notificar.`,
      );
      return;
    }

    if (!options.alreadyPro) {
      await this.sendWelcomeEmail(user);
      await this.sendWelcomeWhatsApp(user);
    }
    await this.sendOwnerNotification(user, business.name, businessId);
  }

  private async sendWelcomeEmail(user: {
    firstName: string;
    email: string;
  }): Promise<void> {
    if (!this.email.isAvailable()) {
      this.logger.log(`${EVENT_TYPE}: email no configurado — se omite.`);
      return;
    }
    try {
      const { subject, html } = renderWelcomeFreeEmail({
        firstName: user.firstName,
      });
      await this.email.send({ to: user.email, subject, html });
    } catch (error) {
      this.logger.warn(
        `${EVENT_TYPE}: envío de email de bienvenida falló: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendWelcomeWhatsApp(user: {
    firstName: string;
    notificationWhatsapp: string | null;
  }): Promise<void> {
    if (!user.notificationWhatsapp) {
      this.logger.log(
        `${EVENT_TYPE}: usuario sin WhatsApp de notificación — se omite.`,
      );
      return;
    }
    try {
      await this.whatsApp.sendText({
        phone: user.notificationWhatsapp,
        text: `Hola ${user.firstName}! Bienvenido a Flikker — tu cuenta y tu negocio ya están listos en el plan Base, hasta 50 clientes, sin tarjeta.`,
      });
    } catch (error) {
      this.logger.warn(
        `${EVENT_TYPE}: envío de WhatsApp de bienvenida falló: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendOwnerNotification(
    user: { firstName: string; lastName: string; email: string },
    businessName: string,
    businessId: string,
  ): Promise<void> {
    const ownerPhone = getFlikkerOwnerNotificationPhone();
    if (!ownerPhone) {
      this.logger.log(
        `${EVENT_TYPE}: FLIKKER_OWNER_NOTIFICATION_PHONE no configurado — se omite notificación interna.`,
      );
      return;
    }
    try {
      await this.whatsApp.sendText({
        phone: ownerPhone,
        text: [
          'Nuevo registro en Flikker',
          `${user.firstName} ${user.lastName} — ${businessName}`,
          user.email,
          `businessId: ${businessId}`,
        ].join('\n'),
      });
    } catch (error) {
      this.logger.warn(
        `${EVENT_TYPE}: notificación al owner de Flikker falló: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
