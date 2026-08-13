import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
import { resolveEffectiveAutomationState } from '../retention-v2/effective-automation-state';
import { messageKindOf, type MessageKind } from './message-kind';
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
  ) {}

  /** Todo lo que necesita la pestaña Automáticas, en una sola llamada. */
  async overview(businessId: string) {
    const [settings, incentives, resultsOverview] = await Promise.all([
      this.settingsFor(businessId),
      // El catálogo es de Programa. Notificaciones NO tiene uno propio: solo
      // marca cuáles de esos beneficios están autorizados para reactivación.
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
      this.results.forBusiness(businessId).catch(() => []),
    ]);

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

    const automations = [
      {
        key: 'cerca_del_premio' as const,
        enabled: effective.progressReminderEffective,
      },
      {
        key: 'te_extranamos' as const,
        enabled: effective.recoveryEnabled,
      },
    ];

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
      },
      benefits: incentives.map((i) => ({
        id: i.id,
        benefitId: i.benefitId,
        name: i.name,
        authorized: i.automationEligible,
      })),
      results: this.simpleResults(resultsOverview),
    };
  }

  /**
   * Prende y apaga las dos automatizaciones. Cada una escribe SU campo: no
   * son alias, así que prender los recordatorios de progreso no sale a
   * recuperar clientes inactivos ni al revés.
   */
  async updateAutomations(businessId: string, dto: UpdateAutomationsDto) {
    const current = await this.settingsFor(businessId);

    const progress = dto.cercaDelPremio ?? current.progressReminderEnabled;
    const reactivate = dto.teExtranamos ?? current.automaticCampaignsEnabled;

    /**
     * Todo en UNA transacción, porque es una sola decisión del dueño.
     *
     * Los tres writes están acoplados: los flags dicen qué automatizaciones
     * quiere, el kill switch dice si el motor corre, y la autorización dice
     * qué beneficios puede usar. Aplicados por separado, un fallo en el medio
     * deja estados que no representan ninguna decisión — el peor es el motor
     * apagado con los toggles prendidos, donde la pantalla dice "2 activas" y
     * no sale un solo mensaje.
     */
    await this.prisma.$transaction(async (tx) => {
      await tx.retentionSettings.upsert({
        where: { businessId },
        create: {
          businessId,
          progressReminderEnabled: progress,
          automaticCampaignsEnabled: reactivate,
        },
        update: {
          progressReminderEnabled: progress,
          automaticCampaignsEnabled: reactivate,
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
    const [messages, manualCampaigns] = await Promise.all([
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
                select: { benefit: { select: { title: true } } },
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
    ]);

    const automatic = messages.map((m) => ({
      id: m.id,
      at: m.sentAt ?? m.createdAt,
      kind: messageKindOf(m.retentionAssignment?.experiment.objective),
      // Los automáticos son de a uno: el destinatario ES la audiencia.
      recipientCount: 1,
      customer: m.customer,
      benefitName:
        m.retentionAssignment?.benefitParticipation?.benefit.title ?? null,
      sent: m.status !== 'failed' && m.status !== 'queued' ? 1 : 0,
      failed: m.status === 'failed' ? 1 : 0,
      state: stateOfMessage(m.status),
      message: null as string | null,
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
    }));

    return [...automatic, ...promotions]
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
        select: { retentionEngineV2Enabled: true },
      }),
    ]);

    // Sin fila todavía: se responden los defaults del schema en vez de
    // explotar. El dueño puede no haber pasado nunca por el onboarding.
    return {
      progressReminderEnabled: settings?.progressReminderEnabled ?? false,
      automaticCampaignsEnabled: settings?.automaticCampaignsEnabled ?? false,
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
  if (status === 'queued') return 'en_progreso';
  return 'enviado';
}
