import { Injectable, Logger } from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MercadoPagoSubscriptionProvider,
  type PreapprovalResource,
} from '../public/mercado-pago-subscription.provider';
import { resolveCheckoutPricing } from '../public/checkout-pricing';

/**
 * Reconciliación de `CheckoutLead` a partir de webhooks de Mercado Pago
 * (Parte 4).
 *
 * ## Principio central (§5 del pedido): el webhook es solo una señal
 *
 * Nunca se lee `status`/`amount`/`external_reference` del BODY del
 * webhook para decidir nada — eso sería confiar en un payload que
 * cualquiera podría falsificar (o que MP podría reenviar desordenado o
 * repetido). El webhook solo dice "algo cambió en este id"; el ESTADO
 * REAL siempre se pide de nuevo con un GET exacto por id
 * (`MercadoPagoSubscriptionProvider.getPreapprovalById` /
 * `getAuthorizedPaymentById`) — nunca `/preapproval/search` (ver el
 * incidente 2026-09-30 documentado en el provider).
 *
 * Esto además resuelve el orden de entrega "gratis": un evento viejo que
 * llega después de uno nuevo simplemente vuelve a pedir el estado ACTUAL,
 * nunca puede hacer retroceder nada.
 *
 * ## Idempotencia sin tabla de eventos
 *
 * No existe una tabla genérica de eventos/webhooks en este repo (auditado
 * antes de implementar). No hace falta una acá tampoco: la transición
 * `CHECKOUT_CREATED -> PAID` es un `updateMany` GUARDADO (mismo idiom que
 * `claimForCreation` en `CheckoutLeadsService`) — si el lead ya está
 * `PAID`, un webhook repetido hace `count: 0` y no pasa nada. Correcto
 * sin necesidad de deduplicar por id de evento.
 */
@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoSubscriptionProvider,
  ) {}

  /**
   * Topic `subscription_preapproval`. `preapprovalId` viene del `data.id`
   * del webhook — se usa ÚNICAMENTE para pedir el recurso real, nunca para
   * decidir nada por sí solo.
   */
  async handleSubscriptionPreapproval(preapprovalId: string): Promise<void> {
    const resource = await this.mercadoPago.getPreapprovalById(preapprovalId);
    await this.reconcile(resource);
  }

  /**
   * Topic `subscription_authorized_payment` (§13). Esta tanda valida que
   * el cobro pertenece a una subscription nuestra y lo loguea — a
   * propósito NO dispara ningún side effect todavía (eso es billing
   * lifecycle completo, fuera de esta tanda).
   */
  async handleSubscriptionAuthorizedPayment(
    authorizedPaymentId: string,
  ): Promise<void> {
    const resource =
      await this.mercadoPago.getAuthorizedPaymentById(authorizedPaymentId);

    if (!resource.preapprovalId) {
      this.logger.warn(
        `authorized_payment ${resource.id} no trae preapproval_id — se ignora.`,
      );
      return;
    }

    const lead = await this.prisma.checkoutLead.findUnique({
      where: { providerSubscriptionId: resource.preapprovalId },
      select: { id: true },
    });

    if (!lead) {
      this.logger.warn(
        `authorized_payment ${resource.id} referencia una subscription (${resource.preapprovalId}) que no corresponde a ningún CheckoutLead conocido — se ignora.`,
      );
      return;
    }

    this.logger.log(
      `authorized_payment ${resource.id} (status=${resource.status ?? 'n/a'}) pertenece a la subscription de lead ${lead.id} — sin side effects en esta tanda.`,
    );
  }

  /**
   * Reglas de estado de `/preapproval` para esta tanda (§9):
   *   - `authorized` -> candidato a PAID (si pasa todas las validaciones).
   *   - `pending`    -> sin cambios, sigue CHECKOUT_CREATED.
   *   - `cancelled`  -> sin cambios, nunca PAID.
   *   - `paused`     -> sin cambios, nunca un PAID nuevo.
   *   - cualquier otro -> sin cambios, log de advertencia (semántica no
   *     auditada, no se inventa).
   */
  private async reconcile(resource: PreapprovalResource): Promise<void> {
    const lead = await this.resolveLead(resource);
    if (!lead) return;

    if (lead.status === CheckoutLeadStatus.PAID) {
      // Idempotente: ya procesado por una entrega anterior del mismo (o
      // equivalente) evento. No hay nada más que hacer ni que loguear como
      // advertencia — esto es lo ESPERADO ante un webhook repetido.
      this.logger.log(
        `preapproval ${resource.id}: lead ${lead.id} ya está PAID — no-op idempotente.`,
      );
      return;
    }

    if (resource.status !== 'authorized') {
      this.logger.log(
        `preapproval ${resource.id} status=${resource.status} — sin acción para lead ${lead.id}.`,
      );
      return;
    }

    if (lead.status !== CheckoutLeadStatus.CHECKOUT_CREATED) {
      // Estado inesperado: MP dice "authorized" pero nuestro lead no
      // estaba en el único estado desde el que esta tanda sabe transicionar
      // a PAID con confianza. Nunca se ignora un "authorized" real — se
      // marca para revisión manual en vez de asumir.
      this.logger.warn(
        `preapproval ${resource.id} authorized, pero lead ${lead.id} está en ${lead.status} (no CHECKOUT_CREATED) — movido a revisión manual.`,
      );
      await this.prisma.checkoutLead.updateMany({
        where: { id: lead.id, status: { not: CheckoutLeadStatus.PAID } },
        data: { status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED },
      });
      return;
    }

    const mismatches = this.findPricingMismatches(lead.plan, resource);
    if (mismatches.length > 0) {
      // Log seguro: nombres de campo y lo que no matchea, nunca el email
      // completo del payer ni el body crudo.
      this.logger.warn(
        `preapproval ${resource.id} authorized pero no coincide con lo esperado para lead ${lead.id} (${lead.plan}): ${mismatches.join(', ')} — movido a revisión manual, NO se marca PAID.`,
      );
      await this.prisma.checkoutLead.updateMany({
        where: { id: lead.id, status: CheckoutLeadStatus.CHECKOUT_CREATED },
        data: { status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED },
      });
      return;
    }

    const result = await this.prisma.checkoutLead.updateMany({
      where: { id: lead.id, status: CheckoutLeadStatus.CHECKOUT_CREATED },
      data: {
        status: CheckoutLeadStatus.PAID,
        paidAt: new Date(),
        providerStatus: resource.status,
      },
    });

    if (result.count === 1) {
      this.logger.log(
        `preapproval ${resource.id} authorized y validado — lead ${lead.id} -> PAID.`,
      );
    } else {
      // Perdió la carrera contra otra entrega concurrente del mismo
      // webhook que ya hizo la transición — resultado final idéntico,
      // nunca un segundo PAID ni un error.
      this.logger.log(
        `preapproval ${resource.id}: lead ${lead.id} ya fue transicionado por una entrega concurrente — idempotente.`,
      );
    }
  }

  /**
   * §7: primero por `providerSubscriptionId` (el camino normal — siempre
   * debería existir, porque la creación es síncrona y ya lo persistió
   * antes de que MP pudiera generar ningún evento). Fallback por
   * `externalReference` SOLO si ese lead no está ya asociado a una
   * subscription DISTINTA — evita repetir el incidente (asociar una
   * subscription ajena a un lead que no es el suyo).
   */
  private async resolveLead(resource: PreapprovalResource) {
    const byId = await this.prisma.checkoutLead.findUnique({
      where: { providerSubscriptionId: resource.id },
    });
    if (byId) return byId;

    if (!resource.externalReference) {
      this.logger.warn(
        `preapproval ${resource.id}: no hay CheckoutLead con ese providerSubscriptionId y no vino external_reference — se ignora.`,
      );
      return null;
    }

    const byRef = await this.prisma.checkoutLead.findUnique({
      where: { id: resource.externalReference },
    });
    if (!byRef) {
      this.logger.warn(
        `preapproval ${resource.id}: no hay CheckoutLead con ese providerSubscriptionId ni con external_reference=${resource.externalReference} — se ignora.`,
      );
      return null;
    }
    if (
      byRef.providerSubscriptionId &&
      byRef.providerSubscriptionId !== resource.id
    ) {
      this.logger.warn(
        `preapproval ${resource.id}: el lead ${byRef.id} (external_reference) ya está asociado a otra subscription (${byRef.providerSubscriptionId}) — NO se reasocia.`,
      );
      return null;
    }

    return byRef;
  }

  private findPricingMismatches(
    plan: CheckoutPlan,
    resource: PreapprovalResource,
  ): string[] {
    const pricing = resolveCheckoutPricing(plan);
    const mismatches: string[] = [];

    if (resource.autoRecurring.frequency !== pricing.frequency) {
      mismatches.push(
        `frequency esperado=${pricing.frequency} recibido=${resource.autoRecurring.frequency ?? 'null'}`,
      );
    }
    if (resource.autoRecurring.frequencyType !== pricing.frequencyType) {
      mismatches.push(
        `frequency_type esperado=${pricing.frequencyType} recibido=${resource.autoRecurring.frequencyType ?? 'null'}`,
      );
    }
    if (resource.autoRecurring.transactionAmount !== pricing.amount) {
      mismatches.push(
        `amount esperado=${pricing.amount} recibido=${resource.autoRecurring.transactionAmount ?? 'null'}`,
      );
    }
    if (resource.autoRecurring.currencyId !== pricing.currency) {
      mismatches.push(
        `currency esperado=${pricing.currency} recibido=${resource.autoRecurring.currencyId ?? 'null'}`,
      );
    }

    return mismatches;
  }
}
