import React from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filterGoogleReviews,
  filterPrivateFeedback,
  ReviewsInbox,
  type ReviewsOverview,
} from "./reviews-client";

function makeOverview(
  overrides: Partial<ReviewsOverview> = {},
): ReviewsOverview {
  return {
    periodDays: 30,
    google: {
      connected: true,
      profileUrl: "https://example.com/hidden-profile-url",
      lastSyncedAt: "2026-09-13T12:00:00.000Z",
      placeDisplayName: "Bar Fraternidad",
      placeRating: 4.4,
      placeUserRatingCount: 574,
      placeReviewsUri: "https://google.example/reviews",
      connectedAt: "2026-01-01T12:00:00.000Z",
      historySync: {
        status: "done",
        startedAt: "2026-01-01T12:00:00.000Z",
        completedAt: "2026-01-01T12:10:00.000Z",
      },
    },
    summary: {
      rating: 4.4,
      googleRating: 4.4,
      googleReviewsTotal: 574,
      googleReviewsImported: 60,
      total: 60,
      inPeriod: 6,
      sinceFlikker: 15,
      feedbackInPeriod: 2,
      ratingDistribution: { "1": 1, "2": 0, "3": 2, "4": 12, "5": 45 },
    },
    feedback: [
      {
        id: "private-low",
        customer: { id: "customer-1", name: "Ana" },
        score: 2,
        comment: "Demoraron bastante con el pedido",
        createdAt: "2026-09-14T12:00:00.000Z",
      },
      {
        id: "private-good",
        customer: null,
        score: 5,
        comment: "Excelente atención",
        createdAt: "2026-09-13T12:00:00.000Z",
      },
    ],
    toReview: [
      {
        id: "private-low",
        customer: { id: "customer-1", name: "Ana" },
        score: 2,
        comment: "Demoraron bastante con el pedido",
        createdAt: "2026-09-14T12:00:00.000Z",
      },
    ],
    reviews: [
      {
        id: "google-1",
        author: "Martín",
        stars: 5,
        text: "La mejor cafetería del barrio",
        postedAt: "2026-09-12T12:00:00.000Z",
        linkedToFlikkerActivity: false,
      },
    ],
    ...overrides,
  };
}

function renderInbox(
  data: ReviewsOverview,
  initialTab?: "feedback" | "google",
) {
  return renderToStaticMarkup(
    <ReviewsInbox
      data={data}
      businessName="Bar Fraternidad"
      canManage
      initialTab={initialTab}
    />,
  );
}

describe("Reseñas CHECKIN_V2 — bandeja operativa", () => {
  it("muestra feedback privado sin mezclar reseñas públicas", () => {
    const html = renderInbox(makeOverview());
    expect(html).toContain("Demoraron bastante con el pedido");
    expect(html).toContain("Excelente atención");
    expect(html).not.toContain("La mejor cafetería del barrio");
    expect(html).toContain("Privado");
  });

  it("muestra reseñas de Google sin mezclar feedback privado", () => {
    const html = renderInbox(makeOverview(), "google");
    expect(html).toContain("La mejor cafetería del barrio");
    expect(html).toContain("Martín");
    expect(html).toContain("Público en Google");
    expect(html).not.toContain("Demoraron bastante con el pedido");
  });

  it("para atender usa los ids del read-model real y no reclasifica por su cuenta", () => {
    const feedback = makeOverview().feedback;
    expect(
      filterPrivateFeedback(
        feedback,
        "attention",
        new Set(["private-good"]),
      ).map((item) => item.id),
    ).toEqual(["private-good"]);
  });

  it("aplica los filtros compactos de Google", () => {
    const reviews = [
      ...makeOverview().reviews,
      { ...makeOverview().reviews[0], id: "google-low", stars: 2 },
      { ...makeOverview().reviews[0], id: "google-neutral", stars: 3 },
    ];
    expect(filterGoogleReviews(reviews, "low").map((item) => item.id)).toEqual([
      "google-low",
    ]);
    expect(filterGoogleReviews(reviews, "neutral")).toHaveLength(1);
    expect(filterGoogleReviews(reviews, "high")).toHaveLength(1);
  });

  it("renderiza los empty states de feedback y Google", () => {
    const empty = makeOverview({ feedback: [], toReview: [], reviews: [] });
    expect(renderInbox(empty)).toContain("Todavía no recibiste feedback");
    expect(renderInbox(empty, "google")).toContain(
      "No hay reseñas nuevas en este período",
    );
  });

  it("muestra estado conectado compacto con datos autoritativos", () => {
    const html = renderInbox(makeOverview());
    expect(html).toContain("Google conectado");
    expect(html).toContain("Bar Fraternidad");
    expect(html).toContain("4.4 ★");
    expect(html).toContain("574 reseñas");
    expect(html).toContain("+6 últimos 30 días");
    expect(html).toContain("Administrar");
    expect(html).not.toContain("hidden-profile-url");
  });

  it("muestra CTA claro cuando Google no está conectado", () => {
    const base = makeOverview();
    const disconnected = makeOverview({
      google: { ...base.google, connected: false },
    });
    const html = renderInbox(disconnected, "google");
    expect(html).toContain("Google no conectado");
    expect(html).toContain("Conectá tu perfil de Google");
    expect(html).toContain("Buscar mi negocio");
  });

  it("mantiene solo dos tabs, filtros simples y elimina el dashboard analytics", () => {
    const source = readFileSync(join(__dirname, "reviews-client.tsx"), "utf-8");
    expect(source).toContain("Feedback privado");
    expect(source).toContain("Reseñas de Google");
    expect(source).toContain("Para atender");
    expect(source).toContain("1–2 estrellas");
    expect(source).not.toContain("ReviewsChart");
    expect(source).not.toContain("Locales vinculados");
    expect(source).not.toContain("PERIODS");
  });
});
