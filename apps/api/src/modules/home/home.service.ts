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
 * lado: el estado del programa, la actividad reciente y qué falta configurar.
 *
 * Rediseño (pedido explícito): todo en UNA sola llamada — `setupAlert` y
 * `setupTasks` se fusionaron acá adentro, ya no hay un `GET /home/setup`
 * aparte. Reusan datos que `overview()` ya pedía (`program`, `automations`,
 * `reviews`) en vez de volver a preguntarlos — la única query nueva de
 * verdad es la fuente de check-in y el conteo de registros, que no existían
 * en ningún otro lado de esta llamada.
 */

const MS_PER_DAY = 86_400_000;

export interface SetupAlert {
  type: 'digital_card_not_configured';
  title: string;
  description: string;
  href: string;
}

export interface SetupTask {
  id: string;
  title: string;
  description: string;
  href: string;
  optional?: boolean;
}

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly notifications: NotificationsService,
    private readonly reviews: ReviewsOverviewService,
  ) {}

  async overview(businessId: string, now: Date = new Date()) {
    const [
      loyalty,
      automations,
      reviews,
      program,
      activity,
      redeemed,
      hasCheckinSource,
      hasAnyCustomer,
    ] = await Promise.all([
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
      // Caso de borde real (§2 "Primeros pasos" / QR): en el flujo normal
      // esto nunca pasa (el onboarding crea la fuente principal en el paso
      // 1) — solo importa si esa fuente se borró después, porque ahí el
      // check-in deja de poder funcionar.
      this.prisma.visitSource.findFirst({
        where: { businessId, isDefault: true },
        select: { id: true },
      }),
      this.prisma.customerEvent.count({
        where: { businessId, type: CustomerEventType.customer_registered },
      }),
    ]);

    const benefitsAutomation = automations?.benefitsAutomation ?? null;

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

      // ── §1/§2 — alerta superior + "Primeros pasos" ─────────────────────
      setupAlert: this.buildSetupAlert(program),
      setupTasks: this.buildSetupTasks({
        program,
        googleConnected: reviews.google.connected,
        benefitsAutomationStatus: benefitsAutomation?.status ?? null,
        hasCheckinSource: hasCheckinSource !== null,
        hasAnyCustomer: hasAnyCustomer > 0,
      }),
    };
  }

  /**
   * §1 — Alerta tipo Fiddelik. Reusa `program` (ya calculado más arriba, con
   * el MISMO criterio que Programa → Configuración → Diseño): solo existe si
   * la tarjeta está activa de verdad (`mode: 'stamps'`) Y todavía tiene el
   * diseño default. Sin sellos, o con diseño ya personalizado: `null`, y el
   * banner no se muestra — no se agregó ninguna columna nueva, se derivó del
   * mismo `loyaltyCardColor === null` que ya usaba Programa.
   */
  private buildSetupAlert(
    program: Awaited<ReturnType<HomeService['programState']>>,
  ): SetupAlert | null {
    if (program.mode !== 'stamps' || !program.isDefaultDesign) return null;

    return {
      type: 'digital_card_not_configured',
      title: 'Tarjeta digital no configurada',
      description:
        'Terminá de personalizar tu tarjeta para que tus clientes la vean correctamente.',
      href: '/dashboard/programa?tab=configuracion&section=diseno',
    };
  }

  /**
   * §2 — "Primeros pasos". Cada tarea sale de una señal real, nunca de un
   * estado inventado. Deliberadamente NO incluye "Descargá tu QR": no existe
   * ningún campo que diga si el dueño ya lo descargó, y agregar uno solo
   * para esto sería inventar el estado que el pedido explícitamente prohíbe.
   */
  private buildSetupTasks(input: {
    program: Awaited<ReturnType<HomeService['programState']>>;
    googleConnected: boolean;
    benefitsAutomationStatus: string | null;
    hasCheckinSource: boolean;
    hasAnyCustomer: boolean;
  }): SetupTask[] {
    const tasks: SetupTask[] = [];

    if (!input.googleConnected) {
      tasks.push({
        id: 'google',
        title: 'Conectá Google',
        description:
          'Así los clientes que dejan una buena reseña pueden compartirla en Google.',
        href: '/dashboard/reviews',
      });
    }

    // Mismo criterio que la alerta — nunca "activá sellos", solo
    // personalizar el diseño de una tarjeta que YA está activa.
    if (input.program.mode === 'stamps' && input.program.isDefaultDesign) {
      tasks.push({
        id: 'personalizar-tarjeta',
        title: 'Personalizá tu tarjeta',
        description:
          'Elegí los colores y el sello que van a ver tus clientes.',
        href: '/dashboard/programa?tab=configuracion&section=diseno',
      });
    }

    // Optativo a propósito: la retención funciona igual sin ningún
    // beneficio (reminder-only).
    if (input.program.benefitsCount === 0) {
      tasks.push({
        id: 'beneficio',
        title: 'Creá tu primer beneficio',
        description:
          'Un descuento, un regalo o lo que quieras ofrecer — se usa en Programa y en Notificaciones.',
        href: '/dashboard/programa?tab=configuracion&section=beneficios',
        optional: true,
      });
    }

    // Bloqueante de verdad: un beneficio autorizado sin límite mensual
    // configurado nunca se emite (ver Notificaciones → Te extrañamos).
    if (input.benefitsAutomationStatus === 'necesita_limite') {
      tasks.push({
        id: 'limite-beneficios',
        title: 'Definí el límite mensual de beneficios',
        description:
          'Tenés beneficios autorizados para reactivar clientes, pero necesitan un tope mensual antes de poder enviarse.',
        href: '/dashboard/notificaciones',
      });
    }

    // Caso de borde real — ver comentario en `overview()`.
    if (!input.hasCheckinSource) {
      tasks.push({
        id: 'qr',
        title: 'Revisá tu QR',
        description:
          'No encontramos una fuente de check-in activa — sin esto tus clientes no pueden registrarse.',
        href: '/dashboard/qr',
      });
    }

    if (input.hasCheckinSource && !input.hasAnyCustomer) {
      tasks.push({
        id: 'primer-cliente',
        title: 'Conseguí tu primer cliente',
        description: 'Compartí tu QR o probalo vos mismo para ver cómo funciona.',
        href: '/dashboard/qr',
      });
    }

    return tasks;
  }

  /**
   * Estado de Programa para Inicio. Beneficios y la tarjeta de sellos son dos
   * herramientas independientes (ver /dashboard/programa) — Inicio nunca
   * asume que la tarjeta está activa. `mode: 'stamps'` solo cuando el negocio
   * de verdad la tiene configurada (sellos + recompensa activos); en
   * cualquier otro caso (solo beneficios, o directamente nada todavía)
   * `mode: 'benefits'`, que cubre los dos sin dejar un hueco vacío de tarjeta.
   *
   * `benefitsCount` viaja SIEMPRE, sin importar el modo — un negocio con
   * tarjeta activa puede además tener beneficios independientes, y
   * "Primeros pasos" necesita esa cuenta en los dos casos sin pedirla de
   * nuevo.
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
        benefitsCount,
      };
    }

    return {
      mode: 'benefits' as const,
      benefitsCount,
      authorizedForReactivationCount: authorizedCount,
      // Los dos campos de abajo solo tienen sentido en modo `stamps` — se
      // dejan en `false`/`null` acá para que `buildSetupAlert`/
      // `buildSetupTasks` puedan mirar `program.isDefaultDesign` sin
      // preguntar antes por el modo.
      isDefaultDesign: false,
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
}
