import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerSegment,
  IntelligenceReportKind,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../prisma/prisma.service';
import { InsightsRepository } from '../../insights/insights.repository';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { segmentCustomer } from '../../retention-v2/segmentation';
import type { ConversationScope } from '../conversations.service';
import {
  csvRow,
  deltas,
  monthRanges,
  percent,
  ratio,
  resolveRange,
  type Metric,
  type MetricDelta,
  type ResolvedRange,
} from './report-math';

const DEFAULT_TIMEZONE = 'America/Montevideo';
/** Para que Excel abra el CSV como UTF-8 (acentos). */
const BOM = String.fromCharCode(0xfeff);
const LOW_SAMPLE_VISITS = 20;
const MS_PER_DAY = 86_400_000;

/** Quién puede descargar un reporte: exportar saca datos del panel. */
export const REPORT_EXPORT_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
];

const NO_SALES_NOTE =
  'Flikker registra visitas (check-ins), canjes y reseñas; no registra compras ni ventas. Ningún número de este reporte es facturación ni ROI.';

const PERIOD_SOURCES = [
  'Visit',
  'Customer',
  'BenefitParticipation',
  'CheckinFeedback',
  'GoogleReview',
];
const COHORT_SOURCES = [
  'Customer',
  'Visit',
  'BenefitParticipation',
  'CheckinFeedback',
  'RetentionAssignment',
];

export interface ReportNotes {
  dataNotes: string[];
  assumptions: string[];
}

export interface PeriodBlock {
  label: string;
  from: string;
  to: string;
  partial: boolean;
  metrics: Metric[];
}

export type ReportMetrics =
  | { kind: 'PERIOD_SUMMARY'; period: PeriodBlock }
  | {
      kind: 'PERIOD_COMPARISON';
      periods: [PeriodBlock, PeriodBlock];
      deltas: MetricDelta[];
    }
  | {
      kind: 'CUSTOMER_COHORT';
      cohort: {
        from: string | null;
        to: string | null;
        metrics: Metric[];
        segments: Metric[];
      };
    }
  | {
      kind: 'MONTHLY';
      periods: [PeriodBlock, PeriodBlock];
      deltas: MetricDelta[];
      cohort: { metrics: Metric[]; segments: Metric[] };
    };

export interface ReportContext {
  scope: ConversationScope;
  role: MembershipRole;
  conversationId: string | null;
  now: Date;
}

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  NEW: 'Nuevos (una visita, todavía en tiempo de volver)',
  REPEAT: 'Recurrentes',
  FREQUENT: 'Frecuentes',
  AT_RISK: 'En riesgo',
  INACTIVE: 'Inactivos',
  RECOVERED: 'Recuperados',
};

/**
 * Reportes deterministas de Intelligence. Todo número sale de una query
 * acotada al negocio de la sesión; el modelo solo los interpreta. Reutiliza
 * los conteos por rango de `InsightsRepository` (los mismos que usan los
 * emails de ciclo de vida) y la segmentación del motor de retención.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsRepository,
  ) {}

  async periodReport(ctx: ReportContext, from: unknown, to: unknown) {
    const timezone = await this.timezoneOf(ctx.scope.businessId);
    const range = resolveRange(from, to, timezone, ctx.now);
    const period = await this.periodBlock(
      ctx.scope.businessId,
      range,
      'Período',
    );
    return this.save(ctx, {
      kind: IntelligenceReportKind.PERIOD_SUMMARY,
      title: `Resumen del ${range.fromDay} al ${range.toDay}`,
      range,
      timezone,
      params: { from: range.fromDay, to: range.toDay },
      metrics: { kind: 'PERIOD_SUMMARY', period },
      sources: PERIOD_SOURCES,
      notes: this.periodNotes([period], timezone),
    });
  }

  async comparisonReport(
    ctx: ReportContext,
    a: { from: unknown; to: unknown },
    b: { from: unknown; to: unknown },
  ) {
    const timezone = await this.timezoneOf(ctx.scope.businessId);
    const rangeA = resolveRange(a.from, a.to, timezone, ctx.now);
    const rangeB = resolveRange(b.from, b.to, timezone, ctx.now);
    const [periodA, periodB] = await Promise.all([
      this.periodBlock(ctx.scope.businessId, rangeA, 'Período A'),
      this.periodBlock(ctx.scope.businessId, rangeB, 'Período B'),
    ]);
    const notes = this.periodNotes([periodA, periodB], timezone);
    const lengthA = rangeA.end.getTime() - rangeA.start.getTime();
    const lengthB = rangeB.end.getTime() - rangeB.start.getTime();
    if (Math.abs(lengthA - lengthB) > MS_PER_DAY) {
      notes.dataNotes.push(
        'Los dos períodos no tienen la misma duración: compará totales con cuidado, los porcentajes son más comparables.',
      );
    }
    return this.save(ctx, {
      kind: IntelligenceReportKind.PERIOD_COMPARISON,
      title: `Comparación ${rangeA.fromDay}–${rangeA.toDay} vs ${rangeB.fromDay}–${rangeB.toDay}`,
      range: null,
      timezone,
      params: {
        a: { from: rangeA.fromDay, to: rangeA.toDay },
        b: { from: rangeB.fromDay, to: rangeB.toDay },
      },
      metrics: {
        kind: 'PERIOD_COMPARISON',
        periods: [periodA, periodB],
        deltas: deltas(periodA.metrics, periodB.metrics),
      },
      sources: PERIOD_SOURCES,
      notes,
    });
  }

  async cohortReport(ctx: ReportContext, from: unknown, to: unknown) {
    const timezone = await this.timezoneOf(ctx.scope.businessId);
    const range =
      from === null && to === null
        ? null
        : resolveRange(from, to, timezone, ctx.now);
    const cohort = await this.cohortBlock(ctx.scope.businessId, range, ctx.now);
    return this.save(ctx, {
      kind: IntelligenceReportKind.CUSTOMER_COHORT,
      title: range
        ? `Clientes registrados del ${range.fromDay} al ${range.toDay}`
        : 'Todos los clientes registrados',
      range,
      timezone,
      params: { from: range?.fromDay ?? null, to: range?.toDay ?? null },
      metrics: {
        kind: 'CUSTOMER_COHORT',
        cohort: {
          from: range?.fromDay ?? null,
          to: range?.toDay ?? null,
          ...cohort,
        },
      },
      sources: COHORT_SOURCES,
      notes: {
        dataNotes: [
          NO_SALES_NOTE,
          'Los segmentos son el estado de HOY de esos clientes, calculado con el mismo criterio que usa Autopilot.',
        ],
        assumptions: [
          'Un cliente "volvió" si tiene una segunda visita dentro de los 30 días posteriores a la primera.',
          'Contactable = cliente activo, con teléfono y que no pidió dejar de recibir mensajes.',
        ],
      },
    });
  }

  async monthlyReport(ctx: ReportContext, month: unknown) {
    const timezone = await this.timezoneOf(ctx.scope.businessId);
    const { current, previous } = monthRanges(month, timezone, ctx.now);
    const [periodCurrent, periodPrevious, cohort] = await Promise.all([
      this.periodBlock(ctx.scope.businessId, current, 'Mes'),
      this.periodBlock(ctx.scope.businessId, previous, 'Mes anterior'),
      this.cohortBlock(ctx.scope.businessId, current, ctx.now),
    ]);
    const notes = this.periodNotes([periodCurrent, periodPrevious], timezone);
    notes.assumptions.push(
      'La cohorte del informe son los clientes registrados en el mes.',
    );
    return this.save(ctx, {
      kind: IntelligenceReportKind.MONTHLY,
      title: `Informe mensual ${String(month)}`,
      range: current,
      timezone,
      params: { month },
      metrics: {
        kind: 'MONTHLY',
        periods: [periodPrevious, periodCurrent],
        deltas: deltas(periodPrevious.metrics, periodCurrent.metrics),
        cohort,
      },
      sources: [...new Set([...PERIOD_SOURCES, ...COHORT_SOURCES])],
      notes,
    });
  }

  /** Un reporte guardado: solo quien lo generó, dentro de su negocio. */
  async get(scope: ConversationScope, id: string, role: MembershipRole) {
    const report = await this.prisma.intelligenceReport.findFirst({
      where: {
        id,
        businessId: scope.businessId,
        createdByUserId: scope.userId,
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return {
      id: report.id,
      kind: report.kind,
      title: report.title,
      periodFrom: report.periodFrom,
      periodTo: report.periodTo,
      timezone: report.timezone,
      params: report.params,
      metrics: report.metrics as unknown as ReportMetrics,
      sources: report.sources as string[],
      notes: report.notes as unknown as ReportNotes,
      computedAt: report.computedAt,
      canExport: REPORT_EXPORT_ROLES.includes(role),
    };
  }

  async exportCsv(scope: ConversationScope, id: string, role: MembershipRole) {
    const report = await this.get(scope, id, role);
    const lines = [
      csvRow(['Reporte', report.title]),
      csvRow(['Generado', report.computedAt.toISOString()]),
      csvRow(['Zona horaria', report.timezone]),
      csvRow(['Fuentes', report.sources.join(' · ')]),
      ...report.notes.dataNotes.map((n) => csvRow(['Nota', n])),
      ...report.notes.assumptions.map((n) => csvRow(['Supuesto', n])),
      '',
      csvRow([
        'Sección',
        'Métrica',
        'Clave',
        'Valor',
        'Unidad',
        'Numerador',
        'Denominador',
        'Definición',
      ]),
      ...flattenRows(report.metrics).map((r) =>
        csvRow([
          r.section,
          r.label,
          r.key,
          r.value,
          r.unit,
          r.numerator,
          r.denominator,
          r.definition,
        ]),
      ),
    ];
    return {
      filename: `reporte-${report.id.slice(0, 8)}.csv`,
      body: `${BOM}${lines.join('\r\n')}\r\n`,
    };
  }

  async exportPdf(scope: ConversationScope, id: string, role: MembershipRole) {
    const report = await this.get(scope, id, role);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(16).text(report.title);
      doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#555555');
      doc.text(
        `Generado: ${report.computedAt.toISOString()} · Zona horaria: ${report.timezone}`,
      );
      doc.text(`Fuentes: ${report.sources.join(', ')}`);
      doc.moveDown(0.6).fillColor('#000000');

      let section = '';
      for (const row of flattenRows(report.metrics)) {
        if (row.section !== section) {
          section = row.section;
          doc.moveDown(0.5).font('Helvetica-Bold').fontSize(11).text(section);
          doc.font('Helvetica').fontSize(10);
        }
        const base =
          row.numerator !== undefined && row.denominator !== undefined
            ? ` (${row.numerator} de ${row.denominator})`
            : '';
        doc.text(`${row.label}: ${formatValue(row.value, row.unit)}${base}`);
      }

      doc
        .moveDown(0.8)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Notas y supuestos');
      doc.font('Helvetica').fontSize(9);
      for (const note of [
        ...report.notes.dataNotes,
        ...report.notes.assumptions,
      ]) {
        doc.text(`• ${note}`);
      }
      doc.end();
    });
    return { filename: `reporte-${report.id.slice(0, 8)}.pdf`, body: buffer };
  }

  // ── Cálculos ─────────────────────────────────────────────────────────────

  private async periodBlock(
    businessId: string,
    range: ResolvedRange,
    label: string,
  ): Promise<PeriodBlock> {
    const { start, end } = range;
    const [
      registered,
      visits,
      activeRows,
      returning,
      redeemed,
      feedback,
      reviews,
    ] = await Promise.all([
      this.insights.countNewCustomersInRange(businessId, start, end),
      this.prisma.visit.count({
        where: { businessId, occurredAt: { gte: start, lt: end } },
      }),
      this.prisma.visit.findMany({
        where: { businessId, occurredAt: { gte: start, lt: end } },
        select: { customerId: true },
        distinct: ['customerId'],
      }),
      this.insights.countReturningCustomersInRange(businessId, start, end),
      this.insights.countBenefitsRedeemedInRange(businessId, start, end),
      this.prisma.checkinFeedback.aggregate({
        where: { businessId, createdAt: { gte: start, lt: end } },
        _count: { _all: true },
        _avg: { score: true },
      }),
      this.insights.countReviewsInRange(businessId, start, end),
    ]);
    const active = activeRows.length;
    const firstTime = active - returning;
    const avgScore =
      feedback._avg.score === null
        ? null
        : Math.round(feedback._avg.score * 10) / 10;

    return {
      label,
      from: range.fromDay,
      to: range.toDay,
      partial: range.partial,
      metrics: [
        {
          key: 'registeredCustomers',
          label: 'Clientes registrados',
          value: registered,
          unit: 'count',
          definition: 'Clientes dados de alta en el período.',
        },
        {
          key: 'visits',
          label: 'Visitas',
          value: visits,
          unit: 'count',
          definition: 'Check-ins registrados en el período.',
        },
        {
          key: 'activeCustomers',
          label: 'Clientes que visitaron',
          value: active,
          unit: 'count',
          definition:
            'Clientes distintos con al menos una visita en el período.',
        },
        {
          key: 'returningCustomers',
          label: 'Clientes que volvieron',
          value: returning,
          unit: 'count',
          definition:
            'Visitaron en el período y ya tenían una visita anterior.',
        },
        {
          key: 'firstTimeVisitors',
          label: 'Clientes en su primera visita',
          value: firstTime,
          unit: 'count',
          definition: 'Visitaron en el período y nunca antes.',
        },
        {
          key: 'recurrenceRatePercent',
          label: 'Recurrencia',
          value: percent(returning, active),
          unit: 'percent',
          numerator: returning,
          denominator: active,
          definition: 'Clientes que volvieron sobre clientes que visitaron.',
        },
        {
          key: 'visitsPerActiveCustomer',
          label: 'Visitas por cliente',
          value: ratio(visits, active),
          unit: 'ratio',
          numerator: visits,
          denominator: active,
          definition: 'Visitas sobre clientes que visitaron.',
        },
        {
          key: 'benefitsRedeemed',
          label: 'Beneficios canjeados',
          value: redeemed,
          unit: 'count',
          definition: 'Beneficios marcados como usados en el período.',
        },
        {
          key: 'privateFeedback',
          label: 'Feedback privado',
          value: feedback._count._all,
          unit: 'count',
          definition: 'Respuestas de feedback después de una visita.',
        },
        {
          key: 'privateFeedbackAvgScore',
          label: 'Puntaje promedio del feedback',
          value: avgScore,
          unit: 'score',
          numerator: undefined,
          denominator: feedback._count._all,
          definition:
            'Promedio de 1 a 5 de las respuestas de feedback del período.',
        },
        {
          key: 'googleReviews',
          label: 'Reseñas nuevas en Google',
          value: reviews,
          unit: 'count',
          definition: 'Reseñas de Google publicadas en el período.',
        },
      ],
    };
  }

  private async cohortBlock(
    businessId: string,
    range: ResolvedRange | null,
    now: Date,
  ) {
    const customers = await this.prisma.customer.findMany({
      where: {
        businessId,
        ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: {
        id: true,
        isActive: true,
        optedOut: true,
        phoneE164: true,
        visits: {
          select: { occurredAt: true },
          orderBy: { occurredAt: 'asc' },
        },
      },
    });
    const ids = customers.map((c) => c.id);
    const [redeemedRows, feedbackRows, contactRows] = ids.length
      ? await Promise.all([
          this.prisma.benefitParticipation.groupBy({
            by: ['customerId'],
            where: {
              businessId,
              customerId: { in: ids },
              redeemedAt: { not: null },
            },
          }),
          this.prisma.checkinFeedback.groupBy({
            by: ['customerId'],
            where: { businessId, customerId: { in: ids } },
          }),
          this.prisma.retentionAssignment.findMany({
            where: {
              businessId,
              customerId: { in: ids },
              sentAt: { not: null },
            },
            select: { customerId: true, sentAt: true },
          }),
        ])
      : [[], [], []];

    const redeemed = new Set(redeemedRows.map((r) => r.customerId));
    const gaveFeedback = new Set(feedbackRows.map((r) => r.customerId));
    const lastContact = new Map<string, Date>();
    for (const row of contactRows) {
      const prev = lastContact.get(row.customerId);
      if (row.sentAt && (!prev || row.sentAt > prev))
        lastContact.set(row.customerId, row.sentAt);
    }

    let noVisits = 0;
    let oneVisit = 0;
    let twoOrMore = 0;
    let withVisits = 0;
    let returnedWithin30 = 0;
    let contactable = 0;
    const segments: Record<CustomerSegment, number> = {
      NEW: 0,
      REPEAT: 0,
      FREQUENT: 0,
      AT_RISK: 0,
      INACTIVE: 0,
      RECOVERED: 0,
    };

    for (const customer of customers) {
      const dates = customer.visits.map((v) => v.occurredAt);
      if (dates.length === 0) noVisits += 1;
      else if (dates.length === 1) oneVisit += 1;
      else twoOrMore += 1;
      if (dates.length > 0) {
        withVisits += 1;
        if (
          dates.length > 1 &&
          dates[1].getTime() - dates[0].getTime() <= 30 * MS_PER_DAY
        ) {
          returnedWithin30 += 1;
        }
      }
      if (customer.isActive && !customer.optedOut && customer.phoneE164.trim())
        contactable += 1;
      const { segment } = segmentCustomer({
        frequency: computeVisitFrequency(dates, now),
        lastInterventionAt: lastContact.get(customer.id) ?? null,
        now,
      });
      segments[segment] += 1;
    }

    const total = customers.length;
    const share = (n: number) => ({ numerator: n, denominator: total });
    const metrics: Metric[] = [
      {
        key: 'customers',
        label: 'Clientes de la cohorte',
        value: total,
        unit: 'count',
        definition: 'Clientes registrados en el rango (o todos).',
      },
      {
        key: 'noVisits',
        label: 'Sin visitas registradas',
        value: noVisits,
        unit: 'count',
        definition: 'Registrados que nunca hicieron check-in.',
      },
      {
        key: 'oneVisit',
        label: 'Con una sola visita',
        value: oneVisit,
        unit: 'count',
        definition: 'Clientes con exactamente una visita.',
      },
      {
        key: 'twoOrMoreVisits',
        label: 'Con dos o más visitas',
        value: twoOrMore,
        unit: 'count',
        definition: 'Clientes que volvieron al menos una vez.',
      },
      {
        key: 'twoOrMoreVisitsPercent',
        label: 'Porcentaje que volvió',
        value: percent(twoOrMore, total),
        unit: 'percent',
        ...share(twoOrMore),
        definition: 'Con dos o más visitas sobre el total de la cohorte.',
      },
      {
        key: 'returnedWithin30DaysPercent',
        label: 'Volvieron dentro de 30 días',
        value: percent(returnedWithin30, withVisits),
        unit: 'percent',
        numerator: returnedWithin30,
        denominator: withVisits,
        definition:
          'Segunda visita a 30 días o menos de la primera, sobre clientes con al menos una visita.',
      },
      {
        key: 'redeemedAnyBenefit',
        label: 'Canjearon algún beneficio',
        value: redeemed.size,
        unit: 'count',
        definition: 'Clientes con al menos un beneficio canjeado.',
      },
      {
        key: 'gaveFeedback',
        label: 'Dejaron feedback',
        value: gaveFeedback.size,
        unit: 'count',
        definition: 'Clientes con al menos una respuesta de feedback.',
      },
      {
        key: 'contactable',
        label: 'Contactables',
        value: contactable,
        unit: 'count',
        definition: 'Activos, con teléfono y sin baja de mensajes.',
      },
    ];
    const segmentMetrics: Metric[] = (
      Object.keys(segments) as CustomerSegment[]
    ).map((segment) => ({
      key: `segment_${segment}`,
      label: SEGMENT_LABELS[segment],
      value: segments[segment],
      unit: 'count',
      numerator: segments[segment],
      denominator: total,
      definition: 'Segmento actual según su historial de visitas.',
    }));
    return { metrics, segments: segmentMetrics };
  }

  private periodNotes(periods: PeriodBlock[], timezone: string): ReportNotes {
    const dataNotes = [NO_SALES_NOTE];
    for (const period of periods) {
      const visits = period.metrics.find((m) => m.key === 'visits')?.value ?? 0;
      if (visits < LOW_SAMPLE_VISITS) {
        dataNotes.push(
          `${period.label} (${period.from} a ${period.to}): muestra chica, menos de ${LOW_SAMPLE_VISITS} visitas. Las variaciones porcentuales no son confiables.`,
        );
      }
      if (period.partial) {
        dataNotes.push(
          `${period.label} todavía no terminó: incluye datos hasta hoy.`,
        );
      }
    }
    return {
      dataNotes,
      assumptions: [
        `Días calculados en hora local (${timezone}).`,
        'Un cliente "volvió" si visitó en el período y ya tenía una visita anterior.',
      ],
    };
  }

  private async timezoneOf(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    return business?.timezone ?? DEFAULT_TIMEZONE;
  }

  private async save(
    ctx: ReportContext,
    input: {
      kind: IntelligenceReportKind;
      title: string;
      range: ResolvedRange | null;
      timezone: string;
      params: Record<string, unknown>;
      metrics: ReportMetrics;
      sources: string[];
      notes: ReportNotes;
    },
  ) {
    const report = await this.prisma.intelligenceReport.create({
      data: {
        businessId: ctx.scope.businessId,
        createdByUserId: ctx.scope.userId,
        conversationId: ctx.conversationId,
        kind: input.kind,
        title: input.title,
        periodFrom: input.range?.start ?? null,
        periodTo: input.range?.end ?? null,
        timezone: input.timezone,
        params: input.params as Prisma.InputJsonObject,
        metrics: JSON.parse(
          JSON.stringify(input.metrics),
        ) as Prisma.InputJsonObject,
        sources: input.sources,
        notes: input.notes as unknown as Prisma.InputJsonObject,
        computedAt: ctx.now,
      },
      select: { id: true, computedAt: true },
    });
    return {
      reportId: report.id,
      title: input.title,
      timezone: input.timezone,
      computedAt: report.computedAt.toISOString(),
      metrics: input.metrics,
      notes: input.notes,
      sources: input.sources,
    };
  }
}

interface FlatRow {
  section: string;
  key: string;
  label: string;
  value: number | null;
  unit: string;
  numerator?: number;
  denominator?: number;
  definition: string;
}

/** Todas las métricas de cualquier tipo de reporte, en filas, para CSV/PDF. */
export function flattenRows(metrics: ReportMetrics): FlatRow[] {
  const fromBlock = (section: string, list: Metric[]): FlatRow[] =>
    list.map((m) => ({
      section,
      key: m.key,
      label: m.label,
      value: m.value,
      unit: m.unit,
      numerator: m.numerator,
      denominator: m.denominator,
      definition: m.definition,
    }));
  const fromDeltas = (list: MetricDelta[]): FlatRow[] =>
    list.flatMap((d) => [
      {
        section: 'Variación',
        key: `${d.key}.absolute`,
        label: `${d.label} (diferencia)`,
        value: d.absolute,
        unit: d.unit === 'percent' ? 'points' : d.unit,
        definition: 'B − A.',
      },
      {
        section: 'Variación',
        key: `${d.key}.percentChange`,
        label: `${d.label} (variación %)`,
        value: d.percentChange,
        unit: 'percent',
        definition: 'Variación porcentual de A a B; vacía si A es 0.',
      },
    ]);

  switch (metrics.kind) {
    case 'PERIOD_SUMMARY':
      return fromBlock(
        `${metrics.period.from} a ${metrics.period.to}`,
        metrics.period.metrics,
      );
    case 'PERIOD_COMPARISON':
    case 'MONTHLY': {
      const rows = [
        ...fromBlock(
          `A: ${metrics.periods[0].from} a ${metrics.periods[0].to}`,
          metrics.periods[0].metrics,
        ),
        ...fromBlock(
          `B: ${metrics.periods[1].from} a ${metrics.periods[1].to}`,
          metrics.periods[1].metrics,
        ),
        ...fromDeltas(metrics.deltas),
      ];
      return metrics.kind === 'MONTHLY'
        ? [
            ...rows,
            ...fromBlock('Cohorte del mes', metrics.cohort.metrics),
            ...fromBlock('Segmentos de la cohorte', metrics.cohort.segments),
          ]
        : rows;
    }
    case 'CUSTOMER_COHORT':
      return [
        ...fromBlock('Cohorte', metrics.cohort.metrics),
        ...fromBlock('Segmentos', metrics.cohort.segments),
      ];
  }
}

function formatValue(value: number | null, unit: string) {
  if (value === null) return 'sin datos';
  const text = value.toLocaleString('es-AR');
  return unit === 'percent' ? `${text}%` : text;
}
