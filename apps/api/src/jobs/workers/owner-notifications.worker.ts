import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ExperienceVersion, MembershipRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  LOW_FEEDBACK_NOTIFICATION_JOB,
  OWNER_NOTIFICATIONS_QUEUE,
  WEEKLY_KPI_SUMMARY_JOB,
  LowFeedbackNotificationJobData,
  OwnerNotificationsQueue,
  WeeklyKpiSummaryJobData,
} from '../owner-notifications.queue';
import { WhatsAppBspService } from '../whatsapp-bsp.service';
import { EmailService } from '../email.service';
import {
  emailCallout,
  emailParagraph,
  emailStats,
  escapeHtml as escapeEmailHtml,
  renderEmailLayout,
} from '../email-design-system';

type OwnerNotificationJobData =
  | LowFeedbackNotificationJobData
  | WeeklyKpiSummaryJobData;

const WEEKLY_SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OwnerNotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerNotificationsWorker.name);
  private connection?: IORedis;
  private worker?: Worker<OwnerNotificationJobData>;
  private weeklyScheduler?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
    private readonly emailService: EmailService,
    private readonly ownerNotificationsQueue: OwnerNotificationsQueue,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<OwnerNotificationJobData>(
      OWNER_NOTIFICATIONS_QUEUE,
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.weeklyScheduler = setInterval(
      () => void this.enqueueDueWeeklySummaries(),
      WEEKLY_SCHEDULER_INTERVAL_MS,
    );
    setTimeout(() => void this.enqueueDueWeeklySummaries(), 5000);
  }

  async process(job: Job<OwnerNotificationJobData>) {
    if (job.name === LOW_FEEDBACK_NOTIFICATION_JOB) {
      return this.processLowFeedback(
        job.data as LowFeedbackNotificationJobData,
      );
    }
    if (job.name === WEEKLY_KPI_SUMMARY_JOB) {
      return this.processWeeklySummary(job.data as WeeklyKpiSummaryJobData);
    }
    this.logger.warn(`Unknown owner notification job: ${job.name}`);
  }

  async processLowFeedback(data: LowFeedbackNotificationJobData) {
    // LEGACY sigue leyendo `FeedbackResponse`, exactamente como siempre.
    // Check-in V2 lee `CheckinFeedback` — la única fuente de verdad de
    // feedback para esos negocios, la MISMA fila que ya otorgó (o no) el
    // sello bonus. Nunca se lee la tabla del otro lado.
    const feedback =
      data.source === 'checkin_v2'
        ? await this.prisma.checkinFeedback.findFirst({
            where: { id: data.checkinFeedbackId, businessId: data.businessId },
            include: { business: true, customer: true },
          })
        : await this.prisma.feedbackResponse.findFirst({
            where: { id: data.feedbackResponseId, businessId: data.businessId },
            include: { business: true, customer: true, message: true },
          });

    if (!feedback) return;
    const recipients = await this.findOwnerContacts(data.businessId);
    const panelUrl = buildPanelFeedbackUrl(feedback.id);

    const text = [
      `Feedback bajo (${feedback.score}/5)`,
      `Negocio: ${feedback.business.name}`,
      `Paciente: ${feedback.customer.name}`,
      feedback.comment ? `Comentario: ${feedback.comment}` : undefined,
      `Panel: ${panelUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (recipients.emails.length > 0) {
        const emailResult = await this.emailService.send({
          to: recipients.emails,
          subject: `Feedback bajo (${feedback.score}/5) - ${feedback.business.name}`,
          html: renderLowFeedbackEmail({
            businessName: feedback.business.name,
            customerName: feedback.customer.name,
            score: feedback.score,
            comment: feedback.comment,
            panelUrl,
          }),
        });
        if (emailResult) return;
      }

      const whatsapp = recipients.whatsapps[0] ?? feedback.business.phone;
      if (whatsapp) {
        await this.whatsAppBspService.sendText({ phone: whatsapp, text });
        return;
      }

      this.logger.warn(
        `Low feedback ${feedback.id} has no owner contact to notify.`,
      );
    } catch (error) {
      this.logger.error(
        `Could not notify low feedback ${feedback.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }

  async processWeeklySummary(data: WeeklyKpiSummaryJobData) {
    const business = await this.prisma.business.findUnique({
      where: { id: data.businessId },
      select: {
        id: true,
        name: true,
        timezone: true,
        isActive: true,
        phone: true,
      },
    });
    if (!business?.isActive) return;

    const contacts = await this.findOwnerContacts(business.id);
    if (contacts.emails.length === 0) {
      this.logger.warn(
        `Weekly KPI summary for ${business.id} skipped: no owner email.`,
      );
      return;
    }

    const windows = buildWeekWindows(new Date(data.weekStartIso));
    const [current, previous] = await Promise.all([
      this.calculateWeeklyKpis(
        business.id,
        windows.currentStart,
        windows.currentEnd,
      ),
      this.calculateWeeklyKpis(
        business.id,
        windows.previousStart,
        windows.previousEnd,
      ),
    ]);

    const panelUrl = buildPanelFeedbackUrl();

    await this.emailService.send({
      to: contacts.emails,
      subject: `Resumen semanal de ${business.name}`,
      html: renderWeeklySummaryEmail({
        businessName: business.name,
        current,
        previous,
        panelUrl,
      }),
    });

    // WhatsApp summary — independent of email, never throws
    const waTargets =
      contacts.whatsapps.length > 0
        ? contacts.whatsapps
        : business.phone
          ? [business.phone]
          : [];

    for (const phone of waTargets) {
      try {
        await this.whatsAppBspService.sendText({
          phone,
          text: buildWeeklyWhatsAppText(
            business.name,
            current,
            previous,
            panelUrl,
          ),
        });
      } catch (error) {
        this.logger.warn(
          `Weekly WhatsApp summary failed for ${phone}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async enqueueDueWeeklySummaries(now = new Date()) {
    // CHECKIN_V2 tiene su propio resumen semanal
    // (`OwnerLifecycleEmailsService`, con funnel de reactivación + IA) —
    // este sigue siendo exclusivo de LEGACY para que ningún negocio reciba
    // los dos emails semanales el mismo día.
    const businesses = await this.prisma.business.findMany({
      where: { isActive: true, experienceVersion: ExperienceVersion.LEGACY },
      select: { id: true, timezone: true },
    });

    for (const business of businesses) {
      if (!isLocalMondayAtNine(now, business.timezone)) continue;
      const weekStart = currentLocalWeekStartUtc(now, business.timezone);
      await this.ownerNotificationsQueue.enqueueWeeklyKpiSummary({
        businessId: business.id,
        weekStartIso: weekStart.toISOString(),
      });
    }
  }

  private async findOwnerContacts(businessId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
        user: { isActive: true },
      },
      select: {
        user: {
          select: {
            email: true,
            notificationEmail: true,
            notificationWhatsapp: true,
          },
        },
      },
    });

    return {
      emails: unique(
        memberships
          .map(
            (membership) =>
              membership.user.notificationEmail ?? membership.user.email,
          )
          .filter(Boolean),
      ),
      whatsapps: unique(
        memberships
          .map((membership) => membership.user.notificationWhatsapp)
          .filter(Boolean),
      ),
    };
  }

  private async calculateWeeklyKpis(businessId: string, from: Date, to: Date) {
    const [reviewsGenerated, ratingSample, qrScans] = await Promise.all([
      this.prisma.googleReview.count({
        where: { businessId, postedAt: { gte: from, lt: to } },
      }),
      this.prisma.googleReview.findMany({
        where: { businessId, postedAt: { gte: from, lt: to } },
        select: { stars: true },
      }),
      this.prisma.scanEvent.count({
        where: { businessId, scannedAt: { gte: from, lt: to } },
      }),
    ]);

    return {
      reviewsGenerated,
      averageRating: averageRating(ratingSample),
      qrScans,
    };
  }

  async onModuleDestroy() {
    if (this.weeklyScheduler) clearInterval(this.weeklyScheduler);
    await this.worker?.close();
    await this.connection?.quit();
  }
}

interface WeeklyKpis {
  reviewsGenerated: number;
  averageRating: number;
  qrScans: number;
}

function buildPanelFeedbackUrl(feedbackId?: string) {
  const baseUrl =
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    'https://app.flikker.com';
  const url = `${baseUrl.replace(/\/$/, '')}/dashboard`;
  return feedbackId ? `${url}?feedback=${encodeURIComponent(feedbackId)}` : url;
}

function renderInsightText(current: WeeklyKpis): string {
  if (current.reviewsGenerated > 0) {
    return 'Tus clientes están respondiendo bien. Seguí marcando atenciones para mantener el ritmo.';
  }
  if (current.qrScans > 0) {
    const n = current.qrScans;
    return `Tuviste ${n} ${n === 1 ? 'escaneo' : 'escaneos'} del QR esta semana. Esos contactos están en tu base — podés mandarles una campaña cuando quieras.`;
  }
  return 'Recordá marcar a tus clientes como atendidos para que Flikker les mande el pedido de reseña.';
}

function buildWeeklyWhatsAppText(
  businessName: string,
  current: WeeklyKpis,
  previous: WeeklyKpis,
  panelUrl: string,
): string {
  const allZero = current.reviewsGenerated === 0 && current.qrScans === 0;

  if (allZero) {
    return [
      `📊 *Resumen semanal de ${businessName}*`,
      '',
      'Esta semana fue tranquila. Recordá marcar a tus clientes como atendidos para que Flikker haga su trabajo.',
      '',
      `👉 Ver dashboard: ${panelUrl}`,
    ].join('\n');
  }

  const reviewsDelta = current.reviewsGenerated - previous.reviewsGenerated;
  const reviewsComp =
    reviewsDelta > 0
      ? `+${reviewsDelta} vs semana anterior`
      : reviewsDelta < 0
        ? `${reviewsDelta} vs semana anterior`
        : 'igual que la semana anterior';

  const qrDelta = current.qrScans - previous.qrScans;
  const qrComp =
    qrDelta > 0
      ? `+${qrDelta} vs semana anterior`
      : qrDelta < 0
        ? `${qrDelta} vs semana anterior`
        : 'igual que la semana anterior';

  const rating =
    current.averageRating > 0 ? current.averageRating.toFixed(1) : '—';

  return [
    `📊 *Resumen semanal de ${businessName}*`,
    '',
    `⭐ Reseñas nuevas: ${current.reviewsGenerated} (${reviewsComp})`,
    `📈 Rating actual: ${rating}`,
    `📱 Escaneos QR: ${current.qrScans} (${qrComp})`,
    '',
    renderInsightText(current),
    '',
    `👉 Ver dashboard: ${panelUrl}`,
  ].join('\n');
}

export function renderLowFeedbackEmail(input: {
  businessName: string;
  customerName: string;
  score: number;
  comment: string | null;
  panelUrl: string;
}) {
  return renderEmailLayout({
    preheader: `${input.customerName} dejó una valoración de ${input.score}/5 en ${input.businessName}.`,
    eyebrow: `Acción requerida · ${input.businessName}`,
    title: 'Recibiste una opinión para revisar',
    bodyHtml:
      emailParagraph(
        `<strong>${escapeEmailHtml(input.customerName)}</strong> calificó su experiencia con <strong>${input.score}/5</strong>.`,
      ) +
      emailCallout({
        label: 'Comentario del cliente',
        tone: 'danger',
        contentHtml: escapeEmailHtml(input.comment || 'Sin comentario'),
      }) +
      emailParagraph(
        'Revisá el caso en el panel y hacé el seguimiento que corresponda.',
        { muted: true, small: true },
      ),
    action: { label: 'Abrir en el panel', url: input.panelUrl },
    businessName: input.businessName,
  });
}

export function renderWeeklySummaryEmail(input: {
  businessName: string;
  current: WeeklyKpis;
  previous: WeeklyKpis;
  panelUrl: string;
}) {
  const allZero =
    input.current.reviewsGenerated === 0 && input.current.qrScans === 0;
  const unsubscribeUrl = `mailto:soporte@flikker.com?subject=${encodeURIComponent('Dar de baja resumen semanal')}`;
  const metrics = allZero
    ? emailCallout({
        tone: 'neutral',
        label: 'Semana tranquila',
        contentHtml:
          'Seguí marcando clientes y Flikker va a seguir trabajando para generar nuevas reseñas.',
      })
    : emailStats([
        {
          label: 'Reseñas nuevas',
          value: input.current.reviewsGenerated,
          detail: comparisonLabel(
            input.current.reviewsGenerated,
            input.previous.reviewsGenerated,
          ),
        },
        {
          label: 'Rating actual',
          value:
            input.current.averageRating > 0
              ? input.current.averageRating.toFixed(1)
              : '—',
          detail: comparisonLabel(
            input.current.averageRating,
            input.previous.averageRating,
          ),
        },
        {
          label: 'Escaneos QR',
          value: input.current.qrScans,
          detail: comparisonLabel(
            input.current.qrScans,
            input.previous.qrScans,
          ),
        },
      ]);

  return renderEmailLayout({
    preheader: `Reseñas, rating y escaneos de ${input.businessName} esta semana.`,
    eyebrow: `Resumen semanal · ${input.businessName}`,
    title: 'Lo que pasó esta semana',
    bodyHtml:
      emailParagraph(
        `Hola, acá va el resumen operativo de <strong>${escapeEmailHtml(input.businessName)}</strong>.`,
      ) +
      metrics +
      emailCallout({
        label: 'Próximo paso',
        tone: 'accent',
        contentHtml: escapeEmailHtml(renderInsightText(input.current)),
      }),
    action: { label: 'Ver mi dashboard', url: input.panelUrl },
    businessName: input.businessName,
    unsubscribeUrl,
  });
}

function comparisonLabel(current: number, previous: number): string {
  const delta = Number((current - previous).toFixed(1));
  if (delta === 0) return 'Igual que la semana anterior';
  return `${delta > 0 ? '+' : ''}${delta} vs. semana anterior`;
}

function buildWeekWindows(currentStart: Date) {
  const currentEnd = new Date(currentStart.getTime());
  const previousStart = new Date(currentStart.getTime() - WEEK_MS);
  const previousEnd = currentStart;

  return {
    currentStart: previousStart,
    currentEnd,
    previousStart: new Date(previousStart.getTime() - WEEK_MS),
    previousEnd,
  };
}

function isLocalMondayAtNine(date: Date, timezone: string) {
  const parts = localParts(date, timezone);
  return parts.weekday === 'Mon' && parts.hour === 9;
}

function currentLocalWeekStartUtc(date: Date, timezone: string) {
  const parts = localParts(date, timezone);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const localMonday = new Date(
    localDate.getTime() - localDayIndex(parts.weekday) * 24 * 60 * 60 * 1000,
  );
  return zonedTimeToUtc(
    localMonday.getUTCFullYear(),
    localMonday.getUTCMonth() + 1,
    localMonday.getUTCDate(),
    0,
    0,
    timezone,
  );
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = timezoneOffsetMs(guess, timezone);
  return new Date(guess.getTime() - offset);
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = localParts(date, timezone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return localAsUtc - date.getTime();
}

function localParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const entries = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: entries.weekday,
    year: Number(entries.year),
    month: Number(entries.month),
    day: Number(entries.day),
    hour: Number(entries.hour === '24' ? 0 : entries.hour),
    minute: Number(entries.minute),
    second: Number(entries.second),
  };
}

function localDayIndex(weekday: string) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
}

function averageRating(reviews: { stars: number }[]) {
  if (reviews.length === 0) return 0;
  const total = reviews.reduce((sum, review) => sum + review.stars, 0);
  return Number((total / reviews.length).toFixed(1));
}

function unique(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
