import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ImpactCard from "./impact-card";
import { LoyaltyHealthCard } from "./insights-story";
import type { BusinessImpactMetricsView, InsightsMetricsView } from "./types";

function makeImpact(): BusinessImpactMetricsView {
  return {
    sinceFlikker: {
      windowStart: "2026-01-01T00:00:00.000Z",
      anchor: "onboarding",
      customersIdentified: 50,
      customersReturned: 18,
      customersReturnedAfterContact: 6,
      benefitsRedeemed: 6,
      newReviews: 15,
    },
    lifetime: { benefitsIssued: 10, cardsInProgress: 47 },
    hasEnoughRetentionEvidence: true,
  };
}

function makeMetrics(): InsightsMetricsView {
  return {
    totalCustomers: 50,
    newCustomersInWindow: 32,
    windowDays: 30,
    returningCustomers: 18,
    segmentCounts: {},
    visitTrend: [
      { days: 7, current: 12, previous: 10 },
      { days: 30, current: 44, previous: 40 },
      { days: 90, current: 100, previous: 80 },
    ],
    stampCard: {
      customersParticipating: 48,
      cardsInProgress: 47,
      unlockedTotal: 5,
      redeemedTotal: 2,
    },
    benefitsRedeemedInWindow: 0,
    benefitStats: [
      { source: "WELCOME", issued: 7, redeemed: 2 },
      { source: "PROMOTION", issued: 3, redeemed: 0 },
    ],
    reviewStats: {
      googleReviewsTotal: 574,
      googleReviewsImported: 60,
      sinceFlikker: 15,
      googleRating: 4.4,
      importedRating: 4.4,
      historySyncStatus: "done",
      inPeriod: 15,
      feedbackInPeriod: 4,
    },
  };
}

describe("Insights — métricas derivadas y fidelización", () => {
  it("calcula recurrencia histórica sobre el total real de clientes", () => {
    const html = renderToStaticMarkup(
      <ImpactCard impact={makeImpact()} metrics={makeMetrics()} />,
    );
    expect(html).toContain("Recurrencia histórica");
    expect(html).toContain("36%");
    expect(html).toContain("18 de 50 clientes volvieron");
  });

  it("usa la ventana real para las reseñas nuevas", () => {
    const html = renderToStaticMarkup(
      <ImpactCard impact={makeImpact()} metrics={makeMetrics()} />,
    );
    expect(html).toContain("Reseñas nuevas");
    expect(html).toContain("Últimos 30 días");
  });

  it("muestra tarjetas activas desde el read-model del programa", () => {
    const html = renderToStaticMarkup(
      <ImpactCard impact={makeImpact()} metrics={makeMetrics()} />,
    );
    expect(html).toContain("Tarjetas activas");
    expect(html).toContain(">47<");
  });

  it("agrega beneficios emitidos por origen sin inventar un total", () => {
    const html = renderToStaticMarkup(
      <LoyaltyHealthCard metrics={makeMetrics()} />,
    );
    expect(html).toContain("Beneficios emitidos");
    expect(html).toContain(">10<");
    expect(html).toContain("40%");
  });
});
