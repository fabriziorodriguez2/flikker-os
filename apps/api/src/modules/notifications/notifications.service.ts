import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, RetentionObjective } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
import { ReactivationFunnelService } from '../retention-v2/reactivation-funnel.service';
import { ReactivationFunnelSummaryService } from '../retention-v2/reactivation-funnel-summary.service';
import { RetentionExperimentService } from '../retention-v2/retention-experiment.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionBudgetService } from '../retention-v2/retention-budget.service';
import { resolveEffectiveAutomationState } from '../retention-v2/effective-automation-state';
import { RECOVERY_OBJECTIVES } from '../retention-v2/retention-v2-bootstrap-plan';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { PlansService } from '../plans/plans.service';
import { resolveAutomationState } from './automation-state';
import { resolveBenefitsAutomationStatus } from './benefits-automation-status';
import {
  emailMessageKindOf,
  messageKindOf,
  type MessageKind,
} from './message-kind';
import type { UpdateAutomationsDto } from './dto/update-automations.dto';
import type { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

/**
 * Notificaciones — fachada de producto sobre Retention V2.
 *
 * No hay dominio nuevo acá abajo: segmentación, elegibilidad, control,
 * outcomes, budget guards, atribución, optimización, workers, assignments y
 * experimentos siguen exactamente donde estaban y funcionando igual. Lo único
 * que cambia es lo que el dueño ve.
 *
 * Este archivo hace tres cosas y nada más:
 *  1. Lee los flags reales y los presenta como dos interruptores con nombre.
 *  2. Traduce resultados a frases que un dueño puede evaluar.
 *  3. Impide que el vocabulario interno salga hacia el panel.
 *
 * Sobre el punto 3: ni `objective`, ni `experiment`, ni `variant`, ni
 * `CONTROL`, ni `allocation`, ni `uplift`, ni `p-value`, ni `dryRun` aparecen
 * en ninguna respuesta de este servicio. Hay un test que lo verifica
 * serializando la respuesta entera y buscando esas palabras.
 */

/** Las dos automatizaciones que EXISTEN. No hay una tercera. */
export type AutomationKey = 'cerca_del_premio' | 'te_extranamos';

/**
 * Lectura simple de si la reactivación está funcionando. Deliberadamente
 * cualitativa: el dueño no tiene que interpretar un uplift ni un intervalo de
 * confianza, y Flikker no puede afirmar causalidad sin el grupo de control
 * que el motor ya mantiene.
 */
export type ResultSignal = 'aprendiendo' | 'mejora' | 'sin_diferencia';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: RetentionResultsOverviewService,
    private readonly reactivationFunnel: ReactivationFunnelService,
    private readonly reactivationFunnelSummary: ReactivationFunnelSummaryService,
    private readonly experiments: RetentionExperimentService,
    private readonly bootstrap: RetentionV2BootstrapService,
    private readonly retentionSettings: RetentionSettingsService,
    private readonly budget: RetentionBudgetService,
    private readonly programAudit: ProgramAuditService,
    private readonly whatsApp: WhatsAppBspService,
    private readonly plans: PlansService,
  ) {}

  /**
   * Todo lo que necesita la pestaña Automáticas, en una sola llamada.
   *
   * `includeResults` (default `true`, comportamiento sin cambios para todo
   * caller existente): `results.forBusiness()` es la parte más cara de este
   * método — un query por experimento (y, dentro, uno por variante) — y
   * `home.service.ts` la descarta por completo (solo lee `status`/
   * `benefitsAutomation`/`benefits`, nunca `results`). PERF: pasar `false`
   * ahí evita ese trabajo entero en vez de solo paralelizarlo.
   */
  async overview(
    businessId: string,
    now: Date = new Date(),
    options: { includeResults?: boolean } = {},
  ) {
    const includeResults = options.includeResults ?? true;
    const [
      settings,
      incentives,
      resultsOverview,
      reactivationFunnel,
      running,
      whatsappAvailable,
      proAccess,
    ] = await Promise.all([
      this.settingsFor(businessId),
      // El catálogo es de Programa. Notificaciones NO tiene uno propio:
      // solo marca cuáles de esos beneficios están autorizados para
      // reactivación.
      this.prisma.retentionIncentiveDefinition.findMany({
        where: { businessId, active: true },
        select: {
          id: true,
          name: true,
          benefitId: true,
          automationEligible: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      includeResults
        ? this.results.forBusiness(businessId).catch(() => [])
        : Promise.resolve([]),
      // Métrica principal de Reactivación (§ pedido explícito): mismo gate
      // de perf que `results` arriba — `home.service.ts` tampoco necesita
      // esto.
      includeResults
        ? this.reactivationFunnel.forBusiness(businessId).catch(() => null)
        : Promise.resolve(null),
      // §16/§17 — un GET nunca crea infraestructura (eso es
      // RetentionV2BootstrapService, llamado desde los triggers
      // explícitos: onboarding, este mismo toggle, y Programa. Acá solo
      // se LEE si ya existe un experiment válido y corriendo — "listo
      // para funcionar", no "funcionando ahora mismo".
      this.experiments.findUsableRunning(businessId),
      // Migración WHAPI → WaSenderAPI: antes era `Boolean(WHAPI_TOKEN)`
      // acá mismo. Ahora la pregunta la responde la abstracción — ver
      // `## Canal/status` en el informe.
      this.whatsApp.isChannelAvailable(),
      // Pro o trial Pro vigente — el ÚNICO lugar que decide si "Cumpleaños"
      // se puede prender y si el email adicional de "Casi llegás"/"Te
      // extrañamos" sale. Centralizado en PlansService (ver
      // hasProAccess) — nunca reevaluado acá.
      this.plans.hasProAccess(businessId),
    ]);

    const recoverySetupReady = running.some((e) =>
      RECOVERY_OBJECTIVES.includes(e.objective),
    );
    const progressSetupReady = running.some(
      (e) => e.objective === RetentionObjective.REWARD_GOAL_PROGRESS,
    );

    // Estado EFECTIVO, no el flag crudo: un negocio puede tener
    // `automaticCampaignsEnabled = true` (default del schema) con el kill
    // switch apagado, y en ese caso el worker no manda nada. Mostrar el flag
    // crudo diría "Activo" sobre una automatización que no corre. Ver
    // `effective-automation-state.ts` para la investigación completa.
    const effective = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: settings.engineEnabled,
      automaticCampaignsEnabled: settings.automaticCampaignsEnabled,
      progressReminderEnabled: settings.progressReminderEnabled,
    });

    // "Cerca del premio" solo existe como concepto si el negocio usa tarjeta
    // de sellos (`rewardGoalsEnabled`). Sin sellos no se muestra, no se
    // evalúa desde acá y no aparece en el conteo — no es "Inactivo", es
    // inexistente para este negocio.
    const automations = [
      ...(settings.rewardGoalsEnabled
        ? [
            {
              key: 'sellos_por_vencer' as const,
              state: settings.stampsExpiryEmailEnabled
                ? ('activo' as const)
                : ('inactivo' as const),
              // Free, siempre — sellos es Free y no depende de Retention V2
              // ni de ningún plan. WhatsApp real desde `StampsExpiryEmailService`
              // (nombre histórico — manda los dos canales).
              plan: 'free' as const,
              locked: false,
              channels: ['whatsapp', 'email'] as const,
            },
            {
              key: 'cerca_del_premio' as const,
              state: resolveAutomationState({
                toggledOn: effective.progressReminderEffective,
                dryRunEnabled: settings.dryRunEnabled,
                whatsappAvailable,
                setupReady: progressSetupReady,
              }),
              // El toggle en sí es Free (WhatsApp siempre sale); el email
              // adicional ("casi llegás") solo se suma si hay Pro — ver
              // `proAccess` en `status`, no un segundo flag por fila.
              plan: 'free' as const,
              locked: false,
              channels: proAccess
                ? (['whatsapp', 'email'] as const)
                : (['whatsapp'] as const),
            },
          ]
        : []),
      {
        key: 'cumpleanos' as const,
        state: settings.birthdayEmailEnabled
          ? ('activo' as const)
          : ('inactivo' as const),
        // Pro (o trial Pro vigente) — la única automatización de esta lista
        // sin ningún equivalente Free detrás.
        plan: 'pro' as const,
        locked: !proAccess,
        channels: ['whatsapp', 'email'] as const,
      },
      {
        key: 'te_extranamos' as const,
        state: resolveAutomationState({
          toggledOn: effective.recoveryEnabled,
          dryRunEnabled: settings.dryRunEnabled,
          whatsappAvailable,
          setupReady: recoverySetupReady,
        }),
        plan: 'free' as const,
        locked: false,
        channels: proAccess
          ? (['whatsapp', 'email'] as const)
          : (['whatsapp'] as const),
      },
      // `enabled` kept alongside `state` for the existing consumers
      // (activeCount, the toggle UI) — "Activo" is the only state that means
      // "genuinely sending" (§16: a fresh self-service business must never
      // read as eternally Activo con 0 infrastructure).
    ].map((a) => ({ ...a, enabled: a.state === 'activo' }));

    // §11 — a status independent of the automation's own on/off state.
    // "Te extrañamos" can be `activo` (sending reminders) while benefits sit
    // in any of these — reminder-only is a fully working product on its own.
    const anyAuthorized = incentives.some((i) => i.automationEligible);
    const hasAnyCap =
      this.retentionSettings.hasIncentiveBudgetConfigured(settings);
    const usage = anyAuthorized
      ? await this.budget.usageThisMonth(
          businessId,
          settings.timezone,
          now,
          settings.averageTicketAmount,
        )
      : { count: 0, cost: 0 };
    const benefitsAutomation = {
      status: resolveBenefitsAutomationStatus({
        anyAuthorized,
        hasAnyCap,
        quantityLimit: settings.maxAutomatedIncentivesPerMonth,
        usedThisMonth: usage.count,
      }),
      monthlyLimit: settings.maxAutomatedIncentivesPerMonth,
      usedThisMonth: usage.count,
    };

    return {
      automations,
      status: {
        activeCount: automations.filter((a) => a.enabled).length,
        /**
         * `dryRunEnabled` en lenguaje de producto: el motor decide a quién
         * contactaría pero no manda nada. Se expone como "modo de prueba"
         * porque el dueño necesita saberlo (si no, vería 0 enviados y
         * pensaría que algo está roto), pero nunca con la palabra dry run.
         */
        testMode: settings.dryRunEnabled,
        /** El kill switch del negocio. Si está apagado no sale nada. */
        engineEnabled: settings.engineEnabled,
        /**
         * El único estado de canal que existe de verdad hoy (ver
         * `## Canal` en el informe): "activo" si Flikker puede mandar
         * WhatsApp en este momento, "no_conectado" si no. No hay un tercer
         * estado "configurado pero no activo" que corresponda a algo real
         * en este sistema — inventarlo sería tan engañoso como decir
         * "Activo" sin canal.
         */
        channel: whatsappAvailable
          ? ('activo' as const)
          : ('no_conectado' as const),
        /** Pro o trial Pro vigente — ver PlansService.hasProAccess. */
        proAccess,
      },
      benefits: incentives.map((i) => ({
        id: i.id,
        benefitId: i.benefitId,
        name: i.name,
        authorized: i.automationEligible,
      })),
      benefitsAutomation,
      results: this.simpleResults(resultsOverview),
      // "X contactados → Y volvieron → Z% de recuperación" real, solo
      // Retención/Reactivación (nunca "cerca del premio") — ver
      // ReactivationFunnelService. `null` cuando no se pidió (`includeResults:
      // false`) o si el cálculo falló, nunca para fingir un cero real.
      reactivationFunnel,
    };
  }

  /** "Resumen de reactivación" — cacheado, no llama a IA en cada carga. */
  async reactivationFunnelSummaryView(businessId: string) {
    return this.reactivationFunnelSummary.getSummary(businessId);
  }

  /** Botón "Actualizar análisis" del resumen de reactivación. */
  async refreshReactivationFunnelSummary(businessId: string) {
    return this.reactivationFunnelSummary.getSummary(businessId, {
      forceRefresh: true,
    });
  }

  /**
   * Prende y apaga las dos automatizaciones. Cada una escribe SU campo: no
   * son alias, así que prender los recordatorios de progreso no sale a
   * recuperar clientes inactivos ni al revés.
   */
  async updateAutomations(
    businessId: string,
    dto: UpdateAutomationsDto,
    actorUserId?: string,
  ) {
    const current = await this.settingsFor(businessId);

    const progress = dto.cercaDelPremio ?? current.progressReminderEnabled;
    const reactivate = dto.teExtranamos ?? current.automaticCampaignsEnabled;
    const stampsExpiryEmail =
      dto.sellosPorVencer ?? current.stampsExpiryEmailEnabled;
    const birthdayEmail = dto.cumpleanos ?? current.birthdayEmailEnabled;

    // "Cumpleaños" es Pro — nunca confiar en que el frontend ya lo bloqueó.
    // Prenderlo sin acceso Pro (ni trial vigente) se rechaza acá, en el
    // único lugar que decide esto (PlansService.hasProAccess).
    if (birthdayEmail && !current.birthdayEmailEnabled) {
      if (!(await this.plans.hasProAccess(businessId))) {
        throw new ForbiddenException(
          'Cumpleaños es una función Pro. Actualizá tu plan para activarla.',
        );
      }
    }

    // El presupuesto se valida ANTES de escribir nada — nunca dejar un
    // beneficio autorizado sin forma de emitirse. Cubre las dos formas en
    // que este endpoint puede terminar con al menos un beneficio autorizado:
    // el dueño lo manda explícito en `benefitIds`, o ya había alguno
    // autorizado y este llamado no lo toca. Contra la base, no contra la
    // lista cruda: un id de otro negocio nunca llega a autorizarse (ver
    // `authorizeBenefits`), así que tampoco debe forzar a configurar un
    // presupuesto que nada va a usar.
    const willHaveAnyAuthorized =
      dto.benefitIds !== undefined
        ? dto.benefitIds.length > 0 &&
          (await this.prisma.retentionIncentiveDefinition.count({
            where: { businessId, id: { in: dto.benefitIds } },
          })) > 0
        : (await this.prisma.retentionIncentiveDefinition.count({
            where: { businessId, automationEligible: true },
          })) > 0;
    if (willHaveAnyAuthorized) {
      await this.retentionSettings.assertBudgetReadyToAuthorize(
        businessId,
        dto.automaticIncentiveMonthlyLimit,
      );
    }

    /**
     * Todo en UNA transacción, porque es una sola decisión del dueño.
     *
     * Los cuatro writes están acoplados: los flags dicen qué automatizaciones
     * quiere, el kill switch dice si el motor corre, la autorización dice qué
     * beneficios puede usar y el límite dice cuántos por mes. Aplicados por
     * separado, un fallo en el medio deja estados que no representan ninguna
     * decisión — el peor es un beneficio autorizado sin presupuesto real para
     * emitirlo, que es exactamente la contradicción que esto existe para
     * cerrar.
     */
    await this.prisma.$transaction(async (tx) => {
      await tx.retentionSettings.upsert({
        where: { businessId },
        create: {
          businessId,
          progressReminderEnabled: progress,
          automaticCampaignsEnabled: reactivate,
          stampsExpiryEmailEnabled: stampsExpiryEmail,
          birthdayEmailEnabled: birthdayEmail,
          ...(dto.automaticIncentiveMonthlyLimit !== undefined
            ? {
                maxAutomatedIncentivesPerMonth:
                  dto.automaticIncentiveMonthlyLimit,
              }
            : {}),
        },
        update: {
          progressReminderEnabled: progress,
          automaticCampaignsEnabled: reactivate,
          stampsExpiryEmailEnabled: stampsExpiryEmail,
          birthdayEmailEnabled: birthdayEmail,
          ...(dto.automaticIncentiveMonthlyLimit !== undefined
            ? {
                maxAutomatedIncentivesPerMonth:
                  dto.automaticIncentiveMonthlyLimit,
              }
            : {}),
        },
      });

      // El kill switch del negocio se prende si hay ALGUNA automatización
      // activa, y se apaga si no queda ninguna.
      await tx.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: progress || reactivate },
      });

      if (dto.benefitIds !== undefined) {
        await this.authorizeBenefits(tx, businessId, dto.benefitIds);
      }
    });

    // Historial — solo si el número realmente cambió, mismo criterio que ya
    // usa la autorización de beneficios (§13: no ampliar el audit log con
    // reafirmaciones de lo que ya estaba).
    if (
      dto.automaticIncentiveMonthlyLimit !== undefined &&
      dto.automaticIncentiveMonthlyLimit !==
        current.maxAutomatedIncentivesPerMonth
    ) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: 'automation_incentive_limit_changed',
        message: `Cambiaste el límite mensual de beneficios automáticos a ${dto.automaticIncentiveMonthlyLimit}`,
        metadata: {
          previous: current.maxAutomatedIncentivesPerMonth,
          next: dto.automaticIncentiveMonthlyLimit,
        },
      });
    }

    // Igual criterio — solo si el valor EFECTIVO cambió, nunca por reafirmar
    // el mismo estado. Es la única forma de distinguir después "el dueño lo
    // apagó" de "nunca se inicializó": sin esto, las dos situaciones dejan
    // exactamente el mismo booleano en la base y son indistinguibles.
    if (progress !== current.progressReminderEnabled) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: 'automation_toggled',
        message: progress
          ? 'Activaste Cerca del premio'
          : 'Desactivaste Cerca del premio',
        metadata: { automation: 'cerca_del_premio', enabled: progress },
      });
    }
    if (reactivate !== current.automaticCampaignsEnabled) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: 'automation_toggled',
        message: reactivate
          ? 'Activaste Te extrañamos'
          : 'Desactivaste Te extrañamos',
        metadata: { automation: 'te_extranamos', enabled: reactivate },
      });
    }
    if (stampsExpiryEmail !== current.stampsExpiryEmailEnabled) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: 'automation_toggled',
        message: stampsExpiryEmail
          ? 'Activaste el email de Sellos por vencer'
          : 'Desactivaste el email de Sellos por vencer',
        metadata: {
          automation: 'sellos_por_vencer',
          enabled: stampsExpiryEmail,
        },
      });
    }
    if (birthdayEmail !== current.birthdayEmailEnabled) {
      await this.programAudit.record({
        businessId,
        actorUserId,
        type: 'automation_toggled',
        message: birthdayEmail
          ? 'Activaste el email de Cumpleaños'
          : 'Desactivaste el email de Cumpleaños',
        metadata: { automation: 'cumpleanos', enabled: birthdayEmail },
      });
    }

    // §9 trigger B — this is a real, explicit action (the owner touched
    // Notificaciones), never a bare GET. Covers three cases in one call:
    // turning "Te extrañamos" on, turning "Cerca del premio" on, and
    // authorizing/de-authorizing a benefit (§6/§7 — a new generation only
    // gets built when the desired shape actually changed; otherwise this is
    // a fast no-op). A cap-only change never reaches this differently — the
    // authorized benefit set is unchanged, so bootstrap reports
    // `already_correct` and touches nothing (§14). Runs AFTER the
    // transaction above commits, so the kill switch is already correctly
    // set when `start()` re-checks it.
    await this.bootstrap.ensureDefaultRetentionSetup(businessId);

    return this.overview(businessId);
  }

  /**
   * Autorización explícita de beneficios para reactivación.
   *
   * Primero apaga TODO y después prende solo lo elegido: así una autorización
   * vieja nunca sobrevive a un cambio de opinión. Es el mismo invariante que
   * ya aplica el onboarding, y lo único que Retention V2 lee es
   * `automationEligible` — que sigue siendo la única puerta.
   */
  private async authorizeBenefits(
    tx: Prisma.TransactionClient,
    businessId: string,
    ids: string[],
  ) {
    await tx.retentionIncentiveDefinition.updateMany({
      where: { businessId, automationEligible: true },
      data: { automationEligible: false },
    });
    if (ids.length === 0) return;

    // `businessId` en el where: un id de otro negocio simplemente no matchea.
    await tx.retentionIncentiveDefinition.updateMany({
      where: { businessId, id: { in: ids } },
      data: { automationEligible: true },
    });
  }

  /**
   * Historial unificado: lo que mandó Flikker solo y lo que mandó el dueño.
   * Son dos modelos distintos (`Message` con su assignment, y las campañas
   * manuales), y el dueño no tiene por qué saberlo.
   */
  async history(businessId: string, limit = 50) {
    const [messages, manualCampaigns, emailLogs] = await Promise.all([
      this.prisma.message.findMany({
        where: { businessId, retentionAssignment: { isNot: null } },
        select: {
          id: true,
          status: true,
          sentAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
          retentionAssignment: {
            select: {
              experiment: { select: { objective: true } },
              benefitParticipation: {
                select: {
                  benefitTitleSnapshot: true,
                  benefit: { select: { title: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.manualCampaign.findMany({
        where: { businessId },
        select: {
          id: true,
          messageBody: true,
          sentCount: true,
          failedCount: true,
          createdAt: true,
          _count: { select: { contacts: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      // Lo que salió por email — canal adicional de las mismas
      // automatizaciones de arriba, más las dos que no tienen equivalente
      // WhatsApp (sellos por vencer, cumpleaños). Fila propia por envío: el
      // dueño ve exactamente qué salió y por qué canal, igual que WhatsApp.
      this.prisma.emailLog.findMany({
        where: { businessId },
        select: {
          id: true,
          kind: true,
          status: true,
          sentAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const automatic = messages.map((m) => ({
      id: m.id,
      at: m.sentAt ?? m.createdAt,
      kind: messageKindOf(m.retentionAssignment?.experiment.objective),
      // Los automáticos son de a uno: el destinatario ES la audiencia.
      recipientCount: 1,
      customer: m.customer,
      benefitName:
        m.retentionAssignment?.benefitParticipation?.benefitTitleSnapshot ??
        m.retentionAssignment?.benefitParticipation?.benefit.title ??
        null,
      sent: m.status !== 'failed' && m.status !== 'queued' ? 1 : 0,
      failed: m.status === 'failed' ? 1 : 0,
      state: stateOfMessage(m.status),
      message: null as string | null,
      channel: 'whatsapp' as const,
    }));

    const promotions = manualCampaigns.map((c) => ({
      id: c.id,
      at: c.createdAt,
      kind: 'promocion' as MessageKind,
      recipientCount: c._count.contacts,
      customer: null,
      benefitName: null,
      sent: c.sentCount,
      failed: c.failedCount,
      state:
        c.failedCount > 0 && c.sentCount === 0
          ? ('fallo' as const)
          : ('enviado' as const),
      message: c.messageBody,
      channel: 'whatsapp' as const,
    }));

    const emails = emailLogs.map((e) => ({
      id: e.id,
      at: e.sentAt ?? e.createdAt,
      kind: emailMessageKindOf(e.kind),
      recipientCount: 1,
      customer: e.customer,
      benefitName: null,
      sent: e.status === 'failed' ? 0 : 1,
      failed: e.status === 'failed' ? 1 : 0,
      state: e.status === 'failed' ? ('fallo' as const) : ('enviado' as const),
      message: null as string | null,
      channel: 'email' as const,
    }));

    return [...automatic, ...promotions, ...emails]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  /**
   * Los ajustes que el dueño necesita para decidir, y solo esos: cuándo se
   * puede mandar y cada cuánto. Todo lo demás (control, tamaños de muestra,
   * ventanas de atribución, topes de presupuesto, modo de optimización) queda
   * en su default interno — es necesario para que el motor sea seguro, no
   * para que el dueño elija.
   */
  async settings(businessId: string) {
    const s = await this.settingsFor(businessId);
    return {
      sendingHourStart: s.sendingHourStart,
      sendingHourEnd: s.sendingHourEnd,
      allowedSendingDays: s.allowedSendingDays,
      minimumDaysBetweenMessages: s.minimumDaysBetweenRetentionMessages,
      maximumMessagesPer30Days: s.maximumRetentionMessagesPer30Days,
      /** Solo informativo: si hay IA disponible para ayudar a redactar. */
      writingHelpAvailable: s.aiCopyEnabled,
    };
  }

  async updateSettings(businessId: string, dto: UpdateNotificationSettingsDto) {
    // Lista blanca explícita: este endpoint no puede tocar control,
    // optimización ni presupuesto ni por accidente.
    await this.prisma.retentionSettings.update({
      where: { businessId },
      data: {
        ...(dto.sendingHourStart !== undefined
          ? { sendingHourStart: dto.sendingHourStart }
          : {}),
        ...(dto.sendingHourEnd !== undefined
          ? { sendingHourEnd: dto.sendingHourEnd }
          : {}),
        ...(dto.allowedSendingDays !== undefined
          ? { allowedSendingDays: dto.allowedSendingDays }
          : {}),
        ...(dto.minimumDaysBetweenMessages !== undefined
          ? {
              minimumDaysBetweenRetentionMessages:
                dto.minimumDaysBetweenMessages,
            }
          : {}),
        ...(dto.maximumMessagesPer30Days !== undefined
          ? { maximumRetentionMessagesPer30Days: dto.maximumMessagesPer30Days }
          : {}),
      },
    });
    return this.settings(businessId);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async settingsFor(businessId: string) {
    const [settings, business] = await Promise.all([
      this.prisma.retentionSettings.findUnique({ where: { businessId } }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { retentionEngineV2Enabled: true, timezone: true },
      }),
    ]);

    // Sin fila todavía: se responden los defaults del schema en vez de
    // explotar. El dueño puede no haber pasado nunca por el onboarding.
    return {
      progressReminderEnabled: settings?.progressReminderEnabled ?? false,
      automaticCampaignsEnabled: settings?.automaticCampaignsEnabled ?? false,
      // "Sellos activos" — la misma fuente de verdad que Programa usa para
      // decidir si el negocio tiene tarjeta.
      rewardGoalsEnabled: settings?.rewardGoalsEnabled ?? false,
      stampsExpiryEmailEnabled: settings?.stampsExpiryEmailEnabled ?? false,
      birthdayEmailEnabled: settings?.birthdayEmailEnabled ?? false,
      dryRunEnabled: settings?.dryRunEnabled ?? false,
      sendingHourStart: settings?.sendingHourStart ?? 10,
      sendingHourEnd: settings?.sendingHourEnd ?? 20,
      allowedSendingDays: settings?.allowedSendingDays ?? [1, 2, 3, 4, 5, 6],
      minimumDaysBetweenRetentionMessages:
        settings?.minimumDaysBetweenRetentionMessages ?? 14,
      maximumRetentionMessagesPer30Days:
        settings?.maximumRetentionMessagesPer30Days ?? 2,
      aiCopyEnabled: settings?.aiCopyEnabled ?? false,
      engineEnabled: business?.retentionEngineV2Enabled ?? false,
      // El único presupuesto que este panel expone (§3/§4) — el tope
      // monetario (`maxEstimatedIncentiveCostPerMonth`) sigue siendo
      // configuración avanzada de Platform Admin, nunca mostrada acá.
      maxAutomatedIncentivesPerMonth:
        settings?.maxAutomatedIncentivesPerMonth ?? null,
      maxEstimatedIncentiveCostPerMonth:
        settings?.maxEstimatedIncentiveCostPerMonth ?? null,
      averageTicketAmount: settings?.averageTicketAmount ?? null,
      timezone: business?.timezone ?? 'America/Montevideo',
    };
  }

  /**
   * Resultados de la reactivación en tres números y una frase.
   *
   * Los números salen tal cual del motor. La frase sale del veredicto que el
   * motor YA calcula (`winner`), que nunca declara nada sin grupo de control
   * y sin muestra suficiente — por eso no se está afirmando causalidad por
   * nuestra cuenta: si el motor no concluye, acá decimos que está aprendiendo.
   */
  private simpleResults(
    overviews: {
      exposedCount: number;
      returnedCount: number;
      winner: { kind: string };
    }[],
  ): {
    contacted: number;
    returned: number;
    signal: ResultSignal;
  } {
    const contacted = overviews.reduce((sum, o) => sum + o.exposedCount, 0);
    const returned = overviews.reduce((sum, o) => sum + o.returnedCount, 0);
    const concluded = overviews.some((o) => o.winner.kind !== 'NO_CONCLUSION');

    // Dos números, no tres. Hubo un "Detectados" que salía del mismo
    // `exposedCount` que "Contactados": eran el mismo dato con dos nombres, y
    // dos KPIs que siempre coinciden le hacen creer al dueño que está viendo
    // cosas distintas. La población evaluada-pero-no-contactada existe en
    // `RetentionDecisionLog`; cuando se pueda leer de ahí, vuelve como métrica
    // propia y de verdad.
    return {
      contacted,
      returned,
      signal: concluded
        ? 'mejora'
        : contacted === 0
          ? 'aprendiendo'
          : 'sin_diferencia',
    };
  }
}

/** Estado de un mensaje en palabras, sin exponer el enum de la API. */
function stateOfMessage(status: string): 'enviado' | 'en_progreso' | 'fallo' {
  if (status === 'failed') return 'fallo';
  // `sending` es el claim atómico del dispatcher justo antes de llamar a
  // WhatsApp (ver RetentionV2MessageDispatchService) — todavía no se mandó.
  if (status === 'queued' || status === 'sending') return 'en_progreso';
  return 'enviado';
}
