import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { CampaignExecutionStatus, MembershipRole } from '@prisma/client';
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
    const feedback = await this.prisma.feedbackResponse.findFirst({
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
      select: { id: true, name: true, timezone: true, isActive: true },
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

    await this.emailService.send({
      to: contacts.emails,
      subject: `Resumen semanal de ${business.name}`,
      html: renderWeeklySummaryEmail({
        businessName: business.name,
        current,
        previous,
        panelUrl: buildPanelFeedbackUrl(),
      }),
    });
  }

  async enqueueDueWeeklySummaries(now = new Date()) {
    const businesses = await this.prisma.business.findMany({
      where: { isActive: true },
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
    const [reviewsGenerated, ratingSample, reactivatedCustomers] =
      await Promise.all([
        this.prisma.googleReview.count({
          where: { businessId, postedAt: { gte: from, lt: to } },
        }),
        this.prisma.googleReview.findMany({
          where: { businessId, postedAt: { gte: from, lt: to } },
          select: { stars: true },
        }),
        this.prisma.campaignExecution.findMany({
          where: {
            businessId,
            status: CampaignExecutionStatus.responded,
            respondedAt: { gte: from, lt: to },
          },
          distinct: ['customerId'],
          select: { customerId: true },
        }),
      ]);

    return {
      reviewsGenerated,
      averageRating: averageRating(ratingSample),
      reactivatedCustomers: reactivatedCustomers.length,
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
  reactivatedCustomers: number;
}

function buildPanelFeedbackUrl(feedbackId?: string) {
  const baseUrl =
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    'https://app.flikker.com';
  const url = `${baseUrl.replace(/\/$/, '')}/dashboard`;
  return feedbackId ? `${url}?feedback=${encodeURIComponent(feedbackId)}` : url;
}

function renderLowFeedbackEmail(input: {
  businessName: string;
  customerName: string;
  score: number;
  comment: string | null;
  panelUrl: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b">
      <h1 style="font-size:20px">Feedback bajo recibido</h1>
      <p><strong>Negocio:</strong> ${escapeHtml(input.businessName)}</p>
      <p><strong>Paciente:</strong> ${escapeHtml(input.customerName)}</p>
      <p><strong>Score:</strong> ${input.score}/5</p>
      <p><strong>Comentario:</strong> ${escapeHtml(input.comment || 'Sin comentario')}</p>
      <p><a href="${input.panelUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">Abrir panel</a></p>
    </div>
  `;
}

export function renderWeeklySummaryEmail(input: {
  businessName: string;
  current: WeeklyKpis;
  previous: WeeklyKpis;
  panelUrl: string;
}) {
  const name = escapeHtml(input.businessName);
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Resumen semanal — Flikker</title>
</head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F6FA;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background:#5C6BC0;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.6);text-transform:uppercase;margin-bottom:8px;">&#9889; Flikker</div>
            <div style="font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Resumen semanal</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:6px;">${name}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:28px 28px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${renderKpiCell('Reseñas', input.current.reviewsGenerated, input.previous.reviewsGenerated, false)}
                ${renderKpiCell('Calificación', input.current.averageRating, input.previous.averageRating, false)}
                ${renderKpiCell('Reactivados', input.current.reactivatedCustomers, input.previous.reactivatedCustomers, true)}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:16px 28px 32px;text-align:center;">
            <a href="${input.panelUrl}" style="display:inline-block;background:#5C6BC0;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Ver dashboard &rarr;</a>
          </td>
        </tr>
        <tr>
          <td style="background:#EEF0F6;border-top:1px solid #E8EAF0;border-radius:0 0 16px 16px;padding:16px 28px;text-align:center;">
            <span style="font-size:12px;color:#8891A4;font-family:Arial,Helvetica,sans-serif;">Powered by <strong style="color:#5C6BC0;">Flikker</strong></span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderKpiCell(label: string, current: number, previous: number, isLast: boolean) {
  const delta = Number((current - previous).toFixed(1));
  const sign = delta > 0 ? '+' : '';
  const deltaColor = delta > 0 ? '#639922' : delta < 0 ? '#C0392B' : '#8891A4';
  const displayValue = Number.isInteger(current) ? String(current) : current.toFixed(1);
  const prevDisplay = Number.isInteger(previous) ? String(previous) : previous.toFixed(1);
  return `<td width="33%" style="padding-right:${isLast ? '0' : '10px'};vertical-align:top;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:#F5F6FA;border:1px solid #E8EAF0;border-radius:12px;padding:16px 14px;">
        <div style="font-size:10px;font-weight:700;color:#8891A4;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;">${escapeHtml(label)}</div>
        <div style="font-size:32px;font-weight:700;color:#1A202C;line-height:1;margin-bottom:8px;">${displayValue}</div>
        <div style="font-size:12px;color:${deltaColor};">${sign}${delta} vs ant. (${prevDisplay})</div>
      </td></tr>
    </table>
  </td>`;
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
