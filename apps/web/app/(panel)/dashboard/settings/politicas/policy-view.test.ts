import {
  budgetLine,
  initialForm,
  parseForm,
  pauseReasonLabel,
  type PolicyForm,
  type PolicyView,
} from "./policy-view";
import { exclusionSummary } from "../../notificaciones/promotions-tab";

const preset = {
  messagingBudgetMonthly: 500,
  incentiveBudgetMonthly: 1500,
  maxUniqueRecipientsPerWeek: 25,
  maxNewCampaignsPerWeek: 2,
  minDaysBetweenPromotions: 14,
  maxPromotionsPer30Days: 2,
  sendingHourStart: 10,
  sendingHourEnd: 20,
  maxCampaignSharePercent: 25,
};

function view(overrides: Partial<PolicyView> = {}): PolicyView {
  return {
    policyVersion: 1,
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
      maxUniqueRecipientsPerWeek: null,
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
    blockers: [],
    missing: [],
    ...overrides,
  };
}

describe("policy view", () => {
  it("sin aceptar, el formulario propone el preset Equilibrado completo", () => {
    expect(initialForm(view())).toEqual({
      messagingBudgetMonthly: "500",
      incentiveBudgetMonthly: "1500",
      maxUniqueRecipientsPerWeek: "25",
      maxNewCampaignsPerWeek: "2",
      minDaysBetweenPromotions: "14",
      maxPromotionsPer30Days: "2",
      sendingHourStart: "10",
      sendingHourEnd: "20",
      maxCampaignSharePercent: "25",
    });
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
    expect(bad({ maxUniqueRecipientsPerWeek: "" })).toMatchObject({ ok: false });
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
