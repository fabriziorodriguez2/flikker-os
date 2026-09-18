import { renderToStaticMarkup } from "react-dom/server";
import RecoveryOpportunityCard from "./recovery-opportunity-card";
import type { InsightsMetricsView } from "./types";

/**
 * La regla que esta card no puede romper: muestra una OPORTUNIDAD calculada
 * con datos reales, nunca un resultado que todavía no ocurrió y nunca una
 * oportunidad inventada para tener algo que vender.
 */
function metricsWith(
  segmentCounts: Record<string, number>,
): InsightsMetricsView {
  return {
    totalCustomers: 60,
    newCustomersInWindow: 5,
    windowDays: 30,
    returningCustomers: 18,
    segmentCounts,
    visitTrend: [],
    stampCard: {
      customersParticipating: 42,
      cardsInProgress: 20,
      unlockedTotal: 9,
      redeemedTotal: 6,
    },
    benefitsRedeemedInWindow: 6,
    benefitStats: [],
    reviewStats: {
      googleReviewsTotal: null,
      googleReviewsImported: 0,
      sinceFlikker: 9,
      googleRating: null,
      importedRating: null,
      historySyncStatus: "idle",
      inPeriod: 9,
      feedbackInPeriod: 3,
    },
  };
}

describe("RecoveryOpportunityCard", () => {
  it("muestra el conteo real de clientes inactivos", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard
        metrics={metricsWith({ INACTIVE: 8, AT_RISK: 4 })}
        isPro={false}
      />,
    );
    expect(html).toContain("8 clientes hace tiempo que no vuelven.");
    expect(html).toContain("Recuperación automática");
  });

  /*
    AT_RISK es una predicción ("se está por ir"), INACTIVE es un hecho
    ("hace tiempo que no viene"). Sumar la predicción infla la oportunidad
    con algo que todavía no pasó — que es exactamente el tipo de número que
    este sistema no debe mostrar.
  */
  it("cuenta solo INACTIVE — nunca suma la predicción AT_RISK", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard
        metrics={metricsWith({ INACTIVE: 8, AT_RISK: 12 })}
        isPro={false}
      />,
    );
    expect(html).toContain("8 clientes");
    expect(html).not.toContain("20 clientes");
    expect(html).not.toContain("12 clientes");
  });

  it("sin clientes inactivos no se muestra: no hay oportunidad que inventar", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard
        metrics={metricsWith({ INACTIVE: 0, AT_RISK: 7 })}
        isPro={false}
      />,
    );
    expect(html).toBe("");
  });

  it("sin segmentos calculados tampoco se muestra", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard metrics={metricsWith({})} isPro={false} />,
    );
    expect(html).toBe("");
  });

  it("a un negocio Pro no se le vende lo que ya tiene", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard
        metrics={metricsWith({ INACTIVE: 8 })}
        isPro
      />,
    );
    expect(html).toBe("");
  });

  it("singular con un solo cliente inactivo", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard
        metrics={metricsWith({ INACTIVE: 1 })}
        isPro={false}
      />,
    );
    expect(html).toContain("1 cliente hace tiempo que no vuelve.");
  });

  it("habla en potencial — nunca afirma que ya recuperó a nadie", () => {
    const html = renderToStaticMarkup(
      <RecoveryOpportunityCard
        metrics={metricsWith({ INACTIVE: 8 })}
        isPro={false}
      />,
    );
    expect(html).toMatch(/puede/);
    for (const claimedResult of [
      "recuperaste",
      "volvieron gracias",
      "recuperamos",
      "ya recuperó",
    ]) {
      expect(html).not.toContain(claimedResult);
    }
  });
});
