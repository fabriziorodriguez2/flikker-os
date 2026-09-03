import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { localDayKey } from '../../common/utils/timezone.util';
import {
  computeStreak,
  MAX_STREAK_LOOKBACK_WEEKS,
  type Streak,
} from './streak-rules';

const MS_PER_DAY = 86_400_000;

/**
 * Rachas de visitas — 100% derivadas de `Visit`, sin ninguna tabla propia.
 *
 * Esa es la decisión de diseño central y la que hace que no exista ningún
 * problema de idempotencia: no hay contador que una visita reprocesada pueda
 * incrementar dos veces, no hay sweep que reconcilie, y no puede haber drift
 * entre lo que dice `Visit` y lo que dice la racha, porque son lo mismo.
 *
 * No emite beneficios, no da sellos, no manda mensajes y no toca Retention
 * V2. Es solo una lectura.
 */
@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  /** La racha de un cliente en un negocio. */
  async getCurrentStreak(params: {
    businessId: string;
    customerId: string;
    timezone: string;
    now?: Date;
  }): Promise<Streak> {
    const now = params.now ?? new Date();
    const rows = await this.prisma.visit.groupBy({
      by: ['visitDayKey'],
      where: {
        businessId: params.businessId,
        customerId: params.customerId,
        occurredAt: { gte: this.cutoff(now) },
      },
    });

    return computeStreak(
      rows.map((row) => row.visitDayKey),
      localDayKey(now, params.timezone),
    );
  }

  /**
   * Las rachas de un cliente en VARIOS negocios, en UNA sola query.
   *
   * Es lo que hace que Mi Flikker → Desafíos no dispare una consulta por
   * lugar: alguien con 16 lugares vinculados haría 16 viajes a la base para
   * mostrar una pantalla. Acá se piden todos los días de visita de todos sus
   * `Customer` de una vez y se agrupan en memoria.
   *
   * `groupBy` devuelve los tríos (cliente, negocio, día) DISTINTOS, no las
   * visitas: si alguien vino cinco veces el mismo día, es una fila.
   *
   * **Por qué se agrupa por `customerId` y no solo por `businessId`:** no
   * existe ningún unique en `Customer(businessId, phoneE164)` — solo un
   * índice. La creación manual y el import CSV no deduplican por teléfono, y
   * `linkExistingCustomers` vincula a la cuenta por teléfono sin filtrar por
   * negocio. Así que una misma `FlikkerAccount` PUEDE tener dos `Customer`
   * del mismo negocio. Agrupando solo por negocio, las visitas de los dos se
   * sumaban en una racha inventada que no es la de ninguno.
   *
   * El resultado se clavea por `customerId` por el mismo motivo: la clave
   * tiene que identificar de quién es la racha, no dónde ocurrió.
   *
   * Usa el índice `[customerId, occurredAt]` que ya existe en `Visit`.
   */
  async getStreaksForCustomers(
    customers: {
      customerId: string;
      businessId: string;
      timezone: string;
    }[],
    now: Date = new Date(),
  ): Promise<Map<string, Streak>> {
    const result = new Map<string, Streak>();
    if (customers.length === 0) return result;

    const rows = await this.prisma.visit.groupBy({
      by: ['customerId', 'visitDayKey'],
      where: {
        customerId: { in: customers.map((c) => c.customerId) },
        occurredAt: { gte: this.cutoff(now) },
      },
    });

    const dayKeysByCustomer = new Map<string, string[]>();
    for (const row of rows) {
      const list = dayKeysByCustomer.get(row.customerId);
      if (list) list.push(row.visitDayKey);
      else dayKeysByCustomer.set(row.customerId, [row.visitDayKey]);
    }

    for (const customer of customers) {
      result.set(
        customer.customerId,
        computeStreak(
          dayKeysByCustomer.get(customer.customerId) ?? [],
          // Cada negocio resuelve "hoy" con SU reloj: dos lugares en husos
          // distintos pueden estar en semanas distintas en este mismo
          // instante.
          localDayKey(now, customer.timezone),
        ),
      );
    }
    return result;
  }

  /**
   * Hasta dónde atrás mirar. Su único trabajo es acotar el scan — el tope real
   * de semanas lo aplica `computeStreak` con `MAX_STREAK_LOOKBACK_WEEKS`.
   *
   * Alineado al lunes (en UTC) y con un día de margen. Antes era
   * `now - 364 días` a secas: eso caía en cualquier momento de un miércoles,
   * así que una visita de exactamente 52 semanas atrás entraba o no según la
   * hora del día. Alinearlo vuelve el corte determinístico; el día de margen
   * cubre que cada negocio empieza su semana en un instante UTC distinto
   * según su huso.
   */
  private cutoff(now: Date): Date {
    const weekday = now.getUTCDay();
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
    const mondayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
    );
    return new Date(
      mondayUtc - (MAX_STREAK_LOOKBACK_WEEKS * 7 + 1) * MS_PER_DAY,
    );
  }
}
