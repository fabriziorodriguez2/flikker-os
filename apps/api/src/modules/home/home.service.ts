import { Injectable } from '@nestjs/common';
import { CustomerEventType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewsOverviewService } from '../reviews/reviews-overview.service';

/**
 * Inicio — la portada del producto.
 *
 * La regla que gobierna este archivo: **no define ninguna métrica propia**.
 * Cada número sale del servicio que ya es dueño de ese concepto:
 *
 *   Clientes activos / volvieron  → CustomerLoyaltyService (mismos KPIs que Clientes)
 *   Automatizaciones              → NotificationsService (mismos flags reales)
 *   Rating / reseñas nuevas       → ReviewsOverviewService (mismo período)
 *
 * Es deliberado y es la parte importante: si Inicio calculara "clientes
 * activos" por su cuenta, tarde o temprano mostraría un número distinto del
 * que muestra Clientes para el mismo negocio, y el dueño dejaría de confiar
 * en los dos. Lo único que se calcula acá es lo que no existe en ningún otro
 * lado: el estado del programa y la actividad reciente.
 */

const MS_PER_DAY = 86_400_000;

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly notifications: NotificationsService,
    private readonly reviews: ReviewsOverviewService,
  ) {}

  async overview(businessId: string, now: Date = new Date()) {
    const [loyalty, automations, reviews, program, activity, redeemed] =
      await Promise.all([
        this.loyalty.list(businessId, { limit: 1 }, now),
        this.notifications.overview(businessId).catch(() => null),
        this.reviews.forBusiness(businessId, 30, now),
        this.programState(businessId),
        this.recentActivity(businessId),
        // Fase de Programa nuevo — un beneficio canjeado ya NO implica una
        // tarjeta: retención automática, promociones manuales y tarjetas de
        // sellos comparten el mismo camino de canje (`BenefitParticipation.
        // redeemedAt` — ver `RedemptionService.closeRewardGoalIfRedeemed`,
        // que sincroniza el redeemedAt de la tarjeta con el de acá en el
        // mismo momento). Contar solo `CustomerRewardGoal` dejaba afuera todo
        // lo que no viene de una tarjeta; contar los dos hubiera duplicado
        // cada canje de tarjeta. Esta única cuenta cubre los tres orígenes
        // sin duplicar ninguno.
        this.prisma.benefitParticipation.count({
          where: {
            businessId,
            redeemedAt: { gte: new Date(now.getTime() - 30 * MS_PER_DAY) },
          },
        }),
      ]);

    return {
      periodDays: loyalty.kpis.windowDays,

      // Los tres primeros vienen tal cual de sus dueños. El cuarto es un
      // conteo directo de beneficios canjeados en la misma ventana (de
      // cualquier origen — ver el comentario arriba).
      kpis: {
        activeCustomers: loyalty.kpis.activos,
        returningCustomers: loyalty.kpis.volvieron,
        benefitsRedeemed: redeemed,
        newReviews: reviews.summary.inPeriod,
      },

      program,

      automations: automations
        ? {
            items: automations.automations,
            activeCount: automations.status.activeCount,
            testMode: automations.status.testMode,
            // Reenviados tal cual — NotificationsService ya los calculó, acá
            // no se reevalúa ningún flag ni regla de presupuesto.
            benefitsAutomation: automations.benefitsAutomation,
            authorizedBenefitsCount: automations.benefits.filter(
              (b) => b.authorized,
            ).length,
          }
        : null,

      reviews: {
        connected: reviews.google.connected,
        rating: reviews.summary.rating,
        newInPeriod: reviews.summary.inPeriod,
        toReviewCount: reviews.toReview.length,
      },

      activity,
    };
  }

  /**
   * Estado de Programa para Inicio. Beneficios y la tarjeta de sellos son dos
   * herramientas independientes (ver /dashboard/programa) — Inicio nunca
   * asume que la tarjeta está activa. `mode: 'stamps'` solo cuando el negocio
   * de verdad la tiene configurada (sellos + recompensa activos); en
   * cualquier otro caso (solo beneficios, o directamente nada todavía)
   * `mode: 'benefits'`, que cubre los dos sin dejar un hueco vacío de tarjeta.
   */
  private async programState(businessId: string) {
    const [settings, reward, business, benefitsCount, authorizedCount] =
      await Promise.all([
        this.prisma.retentionSettings.findUnique({
          where: { businessId },
          select: { rewardGoalsEnabled: true, rewardGoalMinVisits: true },
        }),
        this.prisma.retentionIncentiveDefinition.findFirst({
          where: { businessId, rewardGoalEligible: true, active: true },
          select: { name: true },
        }),
        this.prisma.business.findUnique({
          where: { id: businessId },
          select: {
            name: true,
            logoUrl: true,
            loyaltyCardColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
          },
        }),
        this.prisma.benefit.count({ where: { businessId } }),
        this.prisma.retentionIncentiveDefinition.count({
          where: { businessId, automationEligible: true, active: true },
        }),
      ]);

    if (settings?.rewardGoalsEnabled && reward) {
      const [participating, available] = await Promise.all([
        this.prisma.customerRewardGoal.count({
          where: { businessId, status: RewardGoalStatus.ACTIVE },
        }),
        this.prisma.customerRewardGoal.count({
          where: { businessId, status: RewardGoalStatus.UNLOCKED },
        }),
      ]);

      return {
        mode: 'stamps' as const,
        stampsRequired: settings.rewardGoalMinVisits,
        rewardName: reward.name,
        participating,
        available,
        // Mismo criterio que Programa → Sellos → Diseño: null = todavía
        // nunca tocó el diseño, sigue con la marca del negocio.
        isDefaultDesign: business?.loyaltyCardColor === null,
        businessName: business?.name ?? 'Tu negocio',
        appearance: {
          cardColor: business?.loyaltyCardColor ?? null,
          stampColor: business?.loyaltyStampColor ?? null,
          stampIcon: business?.loyaltyStampIcon ?? null,
          logoUrl: business?.logoUrl ?? null,
        },
      };
    }

    return {
      mode: 'benefits' as const,
      benefitsCount,
      authorizedForReactivationCount: authorizedCount,
    };
  }

  /**
   * Actividad reciente, de eventos que REALMENTE ocurrieron.
   *
   * Seis fuentes, tomadas las más recientes. No hay ninguna entrada
   * sintética: cada una corresponde a una fila real. Los nombres técnicos se
   * traducen en el frontend a partir de la clave, igual que en el detalle de
   * un cliente.
   *
   * Fase de Programa nuevo — una visita YA NO implica un sello: antes cada
   * `Visit` se etiquetaba `kind: 'sello'` sin importar si el negocio siquiera
   * tenía la tarjeta activa. Ahora es `'visita'` siempre (es lo único que un
   * `Visit` garantiza por sí solo), y los beneficios de Retention/promociones
   * — que existen con o sin tarjeta — tienen sus propios eventos, excluyendo
   * los que ya vienen de una tarjeta (`rewardGoal: null`) para no duplicar
   * lo que `unlocked`/`redeemed` ya cuentan como "desbloqueo"/"canje".
   */
  private async recentActivity(businessId: string, limit = 8) {
    const [visits, feedback, unlocked, redeemed, benefitReceived, benefitRedeemed] =
      await Promise.all([
        this.prisma.visit.findMany({
          where: { businessId },
          orderBy: { occurredAt: 'desc' },
          take: limit,
          select: {
            id: true,
            occurredAt: true,
            customer: { select: { id: true, name: true } },
          },
        }),
        this.prisma.checkinFeedback.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            createdAt: true,
            customer: { select: { id: true, name: true } },
          },
        }),
        this.prisma.customerRewardGoal.findMany({
          where: { businessId, unlockedAt: { not: null } },
          orderBy: { unlockedAt: 'desc' },
          take: limit,
          select: {
            id: true,
            unlockedAt: true,
            customer: { select: { id: true, name: true } },
            incentiveDefinition: { select: { name: true } },
          },
        }),
        this.prisma.customerRewardGoal.findMany({
          where: { businessId, redeemedAt: { not: null } },
          orderBy: { redeemedAt: 'desc' },
          take: limit,
          select: {
            id: true,
            redeemedAt: true,
            customer: { select: { id: true, name: true } },
            incentiveDefinition: { select: { name: true } },
          },
        }),
        // Beneficio recibido SIN tarjeta de por medio — reactivación
        // automática o promoción manual. `rewardGoal: null` es lo que evita
        // mostrar dos eventos ("desbloqueo" y "recibió un beneficio") para
        // el mismo instante cuando sí hay tarjeta.
        this.prisma.benefitParticipation.findMany({
          where: { businessId, rewardGoal: null },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            createdAt: true,
            benefitTitleSnapshot: true,
            benefit: { select: { title: true } },
            customer: { select: { id: true, name: true } },
          },
        }),
        this.prisma.benefitParticipation.findMany({
          where: { businessId, rewardGoal: null, redeemedAt: { not: null } },
          orderBy: { redeemedAt: 'desc' },
          take: limit,
          select: {
            id: true,
            redeemedAt: true,
            benefitTitleSnapshot: true,
            benefit: { select: { title: true } },
            customer: { select: { id: true, name: true } },
          },
        }),
      ]);

    const events = [
      ...visits.map((v) => ({
        id: `visit-${v.id}`,
        at: v.occurredAt,
        kind: 'visita' as const,
        customer: v.customer,
        rewardName: null as string | null,
      })),
      ...feedback.map((f) => ({
        id: `feedback-${f.id}`,
        at: f.createdAt,
        kind: 'feedback' as const,
        customer: f.customer,
        rewardName: null as string | null,
      })),
      ...unlocked.map((g) => ({
        id: `unlock-${g.id}`,
        at: g.unlockedAt!,
        kind: 'desbloqueo' as const,
        customer: g.customer,
        rewardName: g.incentiveDefinition.name,
      })),
      ...redeemed.map((g) => ({
        id: `redeem-${g.id}`,
        at: g.redeemedAt!,
        kind: 'canje' as const,
        customer: g.customer,
        rewardName: g.incentiveDefinition.name,
      })),
      ...benefitReceived.map((p) => ({
        id: `benefit-received-${p.id}`,
        at: p.createdAt,
        kind: 'beneficio_recibido' as const,
        customer: p.customer,
        rewardName: p.benefitTitleSnapshot ?? p.benefit.title,
      })),
      ...benefitRedeemed.map((p) => ({
        id: `benefit-redeemed-${p.id}`,
        at: p.redeemedAt!,
        kind: 'beneficio_canjeado' as const,
        customer: p.customer,
        rewardName: p.benefitTitleSnapshot ?? p.benefit.title,
      })),
    ];

    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  /**
   * Checklist de puesta en marcha — para las tareas de DESPUÉS del onboarding
   * nuevo, no para repetirlo. El onboarding ya resolvió negocio, estrategia
   * inicial y (opcionalmente) sellos — lo que sigue son recomendaciones
   * puntuales, nunca otro wizard:
   *
   *  - Activar o desactivar la tarjeta de sellos NO es una tarea pendiente:
   *    es una decisión ya tomada en el onboarding (o después, a propósito,
   *    desde Programa → Sellos). Por eso este checklist nunca pide
   *    "activar sellos", solo personalizar el diseño SI ya están activos.
   *  - Configurar automatizaciones tampoco: quedan con sus defaults
   *    (reactivación encendida) apenas termina el onboarding.
   *  - El QR ya existe siempre (se crea solo en el paso 1) — lo que se
   *    chequea acá es únicamente la señal de que algo se rompió (sin fuente
   *    activa), no un "generá tu QR". Descargarlo es una recomendación
   *    aparte, fuera de este checklist (ver Inicio → acciones rápidas).
   *
   * Solo devuelve lo que FALTA. Cuando no queda nada pendiente devuelve una
   * lista vacía y la sección desaparece de la pantalla — no queremos un
   * bloque "Primeros pasos" eterno recordándole al dueño cosas opcionales
   * como si fueran errores.
   */
  async setupTasks(businessId: string) {
    const [settings, reward, source, business, benefitsCount, events, notif] =
      await Promise.all([
        this.prisma.retentionSettings.findUnique({
          where: { businessId },
          select: { rewardGoalsEnabled: true },
        }),
        this.prisma.retentionIncentiveDefinition.findFirst({
          where: { businessId, rewardGoalEligible: true, active: true },
          select: { id: true },
        }),
        this.prisma.visitSource.findFirst({
          where: { businessId, isDefault: true },
          select: { id: true },
        }),
        this.prisma.business.findUnique({
          where: { id: businessId },
          select: { googleBusinessProfileUrl: true, loyaltyCardColor: true },
        }),
        this.prisma.benefit.count({ where: { businessId } }),
        this.prisma.customerEvent.count({
          where: { businessId, type: CustomerEventType.customer_registered },
        }),
        // Reusado, no reevaluado: NotificationsService ya sabe si hay
        // beneficios autorizados sin límite mensual configurado (Fase de
        // presupuesto) — Inicio solo lee esa conclusión.
        this.notifications.overview(businessId).catch(() => null),
      ]);

    const pending: string[] = [];
    if (!business?.googleBusinessProfileUrl) pending.push('google');
    // Solo si la tarjeta está ACTIVA de verdad — nunca "activá sellos".
    if (settings?.rewardGoalsEnabled && reward && !business?.loyaltyCardColor) {
      pending.push('personalizar-tarjeta');
    }
    // Optativo a propósito: la retención funciona igual sin ningún beneficio.
    if (benefitsCount === 0) pending.push('beneficio');
    // Un beneficio autorizado sin presupuesto configurado nunca se emite
    // (ver Notificaciones → Te extrañamos → Límite mensual) — esto SÍ es
    // bloqueante para ese beneficio en particular, no opcional.
    if (notif?.benefitsAutomation.status === 'necesita_limite') {
      pending.push('limite-beneficios');
    }
    // Caso de borde: en el flujo normal esto nunca pasa (el onboarding ya
    // crea el QR principal), pero si la fuente activa se borró, el check-in
    // no puede funcionar — eso sí es bloqueante de verdad.
    if (!source) pending.push('qr');
    if (pending.length === 0 && events === 0) pending.push('primer-cliente');

    return pending;
  }
}
