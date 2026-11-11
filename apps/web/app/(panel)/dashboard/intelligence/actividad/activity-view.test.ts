import {
  MODE_LABELS,
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
