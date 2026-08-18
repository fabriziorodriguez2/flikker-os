import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BenefitType,
  BusinessStatus,
  ExperienceVersion,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitSourcesRepository } from '../visit-sources/visit-sources.repository';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { PlansService } from '../plans/plans.service';
import { ONBOARDING_DEFAULTS } from './onboarding.defaults';
import { GoogleUrlError, normalizeGoogleBusinessUrl } from './google-url';
import type {
  OnboardingBenefitsOnlyDto,
  OnboardingBusinessDto,
  OnboardingDesignDto,
  OnboardingGoogleDto,
  OnboardingNotificationsDto,
  OnboardingProgramDto,
  OnboardingWelcomeGiftDto,
} from './dto/onboarding.dto';

/**
 * Onboarding self-service — el dueño termina con Flikker funcionando sin
 * que intervenga un operador de plataforma.
 *
 * Todo el trabajo pesado vive acá y no en el browser: cada paso es UNA
 * llamada que deja un estado coherente, en vez de encadenar seis writes
 * frágiles desde el cliente.
 *
 * Idempotencia — el principio es "reanudar, nunca duplicar":
 *  - El negocio incompleto del usuario (`onboardingCompletedAt: null`) es el
 *    ancla: `saveBusiness` lo actualiza en vez de crear otro.
 *  - `ensureDefaultSource` y `ensureMembership` ya recuperan de su propia
 *    carrera por constraint único.
 *  - Los pasos 2-6 son writes por `businessId`, así que repetirlos converge
 *    al mismo estado.
 * Refrescar, volver atrás o reintentar nunca deja un negocio a medias ni
 * crea uno duplicado.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visitSources: VisitSourcesRepository,
    private readonly benefits: BenefitsRepository,
    private readonly retentionBootstrap: RetentionV2BootstrapService,
    private readonly plans: PlansService,
  ) {}

  /** El negocio que este usuario está onboardeando, si hay alguno. */
  /**
   * Bug real (auditado): `onboardingCompletedAt: null` por sí solo NO
   * distingue "borrador de onboarding self-service en curso" de "negocio
   * LEGACY que nunca pasó por este flujo" — ambos dejan ese campo en null
   * para siempre, porque el flujo self-service es lo único que lo escribe.
   * Sin el filtro de `experienceVersion`, cualquier OWNER de un negocio
   * LEGACY quedaba "adoptado" como si tuviera un draft de CHECKIN_V2 en
   * curso, y `(panel)/layout.tsx` lo mandaba a `/comenzar` en cada
   * navegación — nunca llegaba a su panel real.
   */
  private findDraft(userId: string) {
    return this.prisma.business.findFirst({
      where: {
        onboardingCompletedAt: null,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        memberships: {
          some: {
            userId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireDraft(userId: string) {
    const draft = await this.findDraft(userId);
    if (!draft) {
      throw new NotFoundException('No hay un onboarding en curso');
    }
    return draft;
  }

  /**
   * Estado para reanudar. El wizard lo pide al montar y sabe exactamente en
   * qué paso quedó, sin guardar nada en el browser.
   *
   * Onboarding self-service NUEVO: 2 pasos. `steps.program` se resuelve por
   * `retentionProgramDecided`, no por `rewardGoalsEnabled` — así "eligió
   * Beneficios sin sellos" y "todavía no llegó al paso 2" no se confunden
   * (los dos dejan `rewardGoalsEnabled` en false).
   *
   * Los pasos viejos (regalo de bienvenida, diseño, Google, notificaciones)
   * ya NO forman parte de este recorrido — se sacaron del wizard self-service
   * a pedido explícito, aunque sus endpoints siguen existiendo por si algo
   * más los necesita (ver `saveWelcomeGift`/`saveDesign`/`saveGoogle`/
   * `saveNotifications` más abajo).
   */
  async getState(userId: string) {
    const draft = await this.findDraft(userId);
    if (!draft) return { businessId: null, completed: false, steps: {} };

    const [settings, reward, source, benefitCount] = await Promise.all([
      this.prisma.retentionSettings.findUnique({
        where: { businessId: draft.id },
        select: {
          rewardGoalsEnabled: true,
          rewardGoalMinVisits: true,
          rewardGoalFeedbackBonusEnabled: true,
        },
      }),
      this.prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId: draft.id, rewardGoalEligible: true, active: true },
        select: { name: true, benefitId: true },
      }),
      this.prisma.visitSource.findFirst({
        where: { businessId: draft.id, isDefault: true },
        select: { token: true },
      }),
      this.prisma.benefit.count({ where: { businessId: draft.id } }),
    ]);

    const hasStampsCard = Boolean(settings?.rewardGoalsEnabled && reward);

    return {
      businessId: draft.id,
      businessName: draft.name,
      completed: false,
      checkinToken: source?.token ?? null,
      steps: {
        business: true,
        program: draft.retentionProgramDecided,
      },
      program: {
        mode: !draft.retentionProgramDecided
          ? null
          : hasStampsCard
            ? ('benefits_stamps' as const)
            : ('benefits' as const),
        rewardName: reward?.name ?? null,
        stampsRequired: settings?.rewardGoalMinVisits ?? null,
        feedbackBonusEnabled: settings?.rewardGoalFeedbackBonusEnabled ?? false,
      },
      benefitCount,
    };
  }

  /**
   * Paso 1. Crea (o actualiza, si ya había un borrador) el negocio con todo
   * lo que necesita para funcionar: CHECKIN_V2, membresía OWNER,
   * RetentionSettings y la fuente QR Principal.
   */
  async saveBusiness(userId: string, dto: OnboardingBusinessDto) {
    const existing = await this.findDraft(userId);

    const data = {
      name: dto.name.trim(),
      industry: dto.category,
      logoUrl: dto.logoUrl,
      country: ONBOARDING_DEFAULTS.country,
      timezone: ONBOARDING_DEFAULTS.timezone,
    };

    // El onboarding self-service SIEMPRE deja el negocio en la experiencia
    // nueva. El default del schema sigue en LEGACY para no cambiar lo que hace
    // Platform Admin ni los seeds. Va también en el update porque el negocio
    // puede venir de `POST /auth/signup`, que lo crea LEGACY y en USD: el paso
    // 1 lo adopta y lo termina de configurar.
    const experience = {
      status: BusinessStatus.ACTIVE,
      currency: ONBOARDING_DEFAULTS.currency,
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    };

    const business = existing
      ? await this.prisma.business.update({
          where: { id: existing.id },
          data: { ...data, ...experience },
        })
      : await this.prisma.business.create({
          data: {
            ...data,
            ...experience,
            slug: await this.uniqueSlug(dto.name),
          },
        });

    await Promise.all([
      this.ensureOwnerMembership(business.id, userId),
      this.ensureSettings(business.id),
      this.visitSources.ensureDefaultSource(business.id),
    ]);

    return this.getState(userId);
  }

  /**
   * Paso 2, camino "Beneficios + sellos" — recompensa + sellos + bonus.
   * Marca `retentionProgramDecided` y prende el recordatorio de progreso por
   * defecto: solo tiene sentido si hay una tarjeta de sellos activa (pedido
   * explícito de los defaults del onboarding nuevo).
   */
  async saveProgram(userId: string, dto: OnboardingProgramDto) {
    const draft = await this.requireDraft(userId);

    const rewardBenefitId = await this.resolveBenefit(
      draft.id,
      dto.rewardBenefitId,
      dto.rewardTitle,
      (dto.rewardType as BenefitType) ?? BenefitType.gift,
    );
    if (!rewardBenefitId) {
      throw new BadRequestException(
        'Elegí o creá una recompensa para el programa',
      );
    }

    // Autoriza SOLO esta como recompensa de tarjeta, apagando cualquier otra
    // que hubiera quedado de un intento anterior.
    await this.prisma.retentionIncentiveDefinition.updateMany({
      where: { businessId: draft.id, rewardGoalEligible: true },
      data: { rewardGoalEligible: false },
    });
    await this.benefits.setRetentionBridge(draft.id, rewardBenefitId, {
      rewardGoalEligible: true,
    });

    await this.prisma.retentionSettings.update({
      where: { businessId: draft.id },
      data: {
        rewardGoalsEnabled: true,
        rewardGoalMinVisits: dto.stampsRequired,
        rewardGoalMaxVisits: dto.stampsRequired,
        rewardGoalFeedbackBonusEnabled: dto.feedbackBonusEnabled ?? false,
        progressReminderEnabled: true,
      },
    });
    await this.prisma.business.update({
      where: { id: draft.id },
      data: { retentionProgramDecided: true },
    });

    // Self-service FREE (tarjeta de sellos): 50 clientes participantes.
    // "Beneficios + sellos" TAMBIÉN arranca el trial de Beneficios (30 días,
    // acceso Pro temporal) — `benefitsEnabled` sigue en `true` (default) en
    // este camino, así que dejarlo sin vencimiento sería regalar Beneficios
    // Pro para siempre. `startBenefitsTrialIfNeeded` es idempotente: si el
    // negocio ya lo había arrancado antes (ej. vino de "solo Beneficios" y
    // volvió a este paso), no reinicia el reloj.
    await this.plans.ensureFreeSubscriptionIfMissing(draft.id);
    await this.plans.startBenefitsTrialIfNeeded(draft.id);

    return this.getState(userId);
  }

  /**
   * Paso 2, camino "Beneficios" (sin tarjeta de sellos). 0 beneficios es una
   * respuesta válida — no es obligatorio crear ninguno para terminar.
   *
   * Deja el negocio explícitamente SIN programa de sellos: si el dueño había
   * pasado antes por el otro camino (fue y volvió) esto apaga cualquier
   * `rewardGoalsEnabled`/recompensa autorizada que hubiera quedado, para que
   * los dos caminos sean mutuamente excluyentes.
   */
  async saveBenefitsOnlyProgram(
    userId: string,
    dto: OnboardingBenefitsOnlyDto,
  ) {
    const draft = await this.requireDraft(userId);

    await this.prisma.retentionIncentiveDefinition.updateMany({
      where: { businessId: draft.id, rewardGoalEligible: true },
      data: { rewardGoalEligible: false },
    });
    await this.prisma.retentionSettings.update({
      where: { businessId: draft.id },
      data: { rewardGoalsEnabled: false, progressReminderEnabled: false },
    });

    for (const item of dto.benefits ?? []) {
      await this.resolveBenefit(
        draft.id,
        undefined,
        item.title,
        item.type as BenefitType,
      );
    }

    await this.prisma.business.update({
      where: { id: draft.id },
      data: { retentionProgramDecided: true },
    });

    // Self-service Beneficios: prueba de 30 días desde la activación. Al
    // vencer, `PlansService#isBenefitsBlocked` bloquea crear beneficios
    // NUEVOS (`BenefitsService#create`) — el catálogo existente sigue
    // intacto. El plan Free se da de alta igual (nunca duele: el tope de
    // clientes solo importa si además se prenden los sellos).
    await this.plans.ensureFreeSubscriptionIfMissing(draft.id);
    await this.plans.startBenefitsTrialIfNeeded(draft.id);

    return this.getState(userId);
  }

  /**
   * Paso 3 — regalo de bienvenida. Endpoint propio, no parte de
   * `saveProgram`, porque "no quiero regalo" tiene que quedar registrado
   * como una DECISIÓN: con solo `welcomeBenefitId: null` no se distingue de
   * "todavía no se lo preguntamos", y el wizard volvería a preguntar para
   * siempre cada vez que el dueño reanuda.
   */
  async saveWelcomeGift(userId: string, dto: OnboardingWelcomeGiftDto) {
    const draft = await this.requireDraft(userId);

    const benefitId = dto.wantsGift
      ? await this.resolveBenefit(
          draft.id,
          dto.benefitId,
          dto.title,
          BenefitType.gift,
        )
      : null;

    if (dto.wantsGift && !benefitId) {
      throw new BadRequestException('Elegí o creá el regalo de bienvenida');
    }

    await this.prisma.business.update({
      where: { id: draft.id },
      data: { welcomeBenefitId: benefitId, welcomeGiftDecided: true },
    });
    return this.getState(userId);
  }

  /** Paso 4 — apariencia de la tarjeta. */
  async saveDesign(userId: string, dto: OnboardingDesignDto) {
    const draft = await this.requireDraft(userId);
    await this.prisma.business.update({
      where: { id: draft.id },
      data: {
        loyaltyCardColor: dto.loyaltyCardColor,
        loyaltyStampColor: dto.loyaltyStampColor,
        loyaltyStampIcon: dto.loyaltyStampIcon,
        ...(dto.logoUrl ? { logoUrl: dto.logoUrl } : {}),
      },
    });
    return this.getState(userId);
  }

  /** Paso 5 — Google. Omitible: sin esto los sellos y el feedback funcionan igual. */
  async saveGoogle(userId: string, dto: OnboardingGoogleDto) {
    const draft = await this.requireDraft(userId);

    let url: string | null;
    try {
      url = normalizeGoogleBusinessUrl(dto.googleBusinessProfileUrl);
    } catch (error) {
      if (error instanceof GoogleUrlError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await this.prisma.business.update({
      where: { id: draft.id },
      data: {
        googleBusinessProfileUrl: url,
        googlePlaceId: dto.googlePlaceId?.trim() || null,
      },
    });
    return this.getState(userId);
  }

  /**
   * Paso 6 — notificaciones. Traduce tres interruptores de negocio a los
   * campos internos, y autoriza explícitamente qué beneficios puede usar la
   * reactivación (Flikker nunca inventa uno).
   */
  async saveNotifications(userId: string, dto: OnboardingNotificationsDto) {
    const draft = await this.requireDraft(userId);
    const reactivate = dto.reactivateInactive ?? false;
    const progressReminder = dto.remindNearReward ?? false;

    // Cada toggle escribe SU propio campo — ninguno es alias de otro:
    //   "cerca del premio" → RetentionSettings.progressReminderEnabled
    //   "reactivar"        → automaticCampaignsEnabled + el kill switch
    // (ver `retention-v2-evaluate.service.ts`, que ahora gatea el pase de
    // progreso por su propio flag).
    await this.prisma.retentionSettings.update({
      where: { businessId: draft.id },
      data: {
        progressReminderEnabled: progressReminder,
        automaticCampaignsEnabled: reactivate,
      },
    });
    await this.prisma.business.update({
      where: { id: draft.id },
      data: {
        retentionEngineV2Enabled: reactivate || progressReminder,
        // Siempre true, incluso con los dos toggles apagados: dejar todo en
        // OFF es una decisión, no una omisión. Sin esto el paso quedaría
        // "pendiente" para siempre y el wizard volvería a preguntarlo en
        // cada refresh. Mismo criterio que `welcomeGiftDecided`.
        notificationsDecided: true,
      },
    });

    // Autorización explícita, y solo de beneficios de ESTE negocio.
    const allowed = dto.reactivationBenefitIds ?? [];
    await this.prisma.retentionIncentiveDefinition.updateMany({
      where: { businessId: draft.id, automationEligible: true },
      data: { automationEligible: false },
    });
    for (const benefitId of allowed) {
      await this.benefits.setRetentionBridge(draft.id, benefitId, {
        automationEligible: true,
      });
    }

    return this.getState(userId);
  }

  /**
   * Paso 7 — cierra el onboarding. A partir de acá deja de ser borrador.
   *
   * Idempotente a propósito: el wizard llama a esto ANTES de navegar, así que
   * un reintento después de un complete que sí funcionó (pero cuya respuesta
   * se perdió) tiene que devolver el mismo resultado, no un 404 que deje al
   * dueño trabado en la última pantalla.
   */
  async complete(userId: string) {
    const draft = await this.findDraft(userId);
    if (!draft) {
      const done = await this.prisma.business.findFirst({
        where: {
          onboardingCompletedAt: { not: null },
          memberships: {
            some: {
              userId,
              role: MembershipRole.OWNER,
              status: MembershipStatus.ACTIVE,
            },
          },
        },
        orderBy: { onboardingCompletedAt: 'desc' },
        select: { id: true },
      });
      if (done) return { businessId: done.id, completed: true };
      throw new NotFoundException('No hay un onboarding en curso');
    }

    await this.prisma.business.update({
      where: { id: draft.id },
      data: {
        onboardingCompletedAt: new Date(),
        // Reactivación habilitada por defecto (pedido explícito de los
        // defaults del onboarding nuevo — ya no hay un paso que la pregunte).
        // `RetentionSettings.automaticCampaignsEnabled` ya es `true` por
        // default de schema desde que `ensureSettings` crea la fila en el
        // paso 1; lo que faltaba prender es el kill switch del negocio, sin
        // el cual el motor nunca evalúa nada (`resolveEffectiveAutomationState`).
        // El recordatorio de progreso, en cambio, NO se toca acá: ya quedó
        // en su valor correcto (true solo con tarjeta de sellos) desde el
        // paso 2 (`saveProgram`/`saveBenefitsOnlyProgram`).
        retentionEngineV2Enabled: true,
      },
    });

    // §9 trigger A — the moment a self-service business is actually ready to
    // run: the kill switch just turned on above, and every flag `saveProgram`
    // / `saveBenefitsOnlyProgram` / `saveNotifications` set is already
    // final. Idempotent, so a retried `complete()` call (see the docstring's
    // "reanudar, nunca duplicar" principle) never builds a second generation.
    await this.retentionBootstrap.ensureDefaultRetentionSetup(draft.id);

    return { businessId: draft.id, completed: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async ensureOwnerMembership(businessId: string, userId: string) {
    return this.prisma.membership.upsert({
      where: { userId_businessId: { userId, businessId } },
      create: {
        userId,
        businessId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
      update: {},
    });
  }

  private async ensureSettings(businessId: string) {
    return this.prisma.retentionSettings.upsert({
      where: { businessId },
      create: { businessId },
      update: {},
    });
  }

  /**
   * Devuelve el id del beneficio a usar: el existente si se pasó uno, o uno
   * nuevo creado con ese título. Reusa por título para que reenviar el
   * mismo paso no cree duplicados.
   */
  private async resolveBenefit(
    businessId: string,
    benefitId: string | undefined,
    title: string | undefined,
    type: BenefitType,
  ): Promise<string | null> {
    if (benefitId) {
      const existing = await this.prisma.benefit.findFirst({
        where: { id: benefitId, businessId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Beneficio no encontrado');
      return existing.id;
    }
    const name = title?.trim();
    if (!name) return null;

    const sameTitle = await this.prisma.benefit.findFirst({
      where: { businessId, title: name },
      select: { id: true },
    });
    if (sameTitle) return sameTitle.id;

    const created = await this.prisma.benefit.create({
      data: { businessId, title: name, type, active: false },
      select: { id: true },
    });
    return created.id;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'negocio';

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.business.findFirst({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
