import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Benefit,
  BenefitIssuanceSource,
  BenefitType,
  Business,
  CheckinPresenceMode,
  CustomerEventType,
  VisitVerificationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { BenefitsService } from '../benefits/benefits.service';
import { PublicMessagingService } from '../public/public-messaging.service';
import { WHATSAPP_MIN_SEND_INTERVAL_MS } from '../../jobs/whatsapp-provider';
import { VisitSourcesRepository } from '../visit-sources/visit-sources.repository';
import { VisitsRepository } from './visits.repository';
import { CustomerSessionsRepository } from './customer-sessions.repository';
import { CustomerVerificationsRepository } from './customer-verifications.repository';
import { CustomerEventsRepository } from './customer-events.repository';
import { isCheckinV2 } from '../../common/experience/experience.util';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import { MissionProgressService } from '../missions/mission-progress.service';
import { RewardGoalFeedbackService } from '../reward-goals/reward-goal-feedback.service';
import { FlikkerAccountService } from '../flikker-account/flikker-account.service';
import { PresenceChallengeService } from './presence-challenge.service';

// Client-emittable timeline events (whitelist — never trust an arbitrary type).
/**
 * Espera entre dos envíos al proveedor — ver `WHATSAPP_MIN_SEND_INTERVAL_MS`.
 *
 * `unref()` a propósito: esta espera corre en una cadena fire-and-forget, así
 * que no debe mantener vivo el proceso por sí sola. En el servidor da igual
 * (el HTTP lo mantiene vivo igual), pero sin esto un test que registra un
 * cliente deja el worker de Jest colgado 5 segundos esperando un timer que a
 * nadie le importa.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

const CLIENT_EVENTS: Record<string, CustomerEventType> = {
  review_prompt_shown: CustomerEventType.review_prompt_shown,
  review_link_clicked: CustomerEventType.review_link_clicked,
  benefit_viewed: CustomerEventType.benefit_viewed,
};

type BusinessForCheckin = Pick<
  Business,
  | 'id'
  | 'name'
  | 'logoUrl'
  | 'primaryColor'
  | 'googleBusinessProfileUrl'
  | 'phone'
  | 'timezone'
  | 'checkinMinHoursBetweenVisits'
  | 'checkinMaxVisitsPerDay'
  | 'checkinReviewPromptEveryDays'
  | 'experienceVersion'
  | 'loyaltyCardColor'
  | 'loyaltyCardTextColor'
  | 'loyaltyCardBackgroundImage'
  | 'loyaltyStampAreaColor'
  | 'loyaltyStampColor'
  | 'loyaltyStampIcon'
  | 'loyaltyShowBusinessName'
  | 'loyaltyStampBackgroundPattern'
  | 'loyaltyStampBackgroundOpacity'
  | 'checkinWelcomeMessage'
  | 'welcomeBenefitId'
  | 'checkinBackgroundColor'
  | 'checkinPresenceMode'
>;

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: VisitSourcesRepository,
    private readonly visits: VisitsRepository,
    private readonly sessions: CustomerSessionsRepository,
    private readonly verifications: CustomerVerificationsRepository,
    private readonly events: CustomerEventsRepository,
    private readonly benefits: BenefitsService,
    private readonly messaging: PublicMessagingService,
    private readonly rewardGoals: RewardGoalOrchestratorService,
    private readonly missions: MissionProgressService,
    private readonly rewardGoalFeedback: RewardGoalFeedbackService,
    private readonly flikkerAccount: FlikkerAccountService,
    private readonly presence: PresenceChallengeService,
  ) {}

  // ── Landing (GET) ──────────────────────────────────────────────────────────

  /** Resolves a source token to public landing data and records the scan. */
  async resolveLanding(token: string) {
    const { source, business } = await this.resolveSource(token);

    // Best-effort scan counter bump (per-source metric). Never blocks.
    void this.sources.bumpScan(source.id).catch(() => undefined);

    const benefit = await this.benefits.resolveActiveBenefit(business.id);

    return {
      source: { name: source.name, type: source.type },
      business: this.publicBusinessInfo(business),
      benefit: toPublicBenefit(benefit),
      benefitText: benefit?.title ?? null,
      // Programa → Página de inscripción. Encabezado propio y OPCIONAL — a
      // propósito no se mezcla con `benefitText`: ese campo también decide
      // el subtítulo/botón de esta misma pantalla y el mensaje de WhatsApp
      // post-registro, y pisarlo rompería esas otras dos decisiones.
      welcomeMessage: business.checkinWelcomeMessage ?? null,
      // La pantalla necesita saber si tiene que pedir el código del local
      // ANTES de enviar. Nunca viaja el código en sí: eso lo entregaría a
      // cualquiera que abra el link desde su casa, que es justo lo que este
      // mecanismo evita.
      presence: this.presenceRequirement(business),
    };
  }

  // ── First visit (register) ───────────────────────────────────────────────────

  async register(
    token: string,
    input: {
      name: string;
      phone: string;
      birthdate?: string;
      presenceCode?: string;
    },
    userAgent?: string | null,
  ) {
    const { source, business } = await this.resolveSource(token);
    // Antes de crear NADA (cliente, visita, sesión): sin prueba de presencia
    // este registro no existe.
    const presenceChallengeId = this.requirePresence(
      business,
      input.presenceCode,
    );

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(input.phone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }

    const existing = await this.prisma.customer.findFirst({
      where: { businessId: business.id, phoneE164, isActive: true },
      select: { id: true },
    });

    // Security: a known phone must not grant a session by number alone. Route to
    // WhatsApp-verified recovery instead of silently logging in / creating data.
    if (existing) {
      return { status: 'exists' as const, requiresVerification: true };
    }

    const birthday = parseBirthday(input.birthdate);
    const customer = await this.prisma.customer.create({
      data: {
        businessId: business.id,
        name: input.name.trim(),
        phoneE164,
        origin: 'qr',
        ...(birthday ? { birthday } : {}),
      },
      select: { id: true, name: true },
    });

    const benefit = await this.benefits.resolveActiveBenefit(
      business.id,
      undefined,
      customer.id,
    );
    if (benefit && benefit.type === BenefitType.raffle) {
      void this.benefits
        .registerParticipation(business.id, benefit.id, customer.id)
        .catch(() => undefined);
    }

    // First visit — organic, no attribution (never a return).
    const result = await this.visits.registerVisit({
      businessId: business.id,
      customerId: customer.id,
      sourceId: source.id,
      verificationType: VisitVerificationType.manual,
      timezone: business.timezone,
      minHoursBetweenVisits: business.checkinMinHoursBetweenVisits,
      maxVisitsPerDay: business.checkinMaxVisitsPerDay,
      attribute: false,
      presenceChallengeId,
    });
    const visitId = result.created ? result.visit.id : null;

    await this.events.emit({
      businessId: business.id,
      customerId: customer.id,
      type: CustomerEventType.customer_registered,
      sourceId: source.id,
    });
    if (result.created) {
      await this.events.emit({
        businessId: business.id,
        customerId: customer.id,
        type: CustomerEventType.visit_created,
        visitId,
        sourceId: source.id,
        metadata: { first: true },
      });
    }

    // Outbound side effects (welcome, owner ping, review request).
    //
    // Van EN SERIE y espaciados, no en paralelo (bug real — caso David
    // García): WaSenderAPI acepta 1 mensaje cada 5 segundos por cuenta, así
    // que disparar los dos WhatsApp del registro a la vez hacía que el
    // proveedor rechazara uno con "account protection". Todo esto sigue
    // siendo fire-and-forget: el `void` envuelve la cadena entera, así que
    // la espera NO agrega latencia a la respuesta del check-in.
    //
    // El welcome del CLIENTE va primero a propósito: si algo se pierde, que
    // no sea el mensaje de la persona que acaba de registrarse.
    void (async () => {
      // El link de Mi Flikker viaja DENTRO del welcome — un solo mensaje,
      // nunca dos. `claimWelcomeLink` devuelve null si este teléfono ya lo
      // recibió antes (otro negocio, otra visita).
      const miFlikkerLink =
        await this.flikkerAccount.claimWelcomeLink(phoneE164);

      const delivered = await this.messaging.sendWelcome(
        phoneE164,
        customer.name,
        business.name,
        benefit?.title ?? null,
        benefit?.type ?? null,
        miFlikkerLink,
      );

      // Si el proveedor no lo tomó, el link NO se envió: se devuelve el
      // reclamo para que el próximo registro de este teléfono lo reintente.
      // Sin esto, la cuenta quedaba marcada como "welcome enviado" para
      // siempre y el cliente no lo recibía nunca.
      if (miFlikkerLink && !delivered) {
        await this.flikkerAccount.releaseWelcomeLink(phoneE164);
      }

      await sleep(WHATSAPP_MIN_SEND_INTERVAL_MS);
      await this.messaging.sendOwnerNotification(
        business.id,
        business.name,
        business.phone,
        customer.name,
      );
    })();

    // El recordatorio queda atado a ESTA visita: dentro de una hora se le
    // pregunta a `visitId`, no a "la última visita del cliente".
    void this.messaging.enqueueReviewRequest(
      business.id,
      customer.id,
      null,
      visitId,
    );

    const session = await this.sessions.issue(
      business.id,
      customer.id,
      userAgent,
    );

    // Regalo de bienvenida — SOLO acá, en el registro. Nunca en `checkin()`,
    // así no puede volver a emitirse en visitas posteriores. Best-effort: si
    // falla, el registro igual queda hecho.
    await this.benefits
      .grantWelcomeGift(business.id, customer.id)
      .catch(() => null);

    const personal = await this.buildPersonalSpace(business, customer.id, {
      // First visit always asks for the review — it's the primary action.
      forceReviewPrompt: true,
      ensureCode: true,
      justVisited: result.created,
      visitOccurredAt: result.created ? result.visit.occurredAt : undefined,
    });

    return {
      status: 'registered' as const,
      sessionToken: session.rawToken,
      expiresAt: session.expiresAt.toISOString(),
      personal,
    };
  }

  // ── Return visit (checkin) — recognized via persistent session ───────────────

  async checkin(
    token: string,
    sessionRawToken: string | undefined,
    presenceCode?: string,
  ) {
    const { source, business } = await this.resolveSource(token);
    const session = await this.requireSession(sessionRawToken, business.id);

    // Este es EL camino que un link guardado en casa reproduce: token
    // estático en la URL + cookie de sesión de larga vida. La prueba de
    // presencia es lo único que hace que abrirlo mañana desde afuera no
    // acredite una visita nueva.
    const presenceChallengeId = this.requirePresence(business, presenceCode);

    const customer = await this.getCustomerOrThrow(
      business.id,
      session.customerId,
    );

    const result = await this.visits.registerVisit({
      businessId: business.id,
      customerId: customer.id,
      sourceId: source.id,
      verificationType: VisitVerificationType.persistent_session,
      timezone: business.timezone,
      minHoursBetweenVisits: business.checkinMinHoursBetweenVisits,
      maxVisitsPerDay: business.checkinMaxVisitsPerDay,
      attribute: true,
      presenceChallengeId,
    });

    await this.events.emit({
      businessId: business.id,
      customerId: customer.id,
      type: CustomerEventType.customer_session_restored,
      sourceId: source.id,
    });
    await this.emitVisitOutcome(business.id, customer.id, source.id, result);

    const personal = await this.buildPersonalSpace(business, customer.id, {
      ensureCode: true,
      justVisited: result.created,
      visitOccurredAt: result.created ? result.visit.occurredAt : undefined,
    });

    return {
      status: result.created ? ('checked_in' as const) : ('duplicate' as const),
      duplicateReason: result.created ? undefined : result.reason,
      personal,
    };
  }

  // ── Personal space (me) ──────────────────────────────────────────────────────

  async me(sessionRawToken: string | undefined) {
    const session = await this.sessions.resolveLive(sessionRawToken ?? '');
    if (!session) throw new UnauthorizedException('No session');
    const business = await this.getBusinessOrThrow(session.businessId);
    const customer = await this.getCustomerOrThrow(
      business.id,
      session.customerId,
    );
    return this.buildPersonalSpace(business, customer.id, {});
  }

  // ── Feedback ("¿Cómo fue tu experiencia?") — Fase E §9 pilot ask ─────────────

  /**
   * Anchored to the customer's own most recent Visit, resolved server-side —
   * never a client-supplied visit id, so there is nothing to trick this into
   * scoring feedback (or a bonus stamp) onto someone else's visit.
   */
  async submitFeedback(
    sessionRawToken: string | undefined,
    score: number,
    comment: string | undefined,
  ) {
    const session = await this.sessions.resolveLive(sessionRawToken ?? '');
    if (!session) throw new UnauthorizedException('No session');
    const business = await this.getBusinessOrThrow(session.businessId);
    const customer = await this.getCustomerOrThrow(
      business.id,
      session.customerId,
    );

    const lastVisit = await this.visits.findLastByCustomer(
      business.id,
      customer.id,
    );
    if (!lastVisit) {
      throw new NotFoundException('No hay una visita reciente para calificar');
    }

    const result = await this.rewardGoalFeedback.submit(
      business.id,
      customer.id,
      lastVisit.id,
      score,
      comment,
    );

    if (!result.alreadySubmitted) {
      await this.events.emit({
        businessId: business.id,
        customerId: customer.id,
        type: CustomerEventType.feedback_submitted,
        visitId: lastVisit.id,
        metadata: { score, bonusGranted: result.bonusGranted },
      });
    }

    return {
      alreadySubmitted: result.alreadySubmitted,
      bonusGranted: result.bonusGranted,
      offerGoogle:
        result.offerGoogle && Boolean(business.googleBusinessProfileUrl),
      googleUrl: business.googleBusinessProfileUrl,
      rewardGoal: result.rewardGoal,
    };
  }

  // ── Recovery (WhatsApp one-time code) ────────────────────────────────────────

  /**
   * Starts profile recovery. Always responds `{ sent: true }` to avoid phone
   * enumeration; a code is actually sent only when the phone matches a customer.
   */
  async recoverStart(token: string, phone: string) {
    const { business } = await this.resolveSource(token);

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(phone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { businessId: business.id, phoneE164, isActive: true },
      select: { id: true },
    });

    if (customer) {
      const { code } = await this.verifications.start(business.id, customer.id);
      if (code) {
        void this.messaging.sendVerificationCode(
          phoneE164,
          business.name,
          code,
        );
      }
    }

    return { sent: true as const };
  }

  /**
   * Completes recovery: validates the code, issues a session, and checks the
   * customer in. Until the code is validated no session/benefits/history are
   * exposed.
   */
  async recoverVerify(
    token: string,
    phone: string,
    code: string,
    userAgent?: string | null,
    presenceCode?: string,
  ) {
    const { source, business } = await this.resolveSource(token);
    // Recuperar el perfil también crea una `Visit`, así que es una tercera
    // puerta al mismo hecho y necesita la misma prueba.
    const presenceChallengeId = this.requirePresence(business, presenceCode);

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(phone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { businessId: business.id, phoneE164, isActive: true },
      select: { id: true, name: true },
    });
    // Generic failure — never reveal whether the phone exists.
    if (!customer) throw new UnauthorizedException('Código inválido');

    const ok = await this.verifications.verify(business.id, customer.id, code);
    if (!ok) throw new UnauthorizedException('Código inválido');

    const session = await this.sessions.issue(
      business.id,
      customer.id,
      userAgent,
    );

    const result = await this.visits.registerVisit({
      businessId: business.id,
      customerId: customer.id,
      sourceId: source.id,
      verificationType: VisitVerificationType.persistent_session,
      timezone: business.timezone,
      minHoursBetweenVisits: business.checkinMinHoursBetweenVisits,
      maxVisitsPerDay: business.checkinMaxVisitsPerDay,
      attribute: true,
      presenceChallengeId,
    });

    await this.events.emit({
      businessId: business.id,
      customerId: customer.id,
      type: CustomerEventType.customer_session_restored,
      sourceId: source.id,
      metadata: { via: 'recovery' },
    });
    await this.emitVisitOutcome(business.id, customer.id, source.id, result);

    const personal = await this.buildPersonalSpace(business, customer.id, {
      ensureCode: true,
      justVisited: result.created,
      visitOccurredAt: result.created ? result.visit.occurredAt : undefined,
    });

    return {
      status: 'restored' as const,
      sessionToken: session.rawToken,
      expiresAt: session.expiresAt.toISOString(),
      personal,
    };
  }

  // ── Logout / cambiar de cuenta ───────────────────────────────────────────────

  async logout(sessionRawToken: string | undefined) {
    if (sessionRawToken) await this.sessions.revoke(sessionRawToken);
    return { ok: true as const };
  }

  // ── Client-emitted timeline events ───────────────────────────────────────────

  async emitClientEvent(
    token: string,
    type: string,
    sessionRawToken: string | undefined,
  ) {
    const mapped = CLIENT_EVENTS[type];
    if (!mapped) throw new BadRequestException('Evento no soportado');

    const { source, business } = await this.resolveSource(token);
    const session = await this.sessions.resolveLive(sessionRawToken ?? '');
    // No session → nothing to attribute the event to. Silent no-op (not an error)
    // so the public page never breaks over analytics.
    if (!session || session.businessId !== business.id) {
      return { ok: true as const, recorded: false };
    }

    await this.events.emit({
      businessId: business.id,
      customerId: session.customerId,
      type: mapped,
      sourceId: source.id,
    });
    return { ok: true as const, recorded: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * The single chokepoint of the public flow: landing, register, checkin,
   * recover and event all go through here.
   *
   * A business still on LEGACY is rejected with the same 404 as an unknown
   * token, so the response never reveals that the source exists. Because this
   * throws before anything else runs, a legacy business can never get a Visit,
   * a CustomerSession, a CustomerEvent, an OTP or a scan counter bump.
   */
  private async resolveSource(token: string) {
    const source = await this.sources.findByToken(token);
    if (
      !source ||
      !source.isActive ||
      !source.business.isActive ||
      !isCheckinV2(source.business)
    ) {
      throw new NotFoundException('Check-in no disponible');
    }
    const business = await this.getBusinessOrThrow(source.businessId);
    return { source, business };
  }

  /**
   * Also enforces the rollout flag, which is what protects the session-based
   * endpoints (`me`) that receive no token to resolve a source from.
   */
  private async getBusinessOrThrow(
    businessId: string,
  ): Promise<BusinessForCheckin> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, isActive: true },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        googleBusinessProfileUrl: true,
        phone: true,
        timezone: true,
        checkinMinHoursBetweenVisits: true,
        checkinMaxVisitsPerDay: true,
        checkinReviewPromptEveryDays: true,
        experienceVersion: true,
        loyaltyCardColor: true,
        loyaltyCardTextColor: true,
        loyaltyCardBackgroundImage: true,
        loyaltyStampAreaColor: true,
        loyaltyStampColor: true,
        loyaltyStampIcon: true,
        loyaltyShowBusinessName: true,
        loyaltyStampBackgroundPattern: true,
        loyaltyStampBackgroundOpacity: true,
        checkinWelcomeMessage: true,
        welcomeBenefitId: true,
        checkinBackgroundColor: true,
        checkinPresenceMode: true,
      },
    });
    if (!business || !isCheckinV2(business)) {
      throw new NotFoundException('Negocio no disponible');
    }
    return business;
  }

  /**
   * Puerta única de prueba de presencia. Todo camino que pueda CREAR una
   * `Visit` pasa por acá — registro, check-in reconocido y recuperación por
   * WhatsApp. Si faltara en uno solo, ese sería el camino que un link
   * guardado usaría, y las otras dos puertas no servirían de nada.
   *
   * Negocio en `off` (todos, hasta que su dueño lo prenda): devuelve `null`
   * y nada cambia respecto de hoy.
   */
  private requirePresence(
    business: BusinessForCheckin,
    presenceCode: string | undefined,
  ): string | null {
    if (!this.presence.isRequired(business)) return null;

    const challenge = this.presence.verify(business.id, presenceCode);
    if (!challenge) {
      // Mismo mensaje para "no mandaste código", "código viejo" y "código
      // inventado": distinguirlos le diría a alguien que está probando
      // desde su casa cuál de las tres cosas le falta.
      throw new BadRequestException({
        code: 'presence_required',
        message:
          'Pedí el código que se muestra en el local para registrar tu visita.',
      });
    }
    return challenge.challengeId;
  }

  /** ¿La pantalla pública tiene que pedir el código antes de enviar? */
  private presenceRequirement(business: BusinessForCheckin) {
    return {
      required: this.presence.isRequired(business),
      mode: business.checkinPresenceMode ?? CheckinPresenceMode.off,
    };
  }

  private async getCustomerOrThrow(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, isActive: true },
      select: { id: true, name: true },
    });
    if (!customer) throw new UnauthorizedException('Perfil no disponible');
    return customer;
  }

  private async requireSession(
    sessionRawToken: string | undefined,
    businessId: string,
  ) {
    const session = await this.sessions.resolveLive(sessionRawToken ?? '');
    if (!session || session.businessId !== businessId) {
      // Not recognized → the web layer shows the first-visit form.
      throw new UnauthorizedException('No recognized session');
    }
    return session;
  }

  private async emitVisitOutcome(
    businessId: string,
    customerId: string,
    sourceId: string,
    result: Awaited<ReturnType<VisitsRepository['registerVisit']>>,
  ) {
    if (result.created) {
      await this.events.emit({
        businessId,
        customerId,
        type: CustomerEventType.visit_created,
        visitId: result.visit.id,
        sourceId,
        metadata: {
          isReturn: result.isReturn,
          attributionType: result.visit.attributionType,
        },
      });
    } else {
      await this.events.emit({
        businessId,
        customerId,
        type: CustomerEventType.visit_duplicate_prevented,
        sourceId,
        metadata: { reason: result.reason },
      });
    }
  }

  private async buildPersonalSpace(
    business: BusinessForCheckin,
    customerId: string,
    opts: {
      forceReviewPrompt?: boolean;
      ensureCode?: boolean;
      /**
       * True only right after a real, newly-created Visit — the Reward Goal
       * engine only ever evaluates unlock/creation from here, never from a
       * plain read (`me`) or a dedup-prevented duplicate scan (Fase E §27).
       */
      justVisited?: boolean;
      /**
       * El `occurredAt` REAL de esa visita — nunca `new Date()` tomado acá.
       * Bug real corregido: entre registrar la Visit y llegar a este punto
       * corren varios `await` (eventos, WhatsApp, sesión, regalo de
       * bienvenida), así que un "ahora" tomado de nuevo acá siempre cae
       * DESPUÉS del `occurredAt` real de la visita — y todo el progreso de
       * sellos cuenta visitas estrictamente posteriores a `activatedAt`
       * (que el engine fija a partir de este mismo "ahora"). Sin este
       * timestamp real, la visita fundadora de una tarjeta nueva nunca
       * podía contar como su propio primer sello.
       */
      visitOccurredAt?: Date;
    },
  ) {
    const customer = await this.getCustomerOrThrow(business.id, customerId);

    const [total, lastVisit, benefit, rewardGoal, missions] = await Promise.all(
      [
        this.visits.countByCustomer(business.id, customerId),
        this.visits.findLastByCustomer(business.id, customerId),
        this.benefits.resolveActiveBenefit(business.id, undefined, customerId),
        opts.justVisited
          ? this.rewardGoals.afterVisit(
              business.id,
              customerId,
              business.timezone,
              opts.visitOccurredAt,
            )
          : this.rewardGoals.currentView(business.id, customerId),
        // Misiones: mismo criterio que los sellos. Una visita real inscribe y
        // evalúa; una simple lectura de la pantalla NUNCA completa una misión
        // ni emite un premio.
        opts.justVisited
          ? this.missions.afterVisit(
              business.id,
              customerId,
              opts.visitOccurredAt,
            )
          : this.missions.currentView(business.id, customerId),
      ],
    );

    // For redeemable benefits (not raffle/none), issue the code on write paths
    // and always surface its current state. `me` (read-only) never issues.
    let redemption: { code: string; redeemed: boolean } | null = null;
    if (benefit && this.benefits.isRedeemable(benefit.type)) {
      if (opts.ensureCode) {
        await this.benefits.ensureRedemptionCode(
          business.id,
          benefit.id,
          customerId,
          BenefitIssuanceSource.CHECKIN_ACTIVE,
        );
      }
      const state = await this.benefits.findRedemption(
        business.id,
        benefit.id,
        customerId,
        BenefitIssuanceSource.CHECKIN_ACTIVE,
      );
      if (state?.redemptionCode) {
        redemption = {
          code: state.redemptionCode,
          redeemed: state.redeemedAt != null,
        };
      }
    }

    const showReview =
      opts.forceReviewPrompt ??
      (await this.shouldPromptReview(
        business.id,
        customerId,
        business.checkinReviewPromptEveryDays,
      ));

    const publicBenefit = toPublicBenefit(benefit);
    // Regalo de bienvenida: campo propio, separado de `benefit`. Se apaga
    // solo una vez canjeado, así que no reaparece como oferta.
    const welcomeGift = await this.benefits.getWelcomeGiftState(
      business.id,
      customerId,
    );

    // Otros beneficios ya otorgados (típicamente por una promoción manual)
    // que no son ni el activo del check-in ni el regalo de bienvenida —
    // deben verse igual, sin importar cuál sea hoy el `active`.
    const otherBenefits = await this.benefits.getOtherAvailableBenefits(
      business.id,
      customerId,
      [benefit?.id, business.welcomeBenefitId],
    );

    return {
      customer: { name: customer.name },
      visits: {
        total,
        lastAt: lastVisit?.occurredAt.toISOString() ?? null,
      },
      benefit: publicBenefit ? { ...publicBenefit, redemption } : null,
      // Array vacío cuando el negocio no tiene misiones vivas — la pantalla
      // no debe inventar un "0 de 3" que nadie propuso.
      missions,
      welcomeGift,
      otherBenefits: otherBenefits.map((b) => ({
        type: b.type,
        title: b.title,
        description: b.description,
        terms: b.terms,
        redemption: { code: b.code, redeemed: false },
      })),
      rewardGoal,
      reviewPrompt: {
        show: showReview,
        googleUrl: business.googleBusinessProfileUrl,
      },
    };
  }

  private async shouldPromptReview(
    businessId: string,
    customerId: string,
    everyDays: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    const hasReview = await this.prisma.googleReview.findFirst({
      where: { businessId, attributedMessage: { customerId } },
      select: { id: true },
    });
    if (hasReview) return false;

    const lastPrompt = await this.prisma.customerEvent.findFirst({
      where: {
        businessId,
        customerId,
        type: CustomerEventType.review_prompt_shown,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!lastPrompt) return true;

    const elapsedDays =
      (now.getTime() - lastPrompt.createdAt.getTime()) / 86_400_000;
    return elapsedDays >= everyDays;
  }

  private publicBusinessInfo(business: BusinessForCheckin) {
    return {
      businessName: business.name,
      logoUrl: business.logoUrl ?? null,
      primaryColor: business.primaryColor ?? null,
      checkinBackgroundColor: business.checkinBackgroundColor ?? null,
      googleBusinessProfileUrl: business.googleBusinessProfileUrl ?? null,
      // Apariencia de la tarjeta de sellos. Null = usar la marca del
      // negocio, que es el comportamiento previo a Programa → Diseño.
      loyaltyCardColor: business.loyaltyCardColor ?? null,
      loyaltyCardTextColor: business.loyaltyCardTextColor ?? null,
      loyaltyCardBackgroundImage: business.loyaltyCardBackgroundImage ?? null,
      loyaltyStampAreaColor: business.loyaltyStampAreaColor ?? null,
      loyaltyStampColor: business.loyaltyStampColor ?? null,
      loyaltyStampIcon: business.loyaltyStampIcon ?? null,
      loyaltyShowBusinessName: business.loyaltyShowBusinessName,
      loyaltyStampBackgroundPattern:
        business.loyaltyStampBackgroundPattern ?? null,
      loyaltyStampBackgroundOpacity:
        business.loyaltyStampBackgroundOpacity ?? null,
    };
  }
}

function toPublicBenefit(benefit: Benefit | null) {
  if (!benefit) return null;
  return {
    type: benefit.type,
    title: benefit.title,
    description: benefit.description,
    terms: benefit.terms,
  };
}

function parseBirthday(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
