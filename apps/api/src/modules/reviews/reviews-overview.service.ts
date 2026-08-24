import { Injectable } from '@nestjs/common';
import { CustomerEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  bucketByDay,
  dayKeysBetween,
  parsePeriodDays,
  resolvePeriod,
} from '../dashboard/dashboard-period';

/**
 * Reseñas — fachada de lectura para la pantalla del panel.
 *
 * No hay dominio nuevo: `GoogleReview`, `CheckinFeedback` y `CustomerEvent`
 * ya existían y siguen siendo la fuente. Esto solo los junta en una llamada,
 * porque pintar la pantalla con los endpoints sueltos serían seis requests.
 *
 * Dos reglas de producto gobiernan el archivo:
 *
 *  1. **Google y feedback no se mezclan.** Uno es opinión pública en el perfil
 *     de Google; el otro es un comentario privado después de una visita. Se
 *     devuelven en bloques separados y nunca en una lista común.
 *
 *  2. **Un click no es una reseña.** El embudo cuenta cuántos clientes
 *     ABRIERON Google, que es un hecho observable (`review_link_clicked`), y
 *     lo dice con esas palabras. Las reseñas que aparecen después no se
 *     atribuyen a ese click.
 */

const MS_PER_DAY = 86_400_000;

export type HistorySyncStatus = 'idle' | 'running' | 'done' | 'partial';

/**
 * Estado derivado de las dos fechas del backfill más el contraste entre lo
 * importado y el total real de Google — sin un enum persistido que después
 * haya que mantener en sincronía con la realidad del worker.
 *
 * Los cuatro estados son deliberadamente distintos:
 *
 *   idle    — nunca corrió un backfill
 *   running — está trabajando AHORA (la pantalla puede prometer que avanza)
 *   partial — terminó y quedó por debajo del total que informa Google
 *   done    — importamos al menos tantas como Google informa
 *
 * `partial` NO significa "falló" ni "va a completarse solo", y en la mayoría
 * de los negocios es un estado permanente y correcto: `userRatingCount` de
 * Google cuenta TODAS las calificaciones, incluidas las de solo estrellas
 * sin texto, mientras que el scrape solo puede materializar las que tienen
 * contenido (y con un tope de páginas). Es decir, `imported < googleTotal`
 * es lo esperable, no una anomalía.
 *
 * Por eso `partial` existe en vez de forzar `done`: decir "listo, importamos
 * todo" sería falso. Pero la copia que lo muestra tampoco puede prometer que
 * se va a completar — ver el aviso en Reseñas, que explica el motivo en vez
 * de anunciar una sincronización futura que quizá nunca cierre la brecha.
 */
function resolveHistorySync(
  business: {
    googleReviewsBackfillStartedAt: Date | null;
    googleReviewsBackfillCompletedAt: Date | null;
  } | null,
  counts: { imported: number; googleTotal: number | null },
): {
  status: HistorySyncStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  imported: number;
  googleTotal: number | null;
} {
  const startedAt = business?.googleReviewsBackfillStartedAt ?? null;
  const completedAt = business?.googleReviewsBackfillCompletedAt ?? null;

  let status: HistorySyncStatus;
  if (!startedAt) {
    status = 'idle';
  } else if (!completedAt || completedAt < startedAt) {
    status = 'running';
  } else if (
    counts.googleTotal !== null &&
    counts.imported < counts.googleTotal
  ) {
    // Sin `googleTotal` no hay con qué comparar: se reporta `done` y no se
    // inventa un "parcial" que no se puede demostrar.
    status = 'partial';
  } else {
    status = 'done';
  }

  return {
    status,
    startedAt,
    completedAt,
    imported: counts.imported,
    googleTotal: counts.googleTotal,
  };
}

@Injectable()
export class ReviewsOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async forBusiness(businessId: string, days = 30, now: Date = new Date()) {
    const since = new Date(now.getTime() - days * MS_PER_DAY);
    const period = resolvePeriod(parsePeriodDays(String(days)), now);

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        createdAt: true,
        googleBusinessProfileUrl: true,
        googlePlaceId: true,
        experienceVersion: true,
        googlePlaceDisplayName: true,
        googlePlaceRating: true,
        googlePlaceUserRatingCount: true,
        googlePlaceReviewsUri: true,
        googlePlaceConnectedAt: true,
        googleReviewsBackfillStartedAt: true,
        googleReviewsBackfillCompletedAt: true,
      },
    });

    const googleConnected = Boolean(business?.googleBusinessProfileUrl);

    const [
      total,
      inPeriod,
      sinceFlikker,
      rating,
      distribution,
      lastSynced,
      recent,
      chartRows,
      feedbackInPeriod,
      recentFeedback,
      pendingFeedback,
      visits,
      feedbackTotal,
      googleClicks,
      attributed,
    ] = await Promise.all([
      // "Reseñas totales en Google" — el historial completo disponible,
      // sin importar cuándo se publicó ni si se pudo determinar la fecha.
      this.prisma.googleReview.count({ where: { businessId } }),
      this.prisma.googleReview.count({
        where: { businessId, postedAt: { gte: since } },
      }),
      /**
       * "Reseñas con Flikker" — pedido explícito: el corte es
       * `Business.createdAt` (cuándo se creó la cuenta en Flikker), NUNCA
       * `googlePlaceConnectedAt` (eso solo dice cuándo se conectó ESTE
       * Place, que puede reconectarse/cambiar) y NUNCA `detectedAt` (cuándo
       * la encontramos nosotros — una reseña vieja importada hoy no la
       * "consiguió" Flikker hoy). `Business.createdAt` siempre existe, así
       * que ya no hace falta el `null` de "no sabemos" que tenía antes.
       * `postedAt: { gte }` ya excluye de forma natural las reseñas sin
       * fecha determinada (`postedAt: null`) — nunca cuentan acá hasta que
       * se pueda saber su fecha real.
       */
      business
        ? this.prisma.googleReview.count({
            where: { businessId, postedAt: { gte: business.createdAt } },
          })
        : Promise.resolve(0),
      this.prisma.googleReview.aggregate({
        where: { businessId },
        _avg: { stars: true },
      }),
      this.prisma.googleReview.groupBy({
        by: ['stars'],
        where: { businessId },
        _count: { stars: true },
      }),
      // `detectedAt` del más reciente = la última vez que efectivamente
      // trajimos algo nuevo. Es el dato honesto que tenemos; no hay un
      // registro separado de "última corrida".
      this.prisma.googleReview.findFirst({
        where: { businessId },
        orderBy: { detectedAt: 'desc' },
        select: { detectedAt: true },
      }),
      this.prisma.googleReview.findMany({
        where: { businessId },
        // `nulls: 'last'` — una reseña sin fecha determinada no debe
        // desplazar a las que sí la tienen fuera del `take: 50`.
        orderBy: { postedAt: { sort: 'desc', nulls: 'last' } },
        take: 50,
        select: {
          id: true,
          reviewerName: true,
          stars: true,
          text: true,
          postedAt: true,
          attributedMessageId: true,
        },
      }),
      // Serie diaria para el gráfico — mismo `postedAt` que ya usa
      // `inPeriod`, solo bucketizado por día en vez de sumado. El `where`
      // ya excluye `postedAt: null` de forma natural (mismo criterio que
      // `inPeriod`/`sinceFlikker`: sin fecha real, no entra en ningún corte
      // temporal).
      this.prisma.googleReview.findMany({
        where: { businessId, postedAt: { gte: period.from } },
        select: { postedAt: true },
      }),
      this.prisma.checkinFeedback.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      this.prisma.checkinFeedback.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          score: true,
          comment: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
          bonusStamp: { select: { id: true } },
        },
      }),
      // "Para revisar": puntaje bajo Y con algo escrito. Sin comentario no hay
      // nada que atender más allá del número.
      this.prisma.checkinFeedback.findMany({
        where: {
          businessId,
          score: { lte: 3 },
          comment: { not: null },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          score: true,
          comment: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.visit.count({
        where: { businessId, occurredAt: { gte: since } },
      }),
      this.prisma.checkinFeedback.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      this.prisma.customerEvent.count({
        where: {
          businessId,
          type: CustomerEventType.review_link_clicked,
          createdAt: { gte: since },
        },
      }),
      this.prisma.googleReview.count({
        where: {
          businessId,
          attributedMessageId: { not: null },
          postedAt: { gte: since },
        },
      }),
    ]);

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const row of distribution) {
      if (row.stars >= 1 && row.stars <= 5) {
        ratingDistribution[row.stars] = row._count.stars;
      }
    }

    // Nombres locales explícitos: `total` a secas fue exactamente lo que
    // llevó a que el resumen dijera "el comercio cuenta con 60 reseñas"
    // cuando en Google tiene 194.
    const googleReviewsImported = total;
    const importedRating =
      googleReviewsImported > 0
        ? Math.round((rating._avg.stars ?? 0) * 10) / 10
        : null;

    const dailyCounts = bucketByDay(
      // El `where` de la query ya excluye `postedAt: null` — el filtro es
      // solo para que el tipo sea `Date`, no `Date | null`.
      chartRows.map((r) => r.postedAt).filter((d): d is Date => d !== null),
      period,
    );

    return {
      periodDays: days,

      google: {
        connected: googleConnected,
        profileUrl: business?.googleBusinessProfileUrl ?? null,
        /** Cuándo detectamos una reseña nueva por última vez. */
        lastSyncedAt: lastSynced?.detectedAt ?? null,
        /**
         * Datos de Google Places API (New), del Place conectado —
         * distintos de `summary.rating`/`total` (que vienen de nuestras
         * propias `GoogleReview` ya sincronizadas): esto es el rating/
         * cantidad que Google muestra HOY en su propio perfil, disponible
         * apenas se conecta, sin esperar al primer scrape.
         */
        placeDisplayName: business?.googlePlaceDisplayName ?? null,
        placeRating: business?.googlePlaceRating ?? null,
        placeUserRatingCount: business?.googlePlaceUserRatingCount ?? null,
        placeReviewsUri: business?.googlePlaceReviewsUri ?? null,
        /** Cuándo se conectó el Place actual — `null` si es de antes de este campo. */
        connectedAt: business?.googlePlaceConnectedAt ?? null,
        /**
         * Importación histórica completa (`enqueueBackfill`). `running`
         * mientras el backfill trabaja en background — la pantalla dice
         * "Sincronizando historial…" en vez de dar por bueno un total
         * parcial. `idle` para negocios anteriores a este campo o que nunca
         * conectaron: nunca se dice "listo" sin haber corrido.
         */
        historySync: resolveHistorySync(business, {
          imported: googleReviewsImported,
          googleTotal: business?.googlePlaceUserRatingCount ?? null,
        }),
      },

      summary: {
        // `null` y no 0: sin reseñas no hay calificación, y un "0.0 ★" en
        // pantalla se lee como si el negocio estuviera pésimo.
        rating: importedRating,
        /**
         * ⚠️ Cuántas reseñas TENEMOS IMPORTADAS, no cuántas tiene el negocio
         * en Google. Se mantiene el nombre por compatibilidad, pero
         * `googleReviewsImported` de abajo es el nombre correcto y el que
         * deben usar los consumidores nuevos.
         */
        total: googleReviewsImported,

        // ── Las cuatro métricas, explícitamente separadas ────────────────
        /**
         * El total REAL que Google informa para este negocio
         * (`Business.googlePlaceUserRatingCount`, capturado al conectar el
         * Place y refrescado cada 24 h por el barrido diario —
         * `GoogleReviewDetectionWorker.refreshPlaceMetadata`). Es el único
         * número del que puede decirse "el comercio tiene N
         * reseñas". `COUNT(GoogleReview)` NO es equivalente: mientras el
         * backfill corre puede haber 60 importadas de 194 reales, y decir
         * "60 reseñas" es falso.
         *
         * `null` cuando nunca se conectó un Place: ahí no sabemos el total y
         * no se inventa uno con las importadas.
         */
        googleReviewsTotal: business?.googlePlaceUserRatingCount ?? null,
        /** Filas históricas efectivamente persistidas en `GoogleReview`. */
        googleReviewsImported,
        /**
         * El rating que Google muestra HOY en el perfil. Es el autoritativo:
         * `importedRating` es solo el promedio de lo que alcanzamos a
         * importar y, con el histórico incompleto, no coincide.
         */
        googleRating: business?.googlePlaceRating ?? importedRating,
        /** Promedio de las reseñas importadas — NUNCA rotularlo "en Google". */
        importedRating,
        inPeriod,
        /**
         * "Reseñas con Flikker" — reseñas publicadas desde que se creó la
         * cuenta en Flikker (`Business.createdAt`), por `postedAt` real.
         * Siempre un número (nunca `null`): `Business.createdAt` existe
         * para todo negocio, a diferencia de la vieja ancla
         * `googlePlaceConnectedAt`.
         */
        sinceFlikker,
        feedbackInPeriod,
        ratingDistribution,
      },

      /**
       * Serie diaria de reseñas nuevas, alineada al mismo período que
       * `summary.inPeriod` — un día por punto, en orden, sin huecos.
       */
      chart: dayKeysBetween(period.from, period.to).map((date, i) => ({
        date,
        count: dailyCounts[i],
      })),

      reviews: recent.map((r) => ({
        id: r.id,
        author: r.reviewerName,
        stars: r.stars,
        text: r.text,
        postedAt: r.postedAt,
        /**
         * "Asociada a actividad de Flikker": la reseña apareció después de un
         * mensaje nuestro a ese cliente. Es una asociación temporal, no una
         * demostración de que Flikker la haya generado — y el nombre del campo
         * lo dice así a propósito.
         */
        linkedToFlikkerActivity: r.attributedMessageId !== null,
      })),

      feedback: recentFeedback.map((f) => ({
        id: f.id,
        customer: f.customer,
        score: f.score,
        comment: f.comment,
        createdAt: f.createdAt,
        gaveBonusStamp: f.bonusStamp !== null,
      })),

      toReview: pendingFeedback.map((f) => ({
        id: f.id,
        customer: f.customer,
        score: f.score,
        comment: f.comment,
        createdAt: f.createdAt,
      })),

      /**
       * Cuatro pasos, cada uno de un dato real:
       *  - visitas: filas de `Visit`
       *  - feedback: filas de `CheckinFeedback`
       *  - abrieron Google: eventos `review_link_clicked`
       *  - asociadas: reseñas con `attributedMessageId`
       *
       * El último NO es "reseñas que generó Flikker": no podemos observar si
       * quien hizo click terminó publicando. Por eso el paso se llama
       * "abrieron Google" y no "dejaron una reseña".
       */
      funnel: {
        visits,
        feedback: feedbackTotal,
        openedGoogle: googleClicks,
        linkedReviews: attributed,
      },
    };
  }
}
