import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { birthdayEmail, birthdayWhatsAppText } from './email-templates';
import { PlansService } from '../modules/plans/plans.service';
import { RetentionSettingsService } from '../modules/retention-v2/retention-settings.service';
import { AutomationCooldownService } from './automation-cooldown.service';

/**
 * Notificaciones (Pro) — cumpleaños del cliente.
 *
 * Deliberadamente NO un objetivo de Retention V2: no hay nada que reclutar
 * ni un grupo de control que tenga sentido para "hoy es tu cumpleaños" — es
 * un match de calendario, no un problema de segmentación. Un sweep diario
 * propio, sin variantes ni experimentos, es reusar la infraestructura de
 * scheduling (BullMQ, mismo patrón que `RewardGoalQueue`) sin construir un
 * segundo motor de decisión. Manda por WhatsApp Y por email — ambos
 * comparten la misma decisión de a quién y cuándo.
 *
 * Prioridad 1 (la más alta) en el cooldown global de 24h — ver
 * `AutomationCooldownService`. El orden real lo da que este sweep se llama
 * ANTES que `StampsExpiryEmailService.runDaily` en `LifecycleEmailsWorker`,
 * y que el cron de `LifecycleEmailsQueue` corre antes que el de Retention V2.
 */
@Injectable()
export class BirthdayEmailService {
  private readonly logger = new Logger(BirthdayEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly plans: PlansService,
    private readonly retentionSettings: RetentionSettingsService,
    private readonly cooldown: AutomationCooldownService,
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
    let suppressed = 0;
    const year = now.getUTCFullYear();

    for (const business of businesses) {
      // Pro (o trial Pro vigente) — la ÚNICA función de esta lista que
      // gatea por plan de verdad; sellos por vencer es Free.
      if (!(await this.plans.hasProAccess(business.id))) continue;

      // Ventana horaria del negocio, revalidada justo antes de mandar.
      const settings = await this.retentionSettings.getOrCreate(business.id);
      if (
        !this.retentionSettings.isWithinSendingWindow(
          settings,
          business.timezone,
          now,
        )
      ) {
        continue;
      }

      const { month, day } = todayInTimezone(now, business.timezone);
      const customers = await this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          email: string | null;
          phoneE164: string | null;
        }[]
      >`
        SELECT id, name, email, "phoneE164" FROM "Customer"
        WHERE "businessId" = ${business.id}
          AND "isActive" = true
          AND "optedOut" = false
          AND birthday IS NOT NULL
          AND EXTRACT(MONTH FROM birthday) = ${month}
          AND EXTRACT(DAY FROM birthday) = ${day}
      `;

      for (const customer of customers) {
        evaluated += 1;

        // Cooldown global — un solo reclamo cubre los dos canales de esta
        // misma ocurrencia. Prioridad 1 (la más alta): se reserva y
        // confirma en el mismo paso, nada le puede ganar el turno.
        const claim = await this.cooldown.claimImmediate({
          businessId: business.id,
          customerId: customer.id,
          kind: 'birthday',
          now,
        });
        if (claim !== 'confirmed') {
          suppressed += 1;
          continue;
        }

        const { subject, html } = birthdayEmail({
          businessName: business.name,
          customerName: customer.name,
        });
        const emailOutcome = await this.lifecycleEmails.sendOnce({
          businessId: business.id,
          customerId: customer.id,
          kind: 'birthday',
          channel: 'email',
          // A lo sumo un mensaje de cumpleaños por año — reintentar el mismo
          // día (o correr el sweep dos veces) nunca duplica.
          dedupeKey: String(year),
          to: customer.email,
          subject,
          html,
        });

        const text = birthdayWhatsAppText({
          businessName: business.name,
          customerName: customer.name,
        });
        const whatsAppOutcome = await this.lifecycleEmails.sendOnce({
          businessId: business.id,
          customerId: customer.id,
          kind: 'birthday',
          channel: 'whatsapp',
          dedupeKey: String(year),
          to: customer.phoneE164,
          text,
        });

        if (emailOutcome === 'sent' || whatsAppOutcome === 'sent') sent += 1;
      }
    }

    this.logger.log(
      `Birthday businesses=${businesses.length} evaluated=${evaluated} sent=${sent} suppressed=${suppressed}`,
    );
    return { businesses: businesses.length, evaluated, sent, suppressed };
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
