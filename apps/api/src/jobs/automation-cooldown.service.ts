import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Política central: como máximo 1 mensaje automático por cliente cada 24h,
 * sin importar cuál automatización lo manda. Se llama justo antes de
 * cualquier envío automático (Retention V2, sellos por vencer, cumpleaños)
 * — nunca antes de promociones, que las decide el dueño, no el motor.
 *
 * Prioridad — determinística, no por horario de cron:
 *   Cumpleaños (1) > Tarjeta completada (2) > Sellos por vencer (3) >
 *   Casi llegás (4) > Te extrañamos (5)
 *
 * Un solo `claim()` atómico NO alcanza para esto: si Retención corre antes
 * que Cumpleaños por un accidente de scheduling, "el primero que escribe
 * gana" le daría el turno a Retención aunque Cumpleaños tenga más
 * prioridad. Por eso el protocolo es en DOS pasos:
 *
 *  1. `reserve()` — anota la intención de contactar a este cliente. Si ya
 *     hay una reserva PENDIENTE de menor prioridad, la reemplaza (roba el
 *     turno) sin tocar el reloj original. Si la reserva existente es de
 *     mayor o igual prioridad, este llamado pierde (`outranked`). Si ya
 *     hubo un envío CONFIRMADO dentro de las últimas 24h, pierde (`blocked`).
 *
 *  2. `confirm()` — recién acá se manda de verdad. Solo confirma si YA
 *     PASÓ el período de gracia de ese `kind` desde que se abrió el turno
 *     (`reservedAt`), y si el turno todavía es suyo (nadie con más
 *     prioridad lo reemplazó mientras tanto). El período de gracia es
 *     CERO para Cumpleaños y Sellos por vencer — nada les puede ganar
 *     salvo entre sí, y ese orden ya lo garantiza que corren siempre en la
 *     misma secuencia dentro de `LifecycleEmailsWorker` (nunca por
 *     scheduling de cron). Progreso/reactivación esperan un margen real,
 *     porque Retention V2 corre en una cola separada que sí puede
 *     adelantarse por accidente.
 *
 * Nada de esto duplica la lógica de cada automatización: quién es elegible
 * sigue siendo pregunta de cada una (reward goals, Retention V2, el sweep
 * de cumpleaños); este servicio solo arbitra el turno una vez que alguien
 * YA decidió que quiere mandar.
 *
 * Atómico bajo concurrencia con el mismo patrón que `ensureRedemptionCode`:
 * un `create()` protegido por `customerId` único gana la primera vez;
 * cualquier disputa después (robar el turno, liberar el cooldown vencido,
 * confirmar) se resuelve con un `updateMany` cuyo `where` incluye la
 * condición que hace válida la operación — si no matchea ninguna fila, la
 * operación perdió la carrera y se reintenta o se reporta como tal.
 */
export type AutomationKind =
  | 'birthday'
  | 'reward_goal_unlocked'
  | 'stamps_expiry'
  | 'progress_reminder'
  | 'reactivation';

export const AUTOMATION_PRIORITY: Record<AutomationKind, number> = {
  birthday: 1,
  reward_goal_unlocked: 2,
  stamps_expiry: 3,
  progress_reminder: 4,
  reactivation: 5,
};

/**
 * Cuánto debe esperar cada `kind` entre reservar y poder confirmar — el
 * margen que le da a una automatización de mayor prioridad para todavía
 * robarle el turno. Cero para las tres de mayor prioridad porque nada puede
 * superarlas salvo entre sí, y ese orden ya está garantizado por código
 * (`LifecycleEmailsWorker` llama a Cumpleaños antes que a Sellos por
 * vencer, siempre, en el mismo proceso). Progreso/reactivación sí necesitan
 * un margen real: Retention V2 corre en una cola separada (BullMQ) que
 * puede adelantarse por un reintento, un worker que arrancó tarde, etc.
 *
 * `reward_goal_unlocked` también usa `claimImmediate` (grace cero) — se
 * dispara en el momento del check-in, no desde un worker secuenciado, así
 * que en el caso extremo de coincidir con Cumpleaños en el mismo instante
 * para el mismo cliente, gana el que reserva primero (no necesariamente el
 * de mayor prioridad). Eso nunca duplica un envío — el cooldown de 24h
 * sigue garantizando como mucho uno — solo puede, en ese empate rarísimo,
 * ceder el turno del día equivocado. Construir el protocolo real de
 * reserva-y-confirmar-más-tarde (como Retention V2) para este caso
 * requeriría una cola nueva solo para esto — desproporcionado para un
 * envío disparado una vez por check-in.
 */
const GRACE_MS: Record<AutomationKind, number> = {
  birthday: 0,
  reward_goal_unlocked: 0,
  stamps_expiry: 0,
  progress_reminder: 10 * 60_000,
  reactivation: 10 * 60_000,
};

const DEFAULT_COOLDOWN_HOURS = 24;

export type ReserveResult = 'reserved' | 'outranked' | 'blocked';
export type ConfirmResult = 'confirmed' | 'not_ready' | 'outranked';
export type ClaimResult = 'confirmed' | 'outranked' | 'blocked';

@Injectable()
export class AutomationCooldownService {
  private readonly logger = new Logger(AutomationCooldownService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Cuánto hay que esperar entre reservar y confirmar, para este `kind`. */
  gracePeriodMs(kind: AutomationKind): number {
    return GRACE_MS[kind];
  }

  /**
   * Reserva el turno de este cliente para `kind`, robándolo de cualquier
   * automatización de menor prioridad que lo tuviera pendiente.
   */
  async reserve(input: {
    businessId: string;
    customerId: string;
    kind: AutomationKind;
    now: Date;
    cooldownHours?: number;
  }): Promise<ReserveResult> {
    const { businessId, customerId, kind, now } = input;

    try {
      await this.prisma.customerAutomationContact.create({
        data: {
          customerId,
          businessId,
          kind,
          status: 'pending',
          reservedAt: now,
        },
      });
      return 'reserved';
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }

    const existing = await this.prisma.customerAutomationContact.findUnique({
      where: { customerId },
    });
    if (!existing) {
      // Carrera: la fila que chocó nuestro create() ya no está (no hay un
      // camino de borrado hoy, pero mejor no asumirlo). Reintentar una vez.
      return this.reserve(input);
    }

    if (existing.status === 'confirmed') {
      const cooldownMs =
        (input.cooldownHours ?? DEFAULT_COOLDOWN_HOURS) * 3_600_000;
      const cutoff = new Date(now.getTime() - cooldownMs);
      if (existing.confirmedAt && existing.confirmedAt >= cutoff) {
        return 'blocked';
      }
      // El cooldown ya venció — se libera el turno para un ciclo nuevo,
      // guardado contra otro writer haciendo lo mismo en paralelo.
      const reopened = await this.prisma.customerAutomationContact.updateMany({
        where: {
          customerId,
          status: 'confirmed',
          confirmedAt: { lt: cutoff },
        },
        data: {
          businessId,
          kind,
          status: 'pending',
          reservedAt: now,
          confirmedAt: null,
        },
      });
      return reopened.count > 0 ? 'reserved' : this.reserve(input);
    }

    // existing.status === 'pending'
    if (AUTOMATION_PRIORITY[kind] < AUTOMATION_PRIORITY[existing.kind]) {
      // Mayor prioridad — le roba el turno pendiente al que estaba. El
      // reloj de gracia sigue corriendo desde que el turno se abrió, no
      // desde que esta automatización se sumó.
      const stolen = await this.prisma.customerAutomationContact.updateMany({
        where: {
          customerId,
          status: 'pending',
          kind: existing.kind,
        },
        data: { businessId, kind },
      });
      return stolen.count > 0 ? 'reserved' : this.reserve(input);
    }
    if (AUTOMATION_PRIORITY[kind] === AUTOMATION_PRIORITY[existing.kind]) {
      // El mismo kind reservando de nuevo (reintento) — idempotente.
      return 'reserved';
    }
    return 'outranked';
  }

  /**
   * Confirma el envío — solo si pasó el período de gracia de `kind` y nadie
   * de mayor prioridad le robó el turno mientras tanto. Recién esto habilita
   * mandar de verdad.
   *
   * `skipGraceIfUncontested`: el caller (quien conoce sus propios toggles,
   * ver RetentionV2MessageDispatchService) puede pasar `true` cuando sabe
   * que NADA de mayor prioridad puede aplicar hoy para este negocio — en
   * ese caso el período de gracia no protege de nada real y solo demoraría
   * el envío. No es una excepción a la prioridad (que sigue resolviéndose
   * por `reserve()`), es evitar esperar una amenaza que no existe.
   */
  async confirm(input: {
    customerId: string;
    kind: AutomationKind;
    now: Date;
    skipGraceIfUncontested?: boolean;
  }): Promise<ConfirmResult> {
    const { customerId, kind, now } = input;
    const row = await this.prisma.customerAutomationContact.findUnique({
      where: { customerId },
    });
    if (!row || row.kind !== kind || row.status !== 'pending') {
      return 'outranked';
    }

    const grace = input.skipGraceIfUncontested ? 0 : GRACE_MS[kind];
    if (now.getTime() - row.reservedAt.getTime() < grace) {
      return 'not_ready';
    }

    const confirmed = await this.prisma.customerAutomationContact.updateMany({
      where: { customerId, kind, status: 'pending' },
      data: { status: 'confirmed', confirmedAt: now },
    });
    if (confirmed.count === 0) return 'outranked';
    return 'confirmed';
  }

  /**
   * `reserve()` + `confirm()` en un solo paso, para los `kind` con período
   * de gracia cero (Cumpleaños, Sellos por vencer) — nada los puede superar
   * salvo entre sí, así que no hay nada que esperar.
   */
  async claimImmediate(input: {
    businessId: string;
    customerId: string;
    kind: AutomationKind;
    now: Date;
  }): Promise<ClaimResult> {
    const reserved = await this.reserve(input);
    if (reserved === 'blocked') return 'blocked';
    if (reserved === 'outranked') return 'outranked';

    const confirmed = await this.confirm(input);
    if (confirmed === 'confirmed') return 'confirmed';
    // No debería pasar con gracia cero salvo una carrera genuina — se
    // reporta como perdida en vez de mandar sin confirmar.
    this.logger.warn(
      `claimImmediate: reserve succeeded but confirm returned ${confirmed} for customer ${input.customerId} (kind ${input.kind})`,
    );
    return 'outranked';
  }
}
