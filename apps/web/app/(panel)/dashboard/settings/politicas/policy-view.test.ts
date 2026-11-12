import {
  budgetLine,
  incentiveBudgetChange,
  initialForm,
  parseForm,
  pauseReasonLabel,
  weeklyReachText,
  type PolicyForm,
  type PolicyView,
} from "./policy-view";
import { exclusionSummary } from "../../notificaciones/promotions-tab";

const preset = {
  messagingBudgetMonthly: 500,
  incentiveBudgetMonthly: null,
  weeklyReachPercent: 25,
  maxNewCampaignsPerWeek: 2,
  minDaysBetweenPromotions: 10,
  maxPromotionsPer30Days: 3,
  sendingHourStart: 10,
  sendingHourEnd: 20,
  maxCampaignSharePercent: 25,
};

function view(overrides: Partial<PolicyView> = {}): PolicyView {
  return {
    policyVersion: 2,
    version: 0,
    accepted: false,
    acceptedAt: null,
    business: { currency: "UYU", timezone: "America/Montevideo" },
    confirmed: { currency: null, timezone: null },
    paused: false,
    pausedReason: null,
    pausedAt: null,
    values: {
      messagingBudgetMonthly: null,
      incentiveBudgetMonthly: null,
      weeklyReachPercent: null,
      maxNewCampaignsPerWeek: null,
      minDaysBetweenPromotions: 7,
      maxPromotionsPer30Days: 3,
      sendingHourStart: 9,
      sendingHourEnd: 21,
      maxCampaignSharePercent: null,
    },
    preset,
    messageUnitCost: null,
    messageUnitCostCurrency: null,
    usage: {
      messagesSentThisMonth: 0,
      messagingSpentThisMonth: 0,
      incentiveLiabilityThisMonth: 0,
      issuancesWithUnknownCost: 0,
      customersWithWhatsappConsent: 0,
    },
    incentives: {
      budgetSet: false,
      committed: 0,
      consumed: 0,
      inFlight: 0,
      byIncentive: [],
      campaigns: [],
    },
    weeklyReach: {
      mode: "ADAPTIVE",
      threshold: 150,
      registeredCustomers: 105,
      contactableCustomers: 70,
      capThisWeek: null,
      contactedThisWeek: 12,
    },
    blockers: [],
    missing: [],
    ...overrides,
  };
}

describe("policy view", () => {
  it("sin aceptar, propone el preset Equilibrado, salvo el presupuesto de incentivos (vacío)", () => {
    expect(initialForm(view())).toEqual({
      messagingBudgetMonthly: "500",
      incentiveBudgetMonthly: "",
      weeklyReachPercent: "25",
      maxNewCampaignsPerWeek: "2",
      minDaysBetweenPromotions: "10",
      maxPromotionsPer30Days: "3",
      sendingHourStart: "10",
      sendingHourEnd: "20",
      maxCampaignSharePercent: "25",
    });
  });

  it("incentivos: vacío es 'sin definir' (null); 0 es un presupuesto válido", () => {
    const form = initialForm(view());
    expect(parseForm(form)).toMatchObject({ ok: true, values: { incentiveBudgetMonthly: null } });
    expect(parseForm({ ...form, incentiveBudgetMonthly: "0" })).toMatchObject({
      ok: true,
      values: { incentiveBudgetMonthly: 0 },
    });
    expect(parseForm({ ...form, incentiveBudgetMonthly: "-1" })).toMatchObject({ ok: false });
    // El resto de los campos sigue siendo obligatorio.
    expect(parseForm({ ...form, weeklyReachPercent: "" })).toMatchObject({ ok: false });
    expect(parseForm({ ...form, weeklyReachPercent: "101" })).toMatchObject({ ok: false });
  });

  it("aceptada sin presupuesto de incentivos: sigue vacío, no aparece un número que nadie eligió", () => {
    const form = initialForm(view({ accepted: true, values: { ...preset } }));
    expect(form.incentiveBudgetMonthly).toBe("");
    expect(form.weeklyReachPercent).toBe("25");
  });

  it("cambiar el presupuesto de incentivos pide confirmación; lo demás no", () => {
    const accepted = view({ accepted: true, values: { ...preset, incentiveBudgetMonthly: 1000 } });
    const parsed = parseForm(initialForm(accepted));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(incentiveBudgetChange(accepted, parsed.values)).toBeNull();
    expect(incentiveBudgetChange(accepted, { ...parsed.values, sendingHourStart: 9 })).toBeNull();
    expect(incentiveBudgetChange(accepted, { ...parsed.values, incentiveBudgetMonthly: 2000 })).toBe(
      "Vas a cambiar el presupuesto de beneficios e incentivos de UYU 1.000 a UYU 2.000 por mes.",
    );
    expect(incentiveBudgetChange(accepted, { ...parsed.values, incentiveBudgetMonthly: 0 })).toContain(
      "dejar de comprometer gastos",
    );
    // Al aceptar por primera vez la confirmación es la aceptación misma.
    expect(incentiveBudgetChange(view(), { ...parsed.values, incentiveBudgetMonthly: 500 })).toBeNull();
  });

  it("explica el alcance semanal según el tamaño de la base", () => {
    expect(weeklyReachText(view())).toContain("105 clientes registrados (menos de 150)");
    const big = view({
      values: { ...preset },
      weeklyReach: {
        mode: "PERCENT",
        threshold: 150,
        registeredCustomers: 500,
        contactableCustomers: 120,
        capThisWeek: 30,
        contactedThisWeek: 8,
      },
    });
    expect(weeklyReachText(big)).toBe(
      "Esta semana: hasta 30 clientes distintos (25% de 120 con WhatsApp autorizado). Ya van 8. Se recalcula a medida que crece tu base.",
    );
  });

  it("aceptada, muestra lo guardado", () => {
    const form = initialForm(
      view({
        accepted: true,
        values: { ...preset, messagingBudgetMonthly: 800, sendingHourStart: 9 },
      }),
    );
    expect(form.messagingBudgetMonthly).toBe("800");
    expect(form.sendingHourStart).toBe("9");
  });

  it("valida rangos, enteros y la ventana horaria antes de mandar", () => {
    const ok = initialForm(view());
    expect(parseForm(ok)).toMatchObject({ ok: true, values: { messagingBudgetMonthly: 500 } });
    expect(parseForm({ ...ok, messagingBudgetMonthly: "450,5" })).toMatchObject({
      ok: true,
      values: { messagingBudgetMonthly: 450.5 },
    });
    const bad = (patch: Partial<PolicyForm>) => parseForm({ ...ok, ...patch });
    expect(bad({ weeklyReachPercent: "" })).toMatchObject({ ok: false });
    expect(bad({ maxNewCampaignsPerWeek: "1.5" })).toMatchObject({ ok: false });
    expect(bad({ maxCampaignSharePercent: "101" })).toMatchObject({ ok: false });
    expect(bad({ sendingHourStart: "20", sendingHourEnd: "20" })).toMatchObject({
      ok: false,
      error: "La hora de inicio tiene que ser anterior a la de fin.",
    });
  });

  it("textos de pausa y de presupuesto", () => {
    expect(pauseReasonLabel("AUTO_OPT_OUTS")).toContain("baja");
    expect(pauseReasonLabel("MANUAL")).toBe("Pausada a mano.");
    expect(budgetLine("UYU", 120, 500)).toBe("UYU 120 de UYU 500");
    expect(budgetLine("UYU", 0, null)).toBe("UYU 0");
  });

  it("resumen de excluidos de una promoción", () => {
    expect(exclusionSummary({ NO_CONSENT: 3, RECENT_PROMOTION: 1 })).toBe(
      "Quedan afuera: 3 sin consentimiento de WhatsApp, 1 con una promoción reciente.",
    );
    expect(exclusionSummary({})).toBe("");
  });
});
