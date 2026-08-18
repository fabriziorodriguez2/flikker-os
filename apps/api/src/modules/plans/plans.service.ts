import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PlansRepository } from './plans.repository';

/** Default limits when a business has no active subscription. */
const DEFAULT_LIMITS = {
  maxBranches: 1,
  maxMembers: 2,
  maxCampaigns: 1,
  maxReviewsPerMonth: 20,
  messageQuotaMonthly: 0,
};

/**
 * Planes Pro reconocidos como "tier Pro" para entitlements — DOS slugs
 * distintos a propósito: 'pro' es el histórico (USD 129/mes, asignado a mano
 * por Platform Admin, usado hoy por negocios reales) y 'pro-selfservice' es
 * el que activa Mercado Pago (UYU 1.000/mes). Comercialmente son ofertas
 * distintas (moneda y precio distintos); a nivel de ENTITLEMENTS (sin tope
 * de clientes, sin bloqueo de Beneficios) ambos son "Pro" — Pro es Pro sin
 * importar por qué puerta se entró.
 */
const PRO_PLAN_SLUGS = new Set(['pro', 'pro-selfservice']);

type ActiveSubscription = Awaited<
  ReturnType<PlansRepository['findActiveSubscription']>
>;

/**
 * Entitlements/subscription — punto único de verdad para "qué puede hacer
 * este negocio según su plan". Sellos (`RetentionSettings.rewardGoalsEnabled`)
 * y Beneficios (`RetentionSettings.benefitsEnabled`) son capacidades
 * INDEPENDIENTES que cualquier negocio puede combinar; lo que sí es un solo
 * plan por negocio es la Subscription (Free o Pro). Ninguna pantalla decide
 * esto por su cuenta — todas preguntan acá.
 */
@Injectable()
export class PlansService {
  constructor(private readonly repository: PlansRepository) {}

  findAllActive() {
    return this.repository.findAllActive();
  }

  async findBySlug(slug: string) {
    const plan = await this.repository.findBySlug(slug);
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  /**
   * Returns the plan limits for a business.
   * Falls back to DEFAULT_LIMITS if no active subscription exists.
   */
  async getLimits(businessId: string) {
    const sub = await this.repository.findActiveSubscription(businessId);

    if (
      !sub ||
      (sub.status !== SubscriptionStatus.ACTIVE &&
        sub.status !== SubscriptionStatus.TRIALING)
    ) {
      return DEFAULT_LIMITS;
    }

    return sub.plan;
  }

  /**
   * Checks if the business can add another branch.
   * Throws ForbiddenException if limit is reached.
   */
  async assertCanAddBranch(businessId: string) {
    const [limits, currentCount] = await Promise.all([
      this.getLimits(businessId),
      this.repository.countActiveBranches(businessId),
    ]);

    if (currentCount >= limits.maxBranches) {
      throw new ForbiddenException(
        `Branch limit reached (${limits.maxBranches}). Upgrade your plan.`,
      );
    }
  }

  /**
   * Checks if the business can add another member.
   * Throws ForbiddenException if limit is reached.
   */
  async assertCanAddMember(businessId: string) {
    const [limits, currentCount] = await Promise.all([
      this.getLimits(businessId),
      this.repository.countActiveMembers(businessId),
    ]);

    if (currentCount >= limits.maxMembers) {
      throw new ForbiddenException(
        `Member limit reached (${limits.maxMembers}). Upgrade your plan.`,
      );
    }
  }

  /**
   * Self-service FREE (tarjeta de sellos): ¿puede este cliente empezar a
   * participar (tener su primera tarjeta)? Un cliente que YA participaba
   * (tiene un `CustomerRewardGoal` de cualquier status) nunca se bloquea —
   * el tope es sobre ALTAS nuevas, nunca sobre gente que ya estaba adentro.
   * Sin Subscription (negocio LEGACY, o creado por Platform Admin, o
   * cualquier negocio de antes de esta feature) = sin tope, sin cambios de
   * comportamiento para nadie que no sea nuevo self-service. Plan Pro =
   * `maxCustomers: null` = sin tope tampoco.
   */
  async canAddParticipant(
    businessId: string,
    customerId: string,
  ): Promise<boolean> {
    const alreadyParticipant = await this.repository.hasAnyRewardGoal(
      businessId,
      customerId,
    );
    if (alreadyParticipant) return true;

    const sub = await this.repository.findActiveSubscription(businessId);
    const maxCustomers = sub?.plan.maxCustomers;
    if (maxCustomers == null) return true;

    const current =
      await this.repository.countParticipatingCustomers(businessId);
    return current < maxCustomers;
  }

  /** Tier Pro, sin importar cuál de los dos planes Pro es — ver `PRO_PLAN_SLUGS`. */
  private isProSubscription(sub: ActiveSubscription): boolean {
    return Boolean(
      sub &&
      PRO_PLAN_SLUGS.has(sub.plan.slug) &&
      sub.status === SubscriptionStatus.ACTIVE,
    );
  }

  /**
   * ¿Este negocio ya está en un plan Pro, confirmado y vigente? Reconoce el
   * plan 'pro' histórico (asignado a mano) y 'pro-selfservice' (Mercado
   * Pago) — ambos son "Pro" a efectos de entitlements.
   */
  async isOnProPlan(businessId: string): Promise<boolean> {
    const sub = await this.repository.findActiveSubscription(businessId);
    return this.isProSubscription(sub);
  }

  /**
   * ¿Tiene ESTE negocio acceso a funciones Pro AHORA MISMO — pagando o en
   * trial vigente? Deliberadamente distinto de `!isBenefitsBlocked`: ese
   * método también devuelve "no bloqueado" cuando el trial NUNCA arrancó
   * (nada que usar todavía), que no es lo mismo que "tiene Pro". Usado para
   * gatear funciones Pro nuevas que no son "crear/usar un beneficio"
   * (ej. los emails de Notificaciones — cumpleaños, casi llegás, etc.), así
   * que necesitan la pregunta afirmativa, no la negativa.
   */
  async hasProAccess(businessId: string): Promise<boolean> {
    if (await this.isOnProPlan(businessId)) return true;

    const business = await this.repository.findBusinessTrialFields(businessId);
    if (!business?.benefitsTrialStartedAt || !business.benefitsTrialEndsAt) {
      return false;
    }
    return business.benefitsTrialEndsAt.getTime() >= Date.now();
  }

  /**
   * Self-service Beneficios: ¿está bloqueado usar funciones Pro de
   * Beneficios? Pro = nunca bloqueado. Sin Pro: bloqueado solo si el trial de
   * 30 días YA arrancó (`Business.benefitsTrialStartedAt`) y venció, o si la
   * Subscription quedó PAST_DUE/CANCELED (Pro que no se renovó). Si el
   * trial nunca arrancó (LEGACY, Platform Admin) nunca se bloquea — no hay
   * nada que "vencer" todavía.
   *
   * ÚNICA fuente de verdad — todo el que necesita saber "¿está bloqueado
   * Beneficios Pro?" pregunta ACÁ, nunca reimplementa la condición:
   *  - `BenefitsService#create` (beneficio nuevo)
   *  - `BenefitsService#resolveActiveBenefit` (mostrar/emitir el activo a un
   *    cliente SIN una promesa previa — uno que ya tiene una
   *    `BenefitParticipation` sigue viéndolo y pudiendo canjear)
   *  - `BenefitsService#grantWelcomeGift` (regalo de bienvenida nuevo)
   *  - `BenefitsService#setRetentionBridge` (autorizar reactivación nueva)
   *  - `IncentiveIssuerService#issueForAssignment` (emitir el beneficio de
   *    una reactivación automática ya en curso — el re-check real, en el
   *    momento del envío, no solo al autorizar)
   *  - `RetentionV2BootstrapService#authorizedIncentiveIds` (qué generación
   *    construir: sin beneficios autorizados disponibles, degrada a
   *    CONTROL + REMINDER solo, sin variantes de beneficio)
   *  - `NotificationsPromotionsService#send` (promoción manual con Benefit)
   *
   * Nunca borra ni oculta catálogo/historial — solo bloquea ACCIONES
   * nuevas (ver `assertBenefitsProActionAllowed`). Nunca toca sellos: la
   * recompensa de tarjeta (`rewardGoalEligible`) es Free, independiente de
   * esto.
   */
  async isBenefitsBlocked(businessId: string): Promise<boolean> {
    const sub = await this.repository.findActiveSubscription(businessId);
    if (this.isProSubscription(sub)) return false;

    if (
      sub &&
      (sub.status === SubscriptionStatus.PAST_DUE ||
        sub.status === SubscriptionStatus.CANCELED)
    ) {
      return true;
    }

    const business = await this.repository.findBusinessTrialFields(businessId);
    if (!business?.benefitsTrialStartedAt || !business.benefitsTrialEndsAt) {
      return false;
    }
    return business.benefitsTrialEndsAt.getTime() < Date.now();
  }

  /**
   * Guard centralizado para TODA acción Pro de Beneficios — crear un
   * beneficio nuevo (`BenefitsService#create`), autorizar uno para
   * reactivación (`BenefitsService#setRetentionBridge`), o cualquier otra
   * que se agregue después. Un solo lugar, un solo mensaje — nada de
   * reglas repetidas por pantalla. Nunca borra nada: solo impide la acción.
   */
  async assertBenefitsProActionAllowed(businessId: string): Promise<void> {
    if (await this.isBenefitsBlocked(businessId)) {
      throw new ForbiddenException(
        'Tu prueba de 30 días terminó. Actualizá tu plan para seguir usando funciones Pro de Beneficios.',
      );
    }
  }

  /**
   * Da de alta la Subscription Free si el negocio todavía no tiene ninguna
   * — nunca pisa una Subscription existente (ver
   * `PlansRepository#createFreeSubscriptionIfMissing`). Se llama cada vez
   * que una capacidad self-service se prende por primera vez.
   */
  ensureFreeSubscriptionIfMissing(businessId: string, now: Date = new Date()) {
    return this.repository.createFreeSubscriptionIfMissing(businessId, now);
  }

  /**
   * Arranca el trial de 30 días de Beneficios si nunca corrió — idempotente,
   * no reinicia el reloj si se apaga/prende de nuevo el catálogo. Se llama
   * SIEMPRE que `benefitsEnabled` esté (o quede) en `true` la primera vez
   * que el negocio tiene un plan self-service — "Beneficios + sellos" no es
   * una excepción: sin esto, ese camino dejaría Beneficios Pro gratis para
   * siempre, que es exactamente el gap que esto cierra.
   */
  startBenefitsTrialIfNeeded(businessId: string, now: Date = new Date()) {
    return this.repository.startBenefitsTrialIfNeeded(businessId, now);
  }

  /**
   * Plan Pro self-service — el que Mercado Pago activa hoy y el que la
   * pantalla de Suscripción anuncia. Se asegura (upsert) en vez de solo
   * leer, para que la primera vez que alguien confirma un pago no dependa
   * de que el seed ya corrió.
   */
  ensureProSelfServicePlan() {
    return this.repository.ensureProSelfServicePlan();
  }

  /**
   * Estado self-service para mostrar en Programa/Beneficios: el tope de
   * clientes del plan (si aplica) y si el trial de Beneficios venció. Una
   * sola lectura de Subscription + Business — evita que cada pantalla vuelva
   * a calcular esto por separado.
   */
  async getSelfServiceStatus(businessId: string) {
    const [sub, business, benefitsTrialExpired] = await Promise.all([
      this.repository.findActiveSubscription(businessId),
      this.repository.findBusinessTrialFields(businessId),
      this.isBenefitsBlocked(businessId),
    ]);

    const isPro = this.isProSubscription(sub);

    return {
      maxCustomers: isPro ? null : (sub?.plan.maxCustomers ?? null),
      benefitsTrialExpired,
      trialEndsAt: business?.benefitsTrialEndsAt ?? null,
      isPro,
      planSlug: sub?.plan.slug ?? null,
      planName: sub?.plan.name ?? null,
    };
  }

  /**
   * Vista completa para Configuración → Suscripción: todo lo que la
   * pantalla necesita en una sola llamada, ya resuelto acá (no en el
   * frontend ni repetido en otra pantalla).
   *
   * `selfServicePro` es DELIBERADAMENTE independiente del plan actual del
   * negocio: es el precio que se anuncia para "Suscribirme" (UYU 1.000/mes),
   * no el precio de la Subscription que el negocio ya tiene — un negocio
   * Pro histórico (USD 129) ve su propio precio en `currency`/`priceAmount`,
   * pero la tarjeta de upgrade siempre anuncia el precio self-service real.
   */
  async getSubscriptionOverview(businessId: string) {
    const [sub, business, participantsCount, benefitsBlocked, selfServicePro] =
      await Promise.all([
        this.repository.findActiveSubscription(businessId),
        this.repository.findBusinessTrialFields(businessId),
        this.repository.countParticipatingCustomers(businessId),
        this.isBenefitsBlocked(businessId),
        this.repository.ensureProSelfServicePlan(),
      ]);

    const isPro = this.isProSubscription(sub);
    const trialStartedAt = business?.benefitsTrialStartedAt ?? null;
    const trialEndsAt = business?.benefitsTrialEndsAt ?? null;
    const trialActive = Boolean(
      trialStartedAt && trialEndsAt && !isPro && !benefitsBlocked,
    );
    const trialDaysRemaining = trialActive
      ? Math.max(
          0,
          Math.ceil((trialEndsAt!.getTime() - Date.now()) / 86_400_000),
        )
      : null;

    return {
      planSlug: sub?.plan.slug ?? 'free',
      planName: sub?.plan.name ?? 'Free — sellos y beneficios',
      status: sub?.status ?? null,
      isPro,
      // Pro nunca tiene tope de clientes ni de Beneficios; sin Subscription
      // (negocio anterior a esta feature) tampoco hay tope nuevo aplicado.
      maxCustomers: isPro ? null : (sub?.plan.maxCustomers ?? null),
      // Precio de LA SUBSCRIPTION ACTUAL de este negocio (puede ser Free/$0,
      // Pro histórico/USD, o Pro self-service/UYU) — nunca un valor inventado.
      currency: sub?.plan.currency ?? 'UYU',
      priceAmount: sub?.plan.priceAmount ?? 0,
      participantsCount,
      trialStartedAt,
      trialEndsAt,
      trialActive,
      trialDaysRemaining,
      benefitsBlocked,
      // Precio ANUNCIADO para upgrade — siempre UYU 1.000/mes, sin importar
      // el plan actual del negocio que está mirando la pantalla.
      selfServicePro: {
        currency: selfServicePro.currency,
        priceAmount: selfServicePro.priceAmount,
      },
    };
  }
}
