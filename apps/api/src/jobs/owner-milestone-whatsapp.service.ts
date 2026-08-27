import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessImpactService } from '../modules/insights/business-impact.service';
import type { BusinessImpactLifetimeMetrics } from '../modules/insights/business-impact';
import { OwnerLifecycleEmailLogService } from './owner-lifecycle-email-log.service';
import { WhatsAppBspService } from './whatsapp-bsp.service';
import { startOfLocalDay } from './owner-lifecycle-time';

const KIND = 'milestone_whatsapp' as const;

interface MilestoneDefinition {
  key: string;
  threshold: number;
  metric: (lifetime: BusinessImpactLifetimeMetrics) => number;
  /** Fragmento de copy, en segunda persona — se arma en `buildMessage`. */
  phrase: string;
}

/**
 * 4 categorías × 3 umbrales — curado a propósito, no el producto cruzado de
 * todo lo que `BusinessImpactService` podría medir (pedido explícito: "no
 * mandar todos los hitos posibles"). Mejora de rating: NO habilitada — no
 * hay baseline real guardado (ver `business-impact.service.ts`).
 */
const MILESTONES: MilestoneDefinition[] = [
  {
    key: 'customers_identified_50',
    threshold: 50,
    metric: (l) => l.customersIdentified,
    phrase: 'ya identificaste 50 clientes',
  },
  {
    key: 'customers_identified_100',
    threshold: 100,
    metric: (l) => l.customersIdentified,
    phrase: 'ya identificaste 100 clientes',
  },
  {
    key: 'customers_identified_250',
    threshold: 250,
    metric: (l) => l.customersIdentified,
    phrase: 'ya identificaste 250 clientes',
  },
  {
    key: 'benefits_redeemed_5',
    threshold: 5,
    metric: (l) => l.benefitsRedeemed,
    phrase: 'ya canjearon 5 beneficios',
  },
  {
    key: 'benefits_redeemed_10',
    threshold: 10,
    metric: (l) => l.benefitsRedeemed,
    phrase: 'ya canjearon 10 beneficios',
  },
  {
    key: 'benefits_redeemed_25',
    threshold: 25,
    metric: (l) => l.benefitsRedeemed,
    phrase: 'ya canjearon 25 beneficios',
  },
  {
    key: 'reviews_5',
    threshold: 5,
    metric: (l) => l.reviewsSinceFlikker,
    phrase: 'sumaste 5 reseñas nuevas desde que usás Flikker',
  },
  {
    key: 'reviews_10',
    threshold: 10,
    metric: (l) => l.reviewsSinceFlikker,
    phrase: 'sumaste 10 reseñas nuevas desde que usás Flikker',
  },
  {
    key: 'reviews_25',
    threshold: 25,
    metric: (l) => l.reviewsSinceFlikker,
    phrase: 'sumaste 25 reseñas nuevas desde que usás Flikker',
  },
  {
    key: 'recovered_3',
    threshold: 3,
    metric: (l) => l.customersReturnedAfterContact,
    phrase: '3 clientes volvieron después de que Flikker los contactó',
  },
  {
    key: 'recovered_5',
    threshold: 5,
    metric: (l) => l.customersReturnedAfterContact,
    phrase: '5 clientes volvieron después de que Flikker los contactó',
  },
  {
    key: 'recovered_10',
    threshold: 10,
    metric: (l) => l.customersReturnedAfterContact,
    phrase: '10 clientes volvieron después de que Flikker los contactó',
  },
];

interface BusinessRow {
  id: string;
  name: string;
  timezone: string;
}

/**
 * Hitos de "Impacto de Flikker" al dueño/manager, por WhatsApp — MUY
 * ocasional a propósito (nunca un resumen periódico): solo manda cuando se
 * cruza un umbral real, curado, por primera vez. Mismos números que
 * Insights y los emails de ciclo de vida (`BusinessImpactService` — fuente
 * única), mismo tick horario (`OwnerLifecycleEmailsWorker`, corre después
 * del sweep de emails: prioridad baja respecto a esas comunicaciones),
 * misma tabla de idempotencia (`OwnerLifecycleEmailLog`, kind
 * `milestone_whatsapp`, sin migración — `kind` ya es string libre).
 *
 * Tope real de "no mandar dos hitos el mismo día": un chequeo de si ya se
 * mandó ALGO hoy (hora local del negocio) corta ANTES de evaluar
 * candidatos — así ni siquiera se reclama un slot que no se va a poder
 * mandar hoy (queda para el próximo día, nunca se pierde: el reclamo real
 * por milestone solo ocurre al enviar). Si varios umbrales se cruzan
 * juntos, se reclaman todos y se mandan en UN solo mensaje.
 */
@Injectable()
export class OwnerMilestoneWhatsAppService {
  private readonly logger = new Logger(OwnerMilestoneWhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessImpact: BusinessImpactService,
    private readonly logService: OwnerLifecycleEmailLogService,
    private readonly whatsApp: WhatsAppBspService,
  ) {}

  async runDailyCheck(now: Date = new Date()) {
    const businesses = await this.prisma.business.findMany({
      where: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
      select: { id: true, name: true, timezone: true },
    });

    let sent = 0;
    let skipped = 0;
    for (const business of businesses) {
      const outcome = await this.processBusiness(business, now);
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'skipped') skipped += 1;
    }

    this.logger.log(
      `Owner milestone WhatsApp businesses=${businesses.length} sent=${sent} skipped=${skipped}`,
    );
    return { businesses: businesses.length, sent, skipped };
  }

  private async processBusiness(
    business: BusinessRow,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'none'> {
    if (await this.alreadySentToday(business, now)) return 'none';

    const impact = await this.businessImpact.getImpact(business.id, now);

    const dueKeys: string[] = [];
    for (const milestone of MILESTONES) {
      const already = await this.logService.alreadyLogged(
        business.id,
        KIND,
        milestone.key,
      );
      if (already) continue;
      if (milestone.metric(impact.lifetime) >= milestone.threshold) {
        dueKeys.push(milestone.key);
      }
    }
    if (dueKeys.length === 0) return 'none';

    // Reclamo atómico por hito, uno por uno — una carrera (otro proceso ya
    // lo mandó entre el chequeo de arriba y acá) simplemente saca esa
    // clave del lote, nunca aborta a las demás.
    const claimed: string[] = [];
    for (const key of dueKeys) {
      const logId = await this.logService.claimOnce(business.id, KIND, key);
      if (logId) claimed.push(logId);
    }
    if (claimed.length === 0) return 'none';

    const claimedMilestones = MILESTONES.filter((m) =>
      dueKeys.includes(m.key),
    ).slice(0, claimed.length);
    const contacts = await this.findOwnerWhatsApps(business.id);
    if (contacts.length === 0) {
      await Promise.all(
        claimed.map((logId) =>
          this.logService.markFailed(logId, 'NO_OWNER_WHATSAPP'),
        ),
      );
      return 'skipped';
    }

    const text = this.buildMessage(business.name, claimedMilestones);
    let anySent = false;
    for (const phone of contacts) {
      try {
        await this.whatsApp.sendText({ phone, text });
        anySent = true;
      } catch (error) {
        this.logger.warn(
          `Milestone WhatsApp send failed for ${phone}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await Promise.all(
      claimed.map((logId) =>
        anySent
          ? this.logService.markSent(logId)
          : this.logService.markFailed(logId, 'ALL_WHATSAPP_SENDS_FAILED'),
      ),
    );
    return anySent ? 'sent' : 'skipped';
  }

  private buildMessage(
    businessName: string,
    milestones: MilestoneDefinition[],
  ): string {
    if (milestones.length === 1) {
      return `Dato lindo de Flikker: ${milestones[0].phrase} en *${businessName}* 🙌`;
    }
    const bullets = milestones.map((m) => `• ${m.phrase}`).join('\n');
    return `Dato lindo de Flikker sobre *${businessName}* 🙌\n\n${bullets}`;
  }

  /** Tope real: como máximo una comunicación de hitos por negocio por día calendario LOCAL. */
  private async alreadySentToday(
    business: BusinessRow,
    now: Date,
  ): Promise<boolean> {
    const since = startOfLocalDay(now, business.timezone);
    const row = await this.prisma.ownerLifecycleEmailLog.findFirst({
      where: { businessId: business.id, kind: KIND, createdAt: { gte: since } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Mismo criterio que `findOwnerContacts` en `owner-notifications.worker.ts`
   * y `findOwnerEmails` en `OwnerLifecycleEmailsService` — duplicado a
   * propósito (evita un segundo touch a ese archivo LEGACY-adjacent),
   * pero pidiendo `notificationWhatsapp` en vez de email.
   */
  private async findOwnerWhatsApps(businessId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
        user: { isActive: true },
      },
      select: { user: { select: { notificationWhatsapp: true } } },
    });
    const phones = memberships
      .map((m) => m.user.notificationWhatsapp)
      .filter((phone): phone is string => Boolean(phone));
    return [...new Set(phones)];
  }
}
