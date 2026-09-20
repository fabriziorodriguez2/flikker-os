import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  createRedisConnection,
  REDIS_CONFIGURED,
} from '../../jobs/redis-connection';

/**
 * PURGE — saca de las colas el trabajo pendiente de un negocio que se va a
 * borrar. La mitad de una defensa de dos capas: la otra es el GUARD de cada
 * worker (`business-operational.guard.ts`).
 *
 * Las dos hacen falta, y ninguna sola alcanza:
 *
 *  - Solo GUARD: los jobs igual despiertan, consumen un worker y ensucian
 *    los logs con skips. Con `attempts > 1` (el sorteo tiene 3) se repiten.
 *  - Solo PURGE: BullMQ vive en Redis, que puede estar caído, reiniciarse o
 *    ser otra instancia. Un job puede reaparecer y el negocio ya no existe.
 *
 * ## Limitación conocida de BullMQ
 *
 * BullMQ **no indexa los jobs por el contenido de su payload**. No existe un
 * "borrame todos los jobs donde data.businessId = X". La única forma es
 * listar los jobs pendientes de cada cola y filtrar en memoria.
 *
 * Eso acota lo que esto puede prometer:
 *
 *  - Se barren solo los estados donde el job TODAVÍA no corrió (`waiting`,
 *    `delayed`, `paused`, `prioritized`). Un job `active` ya está en manos
 *    de un worker y matarlo a mitad de camino sería peor que dejar que el
 *    guard lo frene.
 *  - Se recorren hasta `MAX_SCAN` jobs por cola. Con backlogs enormes
 *    podría quedar alguno afuera.
 *  - Los jobs repetibles (los cron) no llevan `businessId` en el payload:
 *    barren todos los negocios desde una query. No hay nada que purgar ahí,
 *    y el filtro de la query es lo que los mantiene a raya.
 *
 * Por eso el guard del worker no es redundante: es la garantía. Esto es la
 * higiene.
 */

/** Colas cuyos jobs puntuales llevan un `businessId` en el payload. */
const QUEUES_WITH_BUSINESS_PAYLOAD = [
  'google-review-detection',
  'review-requests',
  'owner-notifications',
  'google-calendar-send-check',
];

const PENDING_STATES = ['waiting', 'delayed', 'paused', 'prioritized'] as const;

/** Tope de jobs inspeccionados por cola — ver la limitación de arriba. */
const MAX_SCAN = 5000;

@Injectable()
export class BusinessJobPurgeService {
  private readonly logger = new Logger(BusinessJobPurgeService.name);

  /**
   * Nunca tira: si Redis no está configurado o no responde, el borrado del
   * negocio tiene que poder seguir igual. El guard cubre el hueco.
   */
  async purgePendingJobs(businessId: string): Promise<{
    removed: number;
    scanned: number;
    queuesChecked: number;
    redisAvailable: boolean;
  }> {
    if (!REDIS_CONFIGURED) {
      this.logger.log(
        'Redis no configurado — no hay cola que purgar. El guard del worker cubre el caso.',
      );
      return {
        removed: 0,
        scanned: 0,
        queuesChecked: 0,
        redisAvailable: false,
      };
    }

    let connection: IORedis | undefined;
    let removed = 0;
    let scanned = 0;
    let queuesChecked = 0;

    try {
      connection = createRedisConnection();

      for (const name of QUEUES_WITH_BUSINESS_PAYLOAD) {
        const queue = new Queue(name, { connection });
        try {
          const jobs = await queue.getJobs([...PENDING_STATES], 0, MAX_SCAN);
          scanned += jobs.length;
          for (const job of jobs) {
            const data = job.data as { businessId?: string } | null;
            if (data?.businessId !== businessId) continue;
            try {
              await job.remove();
              removed += 1;
            } catch {
              // Un job que pasó a `active` entre el listado y el remove ya no
              // se puede sacar. El guard lo frena.
            }
          }
          queuesChecked += 1;
        } finally {
          await queue.close().catch(() => undefined);
        }
      }

      this.logger.log(
        `Purga de jobs de ${businessId}: ${removed} removidos de ${scanned} inspeccionados en ${queuesChecked} colas.`,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudieron purgar los jobs de ${businessId}: ${
          error instanceof Error ? error.message : String(error)
        }. El guard del worker sigue cubriendo el caso.`,
      );
    } finally {
      await connection?.quit().catch(() => undefined);
    }

    return { removed, scanned, queuesChecked, redisAvailable: true };
  }
}
