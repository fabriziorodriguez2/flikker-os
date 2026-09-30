import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { parseEmail } from '../../common/utils/email.util';
import { CreateCheckoutIntentDto } from './dto/create-checkout-intent.dto';
import {
  MercadoPagoSubscriptionProvider,
  MercadoPagoSubscriptionError,
  type CreatePendingSubscriptionResult,
} from './mercado-pago-subscription.provider';

/**
 * Intenciones de compra que llegan de la landing pública.
 *
 * Todo lo que hace esta tanda: normalizar, persistir un `CheckoutLead` en
 * PENDING, y devolver su id. Nada de Mercado Pago, nada de crear cuentas.
 *
 * Por qué no crea User ni Business: hasta que un pago no esté aprobado, esto
 * es una persona que llenó un formulario. Crear un negocio por cada
 * formulario llenaría el panel de platform admin de entidades fantasma y
 * haría que "cantidad de negocios" cuente intenciones en vez de clientes.
 * La identidad se resuelve después del pago, con el `id` de este lead como
 * hilo conductor.
 */
@Injectable()
export class CheckoutLeadsService {
  private readonly logger = new Logger(CheckoutLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoSubscriptionProvider,
  ) {}

  /**
   * Crea la intención, o devuelve la que ya existía para esta
   * `idempotencyKey`.
   *
   * La respuesta es deliberadamente mínima —`id` y `status`— y no incluye
   * nada de lo que la persona escribió. Es un endpoint público sin auth: si
   * devolviera el email o el teléfono normalizado, alguien con un id podría
   * usarlo para confirmar datos personales.
   */
  async createIntent(
    dto: CreateCheckoutIntentDto,
    idempotencyKey?: string,
  ): Promise<{ id: string; status: CheckoutLeadStatus }> {
    // Las dos tiran BadRequestException con mensaje propio si algo no
    // cierra. Son las mismas funciones que usa el resto del repo: un email
    // guardado acá se ve igual que uno guardado en onboarding.
    const email = parseEmail(dto.email);
    const phoneE164 = normalizeToE164(dto.phone);

    const key = idempotencyKey?.trim() || null;

    /*
      Idempotencia con el mismo idiom que `OwnerLifecycleEmailLog.sendOnce`:
      intentar crear, y tratar P2002 como "ya existía". No se consulta antes
      de escribir porque un check-then-act pierde la carrera justamente en
      el caso que importa — el doble click, donde los dos requests llegan
      casi juntos y los dos verían "no existe".
    */
    if (key) {
      try {
        return await this.insert(dto, email, phoneE164, key);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await this.prisma.checkoutLead.findFirst({
            where: { idempotencyKey: key },
            select: { id: true, status: true },
          });
          // La fila tiene que estar: el P2002 vino de ese mismo unique.
          if (existing) {
            this.logger.log(
              `Checkout intent reusado por idempotency key (lead ${existing.id}).`,
            );
            return existing;
          }
        }
        throw error;
      }
    }

    // Sin key, cada POST es una intención nueva. Es lo correcto: la misma
    // persona puede volver otro día, cambiar de plan o reintentar, y nada
    // de eso debe chocar contra un lead viejo.
    return this.insert(dto, email, phoneE164, null);
  }

  private async insert(
    dto: CreateCheckoutIntentDto,
    email: string,
    phoneE164: string,
    idempotencyKey: string | null,
  ): Promise<{ id: string; status: CheckoutLeadStatus }> {
    const lead = await this.prisma.checkoutLead.create({
      data: {
        name: dto.name.trim(),
        businessName: dto.businessName.trim(),
        email,
        phoneE164,
        plan: dto.plan,
        // Único estado que esta tanda escribe. El resto del enum existe
        // para que la Parte 3 no invente otra semántica.
        status: CheckoutLeadStatus.PENDING,
        idempotencyKey,
      },
      select: { id: true, status: true },
    });

    /*
      El log lleva el id y el plan, nunca el email ni el teléfono. Un lead es
      PII: los logs se agregan, se reenvían a terceros y se guardan mucho más
      tiempo que la fila. El id alcanza para encontrar todo lo demás en la
      base cuando hace falta de verdad.
    */
    this.logger.log(`Checkout intent creado (lead ${lead.id}, ${dto.plan}).`);
    return lead;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Parte 3 — crear la subscription real en Mercado Pago
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Transforma un `CheckoutLead` PENDING en una subscription real de
   * Mercado Pago (`/preapproval`), y devuelve el `checkoutUrl`
   * (`init_point`) al que hay que redirigir.
   *
   * ## Reglas de estado
   *
   * - PENDING → reclama el lead (pasa a CHECKOUT_CREATING) y crea la
   *   subscription.
   * - CHECKOUT_CREATED → devuelve el `checkoutUrl` YA guardado. Es un
   *   SELECT, nunca una llamada nueva a MP ni una subscription nueva —
   *   así el doble click, el refresh y el reintento del usuario son
   *   gratis y seguros.
   * - CHECKOUT_CREATING → otro request está creando la subscription EN
   *   ESTE MOMENTO (ver "Concurrencia" abajo).
   * - CHECKOUT_RECONCILIATION_REQUIRED → 409 explícito, SIN reintentar el
   *   POST. Ver el comentario del enum en `schema.prisma`: significa que
   *   un intento anterior terminó en un resultado ambiguo (timeout/5xx) y
   *   nadie sabe con certeza si Mercado Pago llegó a crear la
   *   subscription. Requiere revisión manual — nunca una reconciliación
   *   automática (ver incidente 2026-09-30 en el provider).
   * - PAID → 409: no tiene sentido ofrecer un checkout de algo ya pagado.
   * - FAILED / EXPIRED → 409 explícito. A propósito NO se decide acá una
   *   política de reintento — eso queda para cuando exista el webhook y
   *   se sepa de verdad qué significa cada uno en la práctica.
   *
   * ## Concurrencia — MÁS estricta que la versión con Orders API
   *
   * Mercado Pago NO documenta que `/preapproval` deduplique por
   * `X-Idempotency-Key` de la misma forma que la Orders API — según su
   * propia guía, puede generar una subscription nueva en cada request
   * autenticado. Por eso acá NO alcanza con "que todos llamen a MP con la
   * misma key" (eso SÍ alcanzaba con Orders): la garantía tiene que salir
   * de la base, dejando que llame a MP como máximo UN request a la vez
   * por lead.
   *
   * El mecanismo es un reclamo atómico vía `updateMany`, el mismo idiom
   * de transición guardada que ya usa `RewardGoalUnlockService`:
   *
   *  1. `claimForCreation` intenta `PENDING -> CHECKOUT_CREATING`. Solo un
   *     request gana el `count: 1`. A propósito NO existe reclamo de un
   *     `CHECKOUT_CREATING` viejo/abandonado — ver el incidente
   *     2026-09-30 documentado en el provider: "reconciliar sobre una
   *     ambigüedad automáticamente" es exactamente el patrón que hay que
   *     evitar. Un `CHECKOUT_CREATING` colgado (proceso caído a mitad de
   *     la llamada) queda así hasta revisión manual.
   *  2. El GANADOR es el ÚNICO que llama a
   *     `mercadoPago.createPendingSubscription`.
   *     Los que pierden el reclamo NUNCA llaman a Mercado Pago — evita
   *     exactamente el escenario que preocupa: dos requests concurrentes
   *     leyendo PENDING y creando dos subscriptions.
   *  3. Los que pierden esperan (bounded, `waitForConcurrentCreation`) a
   *     que el ganador termine y releen su resultado. Si el ganador
   *     terminó con un rechazo CONFIRMADO (el reclamo vuelve a PENDING),
   *     el perdedor tiene un intento propio de reclamar y crear. Si
   *     terminó AMBIGUO (`CHECKOUT_RECONCILIATION_REQUIRED`), el perdedor
   *     NO reintenta — cae al 409 del punto 4.
   *  4. Si ninguno de los pasos anteriores resuelve en la ventana de
   *     espera, se devuelve 409 — el frontend puede reintentar (el
   *     endpoint es idempotente por diseño: nunca crea una segunda
   *     subscription).
   *
   * Nunca se marca CHECKOUT_CREATED sin una respuesta real y válida de
   * Mercado Pago (`id` + `init_point`). Si la llamada falla con un
   * rechazo CONFIRMADO (MP respondió que no, ej. 400/401), el lead vuelve
   * a PENDING. Si falla de forma AMBIGUA (timeout, error de red, 5xx/429
   * — no hay certeza de que MP no haya creado la subscription igual), el
   * lead pasa a `CHECKOUT_RECONCILIATION_REQUIRED` y NO se reintenta el
   * POST automáticamente. Nunca FAILED por un error técnico.
   */
  async createCheckout(
    leadId: string,
  ): Promise<{ checkoutUrl: string; status: CheckoutLeadStatus }> {
    const lead = await this.prisma.checkoutLead.findUnique({
      where: { id: leadId },
    });
    if (!lead) throw new NotFoundException('Checkout lead not found');

    if (lead.status === CheckoutLeadStatus.PAID) {
      throw new ConflictException('This checkout has already been paid.');
    }

    if (
      lead.status === CheckoutLeadStatus.FAILED ||
      lead.status === CheckoutLeadStatus.EXPIRED
    ) {
      throw new ConflictException(
        `Cannot create a checkout for a lead in ${lead.status} state.`,
      );
    }

    if (lead.status === CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED) {
      // Un intento anterior terminó ambiguo (timeout/5xx) — puede existir
      // ya una subscription del otro lado que no tenemos forma de
      // confirmar automáticamente. Nunca se reintenta el POST solo desde
      // acá: requiere revisión manual (ver incidente 2026-09-30).
      throw new ConflictException(
        'Este checkout requiere revisión manual antes de continuar — contactá soporte.',
      );
    }

    if (lead.status === CheckoutLeadStatus.CHECKOUT_CREATED) {
      if (lead.checkoutUrl) {
        return { checkoutUrl: lead.checkoutUrl, status: lead.status };
      }
      // Defensivo, no esperado: CHECKOUT_CREATED sin URL guardada. No hay
      // nada seguro que hacer acá sin volver a pasar por todo el flujo de
      // reclamo — cae al bloque de abajo como si fuera PENDING.
    }

    if (!this.mercadoPago.isAvailable()) {
      throw new ServiceUnavailableException(
        'El checkout de Mercado Pago no está disponible en este momento.',
      );
    }

    // Hasta dos vueltas: la primera es el camino normal; la segunda solo
    // se usa si esta request PERDIÓ el reclamo contra otra concurrente Y
    // esa otra terminó fallando (revirtió a PENDING) mientras esperábamos
    // — en ese caso nos toca a nosotros intentar reclamar y crear.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const claimed = await this.claimForCreation(leadId);
      if (claimed) {
        return this.createSubscriptionForClaimedLead(lead);
      }

      const resolved = await this.waitForConcurrentCreation(leadId);
      if (resolved) return resolved;
      // `resolved === null` con la fila vuelta a PENDING: el otro request
      // tuvo un rechazo CONFIRMADO y liberó el reclamo — reintentamos
      // nosotros mismos (única vez). `resolved === null` con la fila en
      // CHECKOUT_RECONCILIATION_REQUIRED, o todavía en CHECKOUT_CREATING
      // tras agotar la espera, cae directo al 409 de abajo — nunca se
      // reintenta sobre una ambigüedad.
    }

    throw new ConflictException(
      'No se pudo completar el checkout en este momento. Probá de nuevo en unos segundos; si el problema persiste, contactá soporte.',
    );
  }

  /**
   * Reclama el derecho exclusivo de llamar a Mercado Pago para este lead.
   *
   * Gana ÚNICAMENTE desde PENDING. A propósito NO reclama un
   * CHECKOUT_CREATING viejo/abandonado — ver el comentario de la clase:
   * ese "reintento automático sobre un estado incierto" es el patrón que
   * causó el incidente 2026-09-30. Un reclamo colgado queda así hasta
   * revisión manual.
   */
  private async claimForCreation(leadId: string): Promise<boolean> {
    const claim = await this.prisma.checkoutLead.updateMany({
      where: { id: leadId, status: CheckoutLeadStatus.PENDING },
      data: {
        status: CheckoutLeadStatus.CHECKOUT_CREATING,
        checkoutClaimedAt: new Date(),
      },
    });
    return claim.count === 1;
  }

  /**
   * El ganador del reclamo: llama a Mercado Pago exactamente una vez y
   * persiste el resultado.
   *
   * La falla se resuelve distinto según su naturaleza (ver
   * `MercadoPagoSubscriptionError.retryable`):
   *   - Rechazo CONFIRMADO (`retryable: false` — MP respondió que no, o
   *     falta configuración): vuelve a PENDING, un intento futuro puede
   *     tomarlo de nuevo con la certeza de que no se creó nada.
   *   - AMBIGUO (`retryable: true`, o cualquier error no reconocido — un
   *     bug propio): pasa a `CHECKOUT_RECONCILIATION_REQUIRED`. NUNCA se
   *     reintenta el POST ni se intenta "reconciliar" solo — ver el
   *     incidente 2026-09-30 documentado en el provider.
   */
  private async createSubscriptionForClaimedLead(lead: {
    id: string;
    email: string;
    plan: CheckoutPlan;
    providerIdempotencyKey: string | null;
  }): Promise<{ checkoutUrl: string; status: CheckoutLeadStatus }> {
    const providerIdempotencyKey = lead.providerIdempotencyKey ?? randomUUID();
    if (!lead.providerIdempotencyKey) {
      // Ya somos el único dueño del reclamo (CHECKOUT_CREATING) — no hace
      // falta un `updateMany` guardado acá, a diferencia del diseño con
      // Orders API: la exclusión mutua ya la dio `claimForCreation`.
      await this.prisma.checkoutLead.update({
        where: { id: lead.id },
        data: { providerIdempotencyKey },
      });
    }

    let result: CreatePendingSubscriptionResult;
    try {
      result = await this.mercadoPago.createPendingSubscription({
        checkoutLeadId: lead.id,
        idempotencyKey: providerIdempotencyKey,
        payerEmail: lead.email,
        plan: lead.plan,
      });
    } catch (error) {
      // Nunca se marca CHECKOUT_CREATED sin confirmación real de MP.
      // `ambiguous` decide a dónde vuelve el lead — ver el comentario de
      // arriba y el incidente 2026-09-30 en el provider: un error no
      // reconocido (no `MercadoPagoSubscriptionError`) se trata como
      // AMBIGUO por defecto, nunca como rechazo confirmado.
      const ambiguous =
        !(error instanceof MercadoPagoSubscriptionError) || error.retryable;

      await this.prisma.checkoutLead.updateMany({
        where: { id: lead.id, status: CheckoutLeadStatus.CHECKOUT_CREATING },
        data: ambiguous
          ? // Se mantiene `checkoutClaimedAt` a propósito: es lo único
            // que le dice a quien revise manualmente cuándo se intentó.
            { status: CheckoutLeadStatus.CHECKOUT_RECONCILIATION_REQUIRED }
          : // Rechazo confirmado: el reclamo terminó limpio, no hay nada
            // que investigar más tarde.
            { status: CheckoutLeadStatus.PENDING, checkoutClaimedAt: null },
      });

      if (error instanceof MercadoPagoSubscriptionError) {
        this.logger.warn(
          `No se pudo crear la subscription para lead ${lead.id}: ${error.message} (statusCode=${error.statusCode ?? 'n/a'}, retryable=${error.retryable}, ambiguous=${ambiguous})`,
        );
        throw new ServiceUnavailableException(
          'No pudimos crear el checkout en este momento. Probá de nuevo en unos segundos.',
        );
      }
      this.logger.warn(
        `Error inesperado creando la subscription para lead ${lead.id}: ${error instanceof Error ? error.message : String(error)} — lead movido a CHECKOUT_RECONCILIATION_REQUIRED por precaución.`,
      );
      throw error;
    }

    await this.prisma.checkoutLead.updateMany({
      where: { id: lead.id, status: CheckoutLeadStatus.CHECKOUT_CREATING },
      data: {
        status: CheckoutLeadStatus.CHECKOUT_CREATED,
        paymentProvider: 'MERCADO_PAGO',
        providerSubscriptionId: result.providerSubscriptionId,
        providerStatus: result.providerStatus,
        externalReference: lead.id,
        checkoutUrl: result.checkoutUrl,
        checkoutCreatedAt: new Date(),
        checkoutClaimedAt: null,
      },
    });

    this.logger.log(
      `Subscription creada para lead ${lead.id} (preapproval ${result.providerSubscriptionId}).`,
    );

    return {
      checkoutUrl: result.checkoutUrl,
      status: CheckoutLeadStatus.CHECKOUT_CREATED,
    };
  }

  /**
   * Espera (bounded, sin bloquear indefinidamente) a que OTRO request que
   * ganó el reclamo termine, y relee el resultado — nunca llama a
   * Mercado Pago desde acá.
   *
   * Devuelve el resultado si el otro request terminó en CHECKOUT_CREATED;
   * `null` en cualquier otro caso (incluido "el otro falló y liberó el
   * reclamo" — el caller decide si reintenta tomarlo él mismo).
   */
  private async waitForConcurrentCreation(
    leadId: string,
  ): Promise<{ checkoutUrl: string; status: CheckoutLeadStatus } | null> {
    for (let i = 0; i < CONCURRENT_WAIT_POLLS; i += 1) {
      await sleep(CONCURRENT_WAIT_INTERVAL_MS);
      const fresh = await this.prisma.checkoutLead.findUnique({
        where: { id: leadId },
        select: { status: true, checkoutUrl: true },
      });
      if (
        fresh?.status === CheckoutLeadStatus.CHECKOUT_CREATED &&
        fresh.checkoutUrl
      ) {
        return { checkoutUrl: fresh.checkoutUrl, status: fresh.status };
      }
      if (fresh?.status !== CheckoutLeadStatus.CHECKOUT_CREATING) {
        // El otro request ya no está en vuelo: terminó (PENDING —
        // rechazo confirmado, el caller puede tomarlo de nuevo) o quedó
        // en CHECKOUT_RECONCILIATION_REQUIRED (ambiguo — nunca se
        // reintenta). En cualquiera de los dos casos no hace falta seguir
        // esperando acá; el caller decide qué hacer con cada uno.
        return null;
      }
    }
    return null;
  }
}

/** Cuántas veces, y cada cuánto, un request que perdió el reclamo espera al ganador. */
const CONCURRENT_WAIT_POLLS = 5;
const CONCURRENT_WAIT_INTERVAL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
