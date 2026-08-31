import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ImpactCard, { type BusinessImpactMetricsView } from "./impact-card";

function makeImpact(
  overrides: Partial<BusinessImpactMetricsView> = {},
): BusinessImpactMetricsView {
  return {
    sinceFlikker: {
      windowStart: "2026-01-01T00:00:00.000Z",
      anchor: "onboarding",
      customersIdentified: 71,
      customersReturned: 18,
      customersReturnedAfterContact: 6,
      benefitsRedeemed: 6,
      newReviews: 9,
    },
    lifetime: { benefitsIssued: 0, cardsInProgress: 0 },
    hasEnoughRetentionEvidence: true,
    ...overrides,
  };
}

/**
 * Gap real cerrado: `lifetime.benefitsIssued`/`lifetime.cardsInProgress` ya
 * los calculaba y los mandaba el backend (`BusinessImpactService.getImpact`)
 * — esta card nunca los leía. Nunca se recalcula nada acá: son los mismos
 * números que ya viajan en la respuesta.
 */
describe("ImpactCard — tarjetas en curso y beneficios emitidos (lifetime)", () => {
  it("no muestra 'Tarjetas en curso' cuando es 0 (negocio Beneficios-only, o sellos apagado)", () => {
    const html = renderToStaticMarkup(
      <ImpactCard impact={makeImpact({ lifetime: { benefitsIssued: 0, cardsInProgress: 0 } })} />,
    );
    expect(html).not.toContain("Tarjetas en curso");
  });

  it("muestra 'Tarjetas en curso' con el número real cuando hay tarjetas activas", () => {
    const html = renderToStaticMarkup(
      <ImpactCard impact={makeImpact({ lifetime: { benefitsIssued: 0, cardsInProgress: 12 } })} />,
    );
    expect(html).toContain("Tarjetas en curso");
    expect(html).toContain(">12<");
  });

  it("muestra 'Beneficios emitidos' con el número real cuando hay beneficios emitidos", () => {
    const html = renderToStaticMarkup(
      <ImpactCard impact={makeImpact({ lifetime: { benefitsIssued: 40, cardsInProgress: 0 } })} />,
    );
    expect(html).toContain("Beneficios emitidos");
    expect(html).toContain(">40<");
  });

  it("clientes identificados y reseñas nuevas se siguen mostrando siempre, sin cambios", () => {
    const html = renderToStaticMarkup(<ImpactCard impact={makeImpact()} />);
    expect(html).toContain("Clientes identificados");
    expect(html).toContain("Reseñas nuevas");
  });
});
