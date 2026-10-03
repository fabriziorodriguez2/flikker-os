import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { CheckoutLeadsService } from '../public/checkout-leads.service';
import { MercadoPagoWebhookService } from '../webhooks/mercado-pago-webhook.service';

export interface PreOnboardingCheckoutStatus {
  status: CheckoutLeadStatus | null;
  plan: CheckoutPlan | null;
  businessId: string | null;
}

/**
 * Parte 5D — "PRO paga ANTES del onboarding".
 *
 * Un usuario recién verificado todavía no tiene Business, así que no puede
 * pasar por `TenantGuard`/`POST /businesses/current/checkout` (eso sigue
 * existiendo tal cual, para el upgrade de un Business FREE ya creado). Este
 * servicio es el equivalente para ESE momento: el checkout queda ligado
 * inequívocamente al User (`requestedByUserId`), con `businessId: null`
 * hasta que el onboarding cree el Business real y lo asocie
 * (`OnboardingService.saveBusiness`).
 */
@Injectable()
export class PreOnboardingCheckoutService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly checkoutLeads: CheckoutLeadsService,
    private readonly webhook: MercadoPagoWebhookService,
  ) {}

  /**
   * Crea (o reusa) el `CheckoutLead` pre-onboarding de este User y arranca
   * el checkout real en Mercado Pago — mismo `createCheckout` que usa el
   * upgrade autenticado de un Business existente, sin reescribir nada del
   * provider.
   */
  async createCheckout(userId: string, plan: CheckoutPlan) {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new NotFoundException();

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Confirmá tu correo antes de pagar.');
    }

    const memberships = await this.repository.findMembershipsForUser(userId);
    if (memberships.length > 0) {
      throw new ConflictException(
        'Ya tenés un negocio — el upgrade se hace desde el panel.',
      );
    }

    if (user.pendingUpgradePlan !== plan) {
      throw new ConflictException(
        'El plan no coincide con la intención registrada en tu cuenta.',
      );
    }

    // Parte 5E: sin WhatsApp no arranca el checkout — es la única forma
    // confiable de garantizar que la notificación Pro post-pago pueda
    // mandarse (ver `SubscriptionPaidNotificationService`). El frontend ya
    // lo pide y lo guarda antes de llegar acá (`/upgrade`); esto es la
    // garantía real, no decorativa — nunca confiar solo en la secuencia del
    // browser para una regla de negocio.
    if (!user.notificationWhatsapp) {
      throw new ConflictException(
        'Necesitamos tu WhatsApp antes de continuar con el pago.',
      );
    }

    const existing =
      await this.repository.findInProgressPreOnboardingCheckoutLead(
        userId,
        plan,
      );
    const leadId =
      existing?.id ??
      (
        await this.repository.createPreOnboardingCheckoutLead({
          requestedByUserId: userId,
          email: user.email,
          plan,
        })
      ).id;

    return this.checkoutLeads.createCheckout(leadId);
  }

  /**
   * Estado del checkout pre-onboarding de este User — nunca se busca por
   * email, siempre por `requestedByUserId = session.userId`.
   *
   * Si el lead quedó en `CHECKOUT_CREATED` y ya tiene una subscription de
   * Mercado Pago asociada, reconcilia con la MISMA lógica seria del
   * webhook (`handleSubscriptionPreapproval` — un GET exacto por id, nunca
   * un search) antes de responder: así el browser no depende
   * exclusivamente de que el webhook ya haya llegado.
   */
  async getStatus(userId: string): Promise<PreOnboardingCheckoutStatus> {
    const lead =
      await this.repository.findLatestPreOnboardingCheckoutLead(userId);
    if (!lead) {
      return { status: null, plan: null, businessId: null };
    }

    if (
      lead.status === CheckoutLeadStatus.CHECKOUT_CREATED &&
      lead.providerSubscriptionId
    ) {
      await this.webhook.handleSubscriptionPreapproval(
        lead.providerSubscriptionId,
      );
      // Por id exacto, no por "último pre-onboarding del User": si en el
      // medio el onboarding ya asoció este lead a un Business, el filtro
      // de pre-onboarding ya no lo encontraría y se devolvería un estado
      // viejo en vez del real.
      const refreshed = await this.repository.findCheckoutLeadById(lead.id);
      return {
        status: refreshed?.status ?? lead.status,
        plan: lead.plan,
        businessId: refreshed?.businessId ?? null,
      };
    }

    return {
      status: lead.status,
      plan: lead.plan,
      businessId: lead.businessId,
    };
  }
}
