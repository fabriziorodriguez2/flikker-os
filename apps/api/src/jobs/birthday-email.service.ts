import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { birthdayEmail } from './email-templates';
import { PlansService } from '../modules/plans/plans.service';

/**
 * Notificaciones (Pro) — cumpleaños del cliente.
 *
 * Deliberadamente NO un objetivo de Retention V2: no hay nada que reclutar
 * ni un grupo de control que tenga sentido para "hoy es tu cumpleaños" — es
 * un match de calendario, no un problema de segmentación. Un sweep diario
 * propio, sin variantes ni experimentos, es reusar la infraestructura de
 * scheduling (BullMQ, mismo patrón que `RewardGoalQueue`) sin construir un
 * segundo motor de decisión.
 */
@Injectable()
export class BirthdayEmailService {
  private readonly logger = new Logger(BirthdayEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly plans: PlansService,
  ) {}

  async runDaily(now: Date = new Date()) {
    const businesses = await this.prisma.business.findMany({
      where: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionSettings: { birthdayEmailEnabled: true },
      },
      select: { id: true, name: true, timezone: true },
    });

    let evaluated = 0;
    let sent = 0;
    const year = now.getUTCFullYear();

    for (const business of businesses) {
      // Pro (o trial Pro vigente) — la ÚNICA función de esta lista que
      // gatea por plan de verdad; sellos por vencer es Free.
      if (!(await this.plans.hasProAccess(business.id))) continue;

      const { month, day } = todayInTimezone(now, business.timezone);
      const customers = await this.prisma.$queryRaw<
        { id: string; name: string; email: string | null }[]
      >`
        SELECT id, name, email FROM "Customer"
        WHERE "businessId" = ${business.id}
          AND "isActive" = true
          AND "optedOut" = false
          AND birthday IS NOT NULL
          AND EXTRACT(MONTH FROM birthday) = ${month}
          AND EXTRACT(DAY FROM birthday) = ${day}
      `;

      for (const customer of customers) {
        evaluated += 1;
        const { subject, html } = birthdayEmail({
          businessName: business.name,
          customerName: customer.name,
        });
        const outcome = await this.lifecycleEmails.sendOnce({
          businessId: business.id,
          customerId: customer.id,
          kind: 'birthday',
          // A lo sumo un email de cumpleaños por año — reintentar el mismo
          // día (o correr el sweep dos veces) nunca duplica.
          dedupeKey: String(year),
          to: customer.email,
          subject,
          html,
        });
        if (outcome === 'sent') sent += 1;
      }
    }

    this.logger.log(
      `Birthday email businesses=${businesses.length} evaluated=${evaluated} sent=${sent}`,
    );
    return { businesses: businesses.length, evaluated, sent };
  }
}

/** Mismo patrón que `isValidToday` en `incentive-issuer.service.ts`. */
function todayInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '0');
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '0');
  return { month, day };
}
