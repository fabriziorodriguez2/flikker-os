import { Injectable } from '@nestjs/common';
import {
  CustomerSegment,
  ExperienceVersion,
  RetentionAssignmentStatus,
  RetentionExperimentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isBusinessOperational,
  OPERATIONAL_BUSINESS_SELECT,
} from '../../jobs/business-operational.guard';
import { REDIS_CONFIGURED } from '../../jobs/redis-connection';
import { computeVisitFrequency } from './visit-frequency';
import { segmentCustomer } from './segmentation';
import { evaluateEligibility } from './eligibility';
import { customersWithWhatsappMarketingConsent } from '../policy/marketing-consent';
import { resolveEffectiveAutomationState } from './effective-automation-state';
import { RetentionExperimentService } from './retention-experiment.service';
import { RetentionSettingsService } from './retention-settings.service';
import {
  BLOCKER_DESCRIPTIONS,
  dailyCronInstant,
  deriveBlockers,
} from './autopilot-diagnosis';

const MS_PER_DAY = 86_400_000;
const DECISION_LOG_WINDOW_DAYS = 30;
const DECISION_LOG_SAMPLE_LIMIT = 20_000;
const DEFAULT_EVALUATE_CRON = '0 9 * * *';

/**
 * "¿Por qué Autopilot no contactó a nadie?" — con las MISMAS funciones que
 * usa el motor (`segmentCustomer`, `evaluateEligibility`, `findUsableRunning`,
 * `isWithinSendingWindow`), nunca una segunda versión de sus reglas.
 *
 * Estrictamente de solo lectura (no usa `getOrCreate`) y solo agregados:
 * conteos por motivo, nunca nombres ni teléfonos.
 */
@Injectable()
export class AutopilotDiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly experiments: RetentionExperimentService,
    private readonly settingsService: RetentionSettingsService,
  ) {}

  async diagnose(businessId: string, now: Date = new Date()) {
    const [business, settings, running, experimentRows] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          ...OPERATIONAL_BUSINESS_SELECT,
          experienceVersion: true,
          retentionEngineV2Enabled: true,
          timezone: true,
        },
      }),
      this.prisma.retentionSettings.findUnique({ where: { businessId } }),
      this.experiments.findUsableRunning(businessId),
      this.prisma.retentionExperiment.findMany({
        where: { businessId },
        select: { objective: true, status: true, managedBySelfService: true },
      }),
    ]);
    if (!business) return null;

    const [customers, inactiveOrOptedOut, assignments, decisionRows] =
      await Promise.all([
        this.prisma.customer.findMany({
          where: { businessId, isActive: true, optedOut: false },
          select: {
            id: true,
            isActive: true,
            optedOut: true,
            phoneE164: true,
            visits: { select: { occurredAt: true } },
          },
        }),
        this.prisma.customer.count({
          where: { businessId, OR: [{ isActive: false }, { optedOut: true }] },
        }),
        this.prisma.retentionAssignment.findMany({
          where: { businessId },
          select: {
            experimentId: true,
            customerId: true,
            status: true,
            sentAt: true,
          },
        }),
        this.prisma.retentionDecisionLog.findMany({
          where: {
            businessId,
            createdAt: {
              gte: new Date(
                now.getTime() - DECISION_LOG_WINDOW_DAYS * MS_PER_DAY,
              ),
            },
          },
          select: { decisionCode: true, metadata: true },
          orderBy: { createdAt: 'desc' },
          take: DECISION_LOG_SAMPLE_LIMIT,
        }),
      ]);

    const automation = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: business.retentionEngineV2Enabled,
      automaticCampaignsEnabled: settings?.automaticCampaignsEnabled ?? false,
      progressReminderEnabled: settings?.progressReminderEnabled ?? false,
    });

    // Contactos previos por cliente, en memoria: una sola query para todos.
    const sentByCustomer = new Map<string, Date[]>();
    const assignedKeys = new Set<string>();
    const assignmentStatus: Record<RetentionAssignmentStatus, number> = {
      PENDING: 0,
      OBSERVING: 0,
      SENT: 0,
      SKIPPED: 0,
    };
    for (const a of assignments) {
      assignmentStatus[a.status] += 1;
      assignedKeys.add(`${a.experimentId}:${a.customerId}`);
      if (a.sentAt) {
        const list = sentByCustomer.get(a.customerId) ?? [];
        list.push(a.sentAt);
        sentByCustomer.set(a.customerId, list);
      }
    }

    const segments: Record<CustomerSegment, number> = {
      NEW: 0,
      REPEAT: 0,
      FREQUENT: 0,
      AT_RISK: 0,
      INACTIVE: 0,
      RECOVERED: 0,
    };
    const outcomes: Record<string, number> = {};
    let eligibleNow = 0;
    const consented = await customersWithWhatsappMarketingConsent(
      this.prisma,
      businessId,
      customers.map((c) => c.id),
    );

    for (const customer of customers) {
      const frequency = computeVisitFrequency(
        customer.visits.map((v) => v.occurredAt),
        now,
      );
      const sent = sentByCustomer.get(customer.id) ?? [];
      const lastInterventionAt = sent.length
        ? new Date(Math.max(...sent.map((d) => d.getTime())))
        : null;
      const { segment } = segmentCustomer({
        frequency,
        lastInterventionAt,
        now,
      });
      segments[segment] += 1;

      const experiment = this.experiments.resolveApplicable(running, segment);
      if (!experiment) {
        bump(outcomes, 'NO_CAMPAIGN_FOR_SEGMENT');
        continue;
      }
      if (!settings) {
        bump(outcomes, 'SETTINGS_NOT_INITIALIZED');
        continue;
      }

      const decision = evaluateEligibility({
        business: {
          isActive: business.isActive,
          experienceVersion: business.experienceVersion,
          retentionEngineV2Enabled: business.retentionEngineV2Enabled,
        },
        settings: {
          ...settings,
          automationEnabled: settings.automaticCampaignsEnabled,
        },
        customer: {
          ...customer,
          hasMarketingConsent: consented.has(customer.id),
        },
        segment,
        lastRetentionMessageAt: lastInterventionAt,
        retentionMessagesLast30Days: sent.filter(
          (d) => d.getTime() >= now.getTime() - 30 * MS_PER_DAY,
        ).length,
        alreadyAssigned: assignedKeys.has(`${experiment.id}:${customer.id}`),
        returnedSinceEvaluation: false,
        now,
      });
      if (decision.eligible) {
        eligibleNow += 1;
        bump(outcomes, 'ELIGIBLE');
      } else {
        bump(outcomes, decision.reasonCode);
      }
    }

    // El log guarda la causa real en metadata.reasonCode; el decisionCode
    // agrupa varias causas distintas bajo SKIPPED_ENGINE_DISABLED.
    const decisionLog: Record<string, number> = {};
    for (const row of decisionRows) {
      const meta = row.metadata;
      const reason =
        meta &&
        typeof meta === 'object' &&
        !Array.isArray(meta) &&
        typeof (meta as Record<string, unknown>).reasonCode === 'string'
          ? `${row.decisionCode}:${(meta as Record<string, unknown>).reasonCode as string}`
          : row.decisionCode;
      bump(decisionLog, reason);
    }

    const cronPattern =
      process.env.RETENTION_V2_EVALUATE_CRON ?? DEFAULT_EVALUATE_CRON;
    const serverTimeZone =
      process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const runInstant = dailyCronInstant(cronPattern, serverTimeZone, now);
    const dailyRunWithinSendingWindow =
      runInstant && settings
        ? this.settingsService.isWithinSendingWindow(
            settings,
            business.timezone,
            runInstant,
          )
        : null;

    const blockers = deriveBlockers({
      businessOperational: isBusinessOperational(business),
      isCheckinV2: business.experienceVersion === ExperienceVersion.CHECKIN_V2,
      engineEnabled: business.retentionEngineV2Enabled,
      settingsInitialized: settings !== null,
      recoveryEnabled: automation.recoveryEnabled,
      dryRunEnabled: settings?.dryRunEnabled ?? false,
      runningExperiments: running.length,
      queuesConfigured: REDIS_CONFIGURED,
      eligibleNow,
      contactableCustomers: customers.length,
      consentedCustomers: consented.size,
      pendingAssignments: assignmentStatus.PENDING,
      dailyRunWithinSendingWindow,
    });

    return {
      blockers: blockers.map((code) => ({
        code,
        description: BLOCKER_DESCRIPTIONS[code],
      })),
      engine: {
        experience: business.experienceVersion,
        engineEnabled: business.retentionEngineV2Enabled,
        recoveryEffective: automation.recoveryEnabled,
        progressReminderEffective: automation.progressReminderEffective,
        dryRunEnabled: settings?.dryRunEnabled ?? false,
        queuesConfigured: REDIS_CONFIGURED,
      },
      campaigns: {
        runningUsable: running.map((e) => e.objective),
        byStatus: countBy(experimentRows, (e) => e.status),
        draft: experimentRows.filter(
          (e) => e.status === RetentionExperimentStatus.DRAFT,
        ).length,
      },
      customers: {
        activeContactable: customers.length,
        withWhatsappConsent: consented.size,
        inactiveOrOptedOut,
        segments,
        evaluationToday: outcomes,
        eligibleNow,
      },
      contacts: { assignmentsByStatus: assignmentStatus },
      decisionLogLast30Days: decisionLog,
      schedule: {
        dailyRunServerTime: cronPattern,
        serverTimeZone,
        businessTimeZone: business.timezone,
        sendingHours: settings
          ? { from: settings.sendingHourStart, to: settings.sendingHourEnd }
          : null,
        dailyRunWithinSendingWindow,
      },
    };
  }
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const out: Record<string, number> = {};
  for (const row of rows) bump(out, key(row));
  return out;
}
