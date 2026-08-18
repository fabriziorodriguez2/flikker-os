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

@Injectable()
export class ReviewsOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async forBusiness(businessId: string, days = 30, now: Date = new Date()) {
    const since = new Date(now.getTime() - days * MS_PER_DAY);
    const period = resolvePeriod(parsePeriodDays(String(days)), now);

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        googleBusinessProfileUrl: true,
        googlePlaceId: true,
        experienceVersion: true,
        googlePlaceDisplayName: true,
        googlePlaceRating: true,
        googlePlaceUserRatingCount: true,
        googlePlaceReviewsUri: true,
        googlePlaceConnectedAt: true,
      },
    });

    const googleConnected = Boolean(business?.googleBusinessProfileUrl);

    const [
      total,
      inPeriod,
      sinceConnected,
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
      this.prisma.googleReview.count({ where: { businessId } }),
      this.prisma.googleReview.count({
        where: { businessId, postedAt: { gte: since } },
      }),
      // `null` (no un conteo) para negocios conectados antes de que este
      // campo existiera — mejor "no sabemos" que un número que no significa
      // "desde que conectaste" de verdad.
      business?.googlePlaceConnectedAt
        ? this.prisma.googleReview.count({
            where: {
              businessId,
              postedAt: { gte: business.googlePlaceConnectedAt },
            },
          })
        : Promise.resolve(null),
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
        orderBy: { postedAt: 'desc' },
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
      // `inPeriod`, solo bucketizado por día en vez de sumado.
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

    const dailyCounts = bucketByDay(
      chartRows.map((r) => r.postedAt),
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
      },

      summary: {
        // `null` y no 0: sin reseñas no hay calificación, y un "0.0 ★" en
        // pantalla se lee como si el negocio estuviera pésimo.
        rating:
          total > 0 ? Math.round((rating._avg.stars ?? 0) * 10) / 10 : null,
        total,
        inPeriod,
        /**
         * "Reseñas desde que usás Flikker" — `null` (no 0) para un negocio
         * conectado antes de que `googlePlaceConnectedAt` existiera: no hay
         * ancla real, así que no se inventa un número.
         */
        sinceConnected,
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
