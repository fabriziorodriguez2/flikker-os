/**
 * Tipos y reglas de presentación de Configuración → Políticas. Lo que se
 * valida acá es solo para avisar antes de mandar: el backend vuelve a
 * validar todo y es la única autoridad.
 */

export interface PolicyValues {
  messagingBudgetMonthly: number | null;
  incentiveBudgetMonthly: number | null;
  maxUniqueRecipientsPerWeek: number | null;
  maxNewCampaignsPerWeek: number | null;
  minDaysBetweenPromotions: number;
  maxPromotionsPer30Days: number;
  sendingHourStart: number;
  sendingHourEnd: number;
  maxCampaignSharePercent: number | null;
}

export type PauseReason =
  | "MANUAL"
  | "AUTO_SEND_ERRORS"
  | "AUTO_OPT_OUTS"
  | "AUTO_COMPLAINTS";

export interface PolicyView {
  policyVersion: number;
  version: number;
  accepted: boolean;
  acceptedAt: string | null;
  business: { currency: string; timezone: string };
  confirmed: { currency: string | null; timezone: string | null };
  paused: boolean;
  pausedReason: PauseReason | null;
  pausedAt: string | null;
  values: PolicyValues;
  preset: Required<{ [K in keyof PolicyValues]: number }>;
  messageUnitCost: number | null;
  messageUnitCostCurrency: string | null;
  usage: {
    messagesSentThisMonth: number;
    messagingSpentThisMonth: number;
    incentiveLiabilityThisMonth: number;
    issuancesWithUnknownCost: number;
    customersWithWhatsappConsent: number;
  };
  blockers: { code: string; message: string }[];
  missing: string[];
}

export type PolicyForm = Record<keyof PolicyValues, string>;

export const FIELD_ORDER: (keyof PolicyValues)[] = [
  "messagingBudgetMonthly",
  "incentiveBudgetMonthly",
  "maxUniqueRecipientsPerWeek",
  "maxNewCampaignsPerWeek",
  "minDaysBetweenPromotions",
  "maxPromotionsPer30Days",
  "sendingHourStart",
  "sendingHourEnd",
  "maxCampaignSharePercent",
];

/** Límites de cordura, los mismos que valida el backend. */
const RANGES: Record<keyof PolicyValues, [number, number, boolean]> = {
  messagingBudgetMonthly: [0, 10_000_000, true],
  incentiveBudgetMonthly: [0, 10_000_000, true],
  maxUniqueRecipientsPerWeek: [1, 5000, false],
  maxNewCampaignsPerWeek: [0, 50, false],
  minDaysBetweenPromotions: [1, 90, false],
  maxPromotionsPer30Days: [1, 10, false],
  sendingHourStart: [0, 23, false],
  sendingHourEnd: [1, 24, false],
  maxCampaignSharePercent: [1, 100, false],
};

/**
 * Lo que arranca escrito en el formulario: lo guardado, o el preset
 * Equilibrado donde todavía no hay nada. Es una propuesta visible y
 * editable; no se aplica hasta que el dueño la acepta.
 */
export function initialForm(view: PolicyView): PolicyForm {
  const form = {} as PolicyForm;
  for (const key of FIELD_ORDER) {
    const saved = view.accepted ? view.values[key] : null;
    form[key] = String(saved ?? view.preset[key]);
  }
  return form;
}

export function parseForm(
  form: PolicyForm,
): { ok: true; values: Record<keyof PolicyValues, number> } | { ok: false; error: string } {
  const values = {} as Record<keyof PolicyValues, number>;
  for (const key of FIELD_ORDER) {
    const raw = form[key].trim().replace(",", ".");
    const [min, max, decimals] = RANGES[key];
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) {
      return { ok: false, error: `Completá "${FIELD_LABELS[key]}".` };
    }
    if (!decimals && !Number.isInteger(n)) {
      return { ok: false, error: `"${FIELD_LABELS[key]}" tiene que ser un número entero.` };
    }
    if (n < min || n > max) {
      return { ok: false, error: `"${FIELD_LABELS[key]}" tiene que estar entre ${min} y ${max}.` };
    }
    values[key] = decimals ? Math.round(n * 100) / 100 : n;
  }
  if (values.sendingHourStart >= values.sendingHourEnd) {
    return { ok: false, error: "La hora de inicio tiene que ser anterior a la de fin." };
  }
  return { ok: true, values };
}

export const FIELD_LABELS: Record<keyof PolicyValues, string> = {
  messagingBudgetMonthly: "Presupuesto de mensajería por mes",
  incentiveBudgetMonthly: "Tope de incentivos por mes",
  maxUniqueRecipientsPerWeek: "Clientes distintos por semana",
  maxNewCampaignsPerWeek: "Campañas nuevas por semana",
  minDaysBetweenPromotions: "Días mínimos entre promociones a un cliente",
  maxPromotionsPer30Days: "Promociones por cliente cada 30 días",
  sendingHourStart: "Enviar desde (hora)",
  sendingHourEnd: "Enviar hasta (hora)",
  maxCampaignSharePercent: "Máximo por campaña (% de ambas bolsas)",
};

export function pauseReasonLabel(reason: PauseReason | null): string {
  switch (reason) {
    case "AUTO_SEND_ERRORS":
      return "Se pausó sola por muchos errores de envío en los últimos 7 días.";
    case "AUTO_OPT_OUTS":
      return "Se pausó sola porque varios clientes pidieron la baja en los últimos 7 días.";
    case "AUTO_COMPLAINTS":
      return "Se pausó sola por quejas de clientes en los últimos 7 días.";
    default:
      return "Pausada a mano.";
  }
}

export function formatMoney(currency: string, value: number): string {
  return `${currency} ${new Intl.NumberFormat("es-UY", {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

/** "usado de tope", o solo lo usado si todavía no hay tope. */
export function budgetLine(
  currency: string,
  used: number,
  cap: number | null,
): string {
  return cap === null
    ? formatMoney(currency, used)
    : `${formatMoney(currency, used)} de ${formatMoney(currency, cap)}`;
}
