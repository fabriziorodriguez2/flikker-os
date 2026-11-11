import {
  EVIDENCE_LABELS,
  MODE_LABELS,
  contactabilityLines,
  isMeasured,
  reachLine,
  confidenceLabel,
  incentiveLabel,
  resultLine,
  type AutonomousRunView,
} from "./activity-view";

function run(overrides: Partial<AutonomousRunView> = {}): AutonomousRunView {
  return {
    id: "r1",
    day: "2026-11-11",
    mode: "PILOT",
    status: "EXECUTED",
    strategyLabel: "Segunda visita",
    incentiveLevel: 1,
    opportunities: [],
    discarded: [],
    blockers: [],
    explanation: "",
    suggestions: [],
    plannedCount: 5,
    assignedCount: 5,
    estimatedCost: 10,
    currency: "UYU",
    metrics: {
      pending: 1,
      sent: 3,
      control: 1,
      skipped: 0,
      returnedTreated: 1,
      returnedControl: 0,
      redeemed: 0,
      messagingCost: 6,
    },
    ...overrides,
  };
}

describe("actividad autónoma — textos", () => {
  it("resultado solo para corridas ejecutadas en piloto", () => {
    expect(resultLine(run())).toBe(
      "3 enviados · 1 volvió · 0 canjes · 1 pendientes · 1 en grupo de control",
    );
    expect(resultLine(run({ mode: "DRY_RUN", status: "SIMULATED" }))).toBe("—");
    expect(resultLine(run({ status: "BLOCKED" }))).toBe("—");
  });

  it("modo, confianza e incentivo", () => {
    expect(MODE_LABELS.DRY_RUN.detail).toContain("No contacta a nadie");
    expect(confidenceLabel("EXPLICIT_RULE")).toBe("regla fija (pocos datos)");
    expect(incentiveLabel(1)).toBe("Sin descuento");
    expect(incentiveLabel(3)).toBe("Incentivo del catálogo aprobado");
  });
});

describe("planificador", () => {
  it("contactabilidad: cuántos y por qué el resto no", () => {
    expect(
      contactabilityLines({
        active: 105,
        reachableWhatsapp: 12,
        neverAsked: 80,
        neverAskedVisitedLast30d: 20,
        neverAskedWithMiFlikker: 3,
        optedOut: 5,
        suppressed: 1,
        noPhone: 7,
      }),
    ).toEqual([
      "De 105 clientes activos, 12 se pueden contactar por WhatsApp.",
      "80 todavía no autorizaron promociones (20 vinieron en los últimos 30 días: se les pregunta en su próximo check-in).",
      "5 dijeron que no o se dieron de baja.",
      "1 pidieron no ser contactados.",
      "7 no tienen teléfono.",
    ]);
    expect(
      contactabilityLines({
        active: 0,
        reachableWhatsapp: 0,
        neverAsked: 0,
        neverAskedVisitedLast30d: 0,
        neverAskedWithMiFlikker: 0,
        optedOut: 0,
        suppressed: 0,
        noPhone: 0,
      }),
    ).toEqual([]);
  });

  it("alcance de un plan", () => {
    expect(reachLine({ matched: 35, reachable: 14 })).toBe(
      "35 entran en el segmento · 14 se pueden contactar",
    );
    expect(reachLine({ matched: null, reachable: null })).toBe("—");
  });

  it("distingue resultados medidos de un plan recién ejecutado", () => {
    expect(isMeasured({ assigned: 10, recipients: 10 })).toBe(false);
    expect(isMeasured(null)).toBe(false);
    expect(
      isMeasured({
        phase: "MEASURING",
        evidence: "SIGNAL_ONLY",
        readout: "x",
        treated: { contacted: 8, returned: 2, attributed: 1, redeemed: 0 },
        control: { observed: 2, returned: 1 },
        liftPoints: null,
        cost: { messages: 16, incentivesRedeemed: 0, total: 16 },
        optOuts: 0,
      }),
    ).toBe(true);
  });

  it("nunca presenta una señal como prueba", () => {
    expect(EVIDENCE_LABELS.SIGNAL_ONLY).toContain("sin prueba");
  });
});
