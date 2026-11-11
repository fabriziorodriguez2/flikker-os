import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanItem } from "./planner-run-card";
import type { PlanView } from "./activity-view";

function plan(over: Partial<PlanView> = {}): PlanView {
  return {
    id: "p1",
    status: "SIMULATED",
    rank: 1,
    title: "Segunda visita",
    objective: "SECOND_VISIT",
    hypothesis: "Quienes vinieron una vez vuelven si se los invita.",
    plan: {
      segment: { description: "Una sola visita" },
      variants: [{ key: "A", message: "Hola {nombre}, te esperamos.", incentiveId: null, weightPercent: 80 }],
      controlPercent: 20,
    },
    issues: [],
    selectionReason: "Más alcance.",
    matched: 35,
    reachable: 14,
    simulation: { recipients: 14, treated: 11, control: 3, cost: { total: 22 }, costKnown: true },
    results: null,
    estimatedCost: 22,
    currency: "UYU",
    ...over,
  };
}

const render = (p: PlanView) => renderToStaticMarkup(<PlanItem plan={p} />);

describe("PlanItem", () => {
  it("un plan elegido en simulación muestra a quién, alcance y qué pasaría", () => {
    const html = render(plan());
    expect(html).toContain("Elegido (simulación)");
    expect(html).toContain("Una sola visita");
    expect(html).toContain("35 entran en el segmento · 14 se pueden contactar");
    expect(html).toContain("11 recibirían el mensaje · 3 en grupo de control · UYU 22");
    expect(html).toContain("Por qué lo eligió: Más alcance.");
  });

  it("un plan descartado muestra el motivo", () => {
    const html = render(
      plan({
        status: "INFEASIBLE",
        simulation: null,
        issues: [{ code: "NO_REACH", message: "Los 35 clientes del segmento no autorizaron WhatsApp." }],
      }),
    );
    expect(html).toContain("No se pudo hacer");
    expect(html).toContain("no autorizaron WhatsApp");
  });

  it("un plan medido muestra la lectura de la evidencia, sin exagerar", () => {
    const html = render(
      plan({
        status: "MEASURING",
        results: {
          phase: "MEASURING",
          evidence: "SIGNAL_ONLY",
          readout: "Volvieron 2 de 8 contactados y 1 de 2 del grupo de control.",
          treated: { contacted: 8, returned: 2, attributed: 1, redeemed: 0 },
          control: { observed: 2, returned: 1 },
          liftPoints: null,
          cost: { messages: 16, incentivesRedeemed: 0, total: 16 },
          optOuts: 0,
        },
      }),
    );
    expect(html).toContain("Midiendo");
    expect(html).toContain("Señal (muestra chica, sin prueba)");
    expect(html).toContain("Volvieron 2 de 8 contactados");
  });
});
