/**
 * Tipos y reglas de presentación de Configuración → Políticas. Lo que se
 * valida acá es solo para avisar antes de mandar: el backend vuelve a
 * validar todo y es la única autoridad.
 */

export interface PolicyValues {
  messagingBudgetMonthly: number | null;
  /** null = el dueño todavía no lo definió (ningún premio con costo). */
  incentiveBudgetMonthly: number | null;
  weeklyReachPercent: number | null;
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
  /** El preset no propone presupuesto de incentivos: lo decide el dueño. */
  preset: { [K in keyof PolicyValues]: K extends "incentiveBudgetMonthly" ? null : number };
  messageUnitCost: number | null;
  messageUnitCostCurrency: string | null;
  usage: {
    messagesSentThisMonth: number;
    messagingSpentThisMonth: number;
    incentiveLiabilityThisMonth: number;
    issuancesWithUnknownCost: number;
    customersWithWhatsappConsent: number;
  };
  incentives: {
    budgetSet: boolean;
    committed: number;
    consumed: number;
    inFlight: number;
    byIncentive: {
      label: string;
      issued: number;
      redeemed: number;
      committedCost: number;
      consumedCost: number;
      unknownCost: number;
    }[];
    campaigns: {
      id: string;
      title: string;
      status: string;
      executedAt: string | null;
      estimatedCost: number | null;
    }[];
  };
  weeklyReach: {
    mode: "ADAPTIVE" | "PERCENT";
    threshold: number;
    registeredCustomers: number;
    contactableCustomers: number;
    capThisWeek: number | null;
    contactedThisWeek: number;
    /** Registrados al empezar la semana: fijan el modo de toda la semana. */
    registeredAtWeekStart?: number;
    /** Solo si desde el lunes cambia el modo (p. ej. al pasar de 149 a 150). */
    nextWeek?: { mode: "ADAPTIVE" | "PERCENT"; estimatedCap: number | null } | null;
  };
  blockers: { code: string; message: string }[];
  missing: string[];
}

export type PolicyForm = Record<keyof PolicyValues, string>;
export type ParsedPolicyValues = Omit<Record<keyof PolicyValues, number>, "incentiveBudgetMonthly"> & {
  incentiveBudgetMonthly: number | null;
};

export const FIELD_ORDER: (keyof PolicyValues)[] = [
  "messagingBudgetMonthly",
  "incentiveBudgetMonthly",
  "weeklyReachPercent",
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
  weeklyReachPercent: [1, 100, false],
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
    // El presupuesto de incentivos no tiene propuesta: vacío hasta que el
    // dueño lo define (y si lo dejó sin definir, sigue vacío).
    const value = key === "incentiveBudgetMonthly" ? saved : (saved ?? view.preset[key]);
    form[key] = value === null ? "" : String(value);
  }
  return form;
}

export function parseForm(
  form: PolicyForm,
): { ok: true; values: ParsedPolicyValues } | { ok: false; error: string } {
  const values = {} as ParsedPolicyValues;
  for (const key of FIELD_ORDER) {
    const raw = form[key].trim().replace(",", ".");
    const [min, max, decimals] = RANGES[key];
    const n = Number(raw);
    // Vacío = "todavía no lo definí": solo vale para el presupuesto de incentivos.
    if (key === "incentiveBudgetMonthly" && raw === "") {
      values.incentiveBudgetMonthly = null;
      continue;
    }
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
  incentiveBudgetMonthly: "Presupuesto de beneficios e incentivos por mes",
  weeklyReachPercent: "Alcance semanal (% de clientes con WhatsApp)",
  maxNewCampaignsPerWeek: "Campañas nuevas por semana",
  minDaysBetweenPromotions: "Días mínimos entre promociones a un cliente",
  maxPromotionsPer30Days: "Máximo de promociones por cliente cada 30 días",
  sendingHourStart: "Enviar desde (hora)",
  sendingHourEnd: "Enviar hasta (hora)",
  maxCampaignSharePercent: "Máximo por campaña (% de cada presupuesto)",
};

/** Ayudas debajo de los campos que más se malinterpretan. */
export const FIELD_HINTS: Partial<Record<keyof PolicyValues, string>> = {
  incentiveBudgetMonthly:
    "Lo decidís vos. Vacío: Intelligence solo propone acciones sin beneficios con costo. 0: no querés asumir costos de incentivos.",
  maxPromotionsPer30Days: "Es un máximo, no una meta: Intelligence puede mandar menos.",
};

/** Qué tope semanal rige hoy, en palabras del dueño. */
export function weeklyReachText(view: PolicyView): string {
  const w = view.weeklyReach;
  const percent = view.values.weeklyReachPercent ?? "—";
  let text: string;
  if (w.mode === "ADAPTIVE") {
    const registered = w.registeredAtWeekStart ?? w.registeredCustomers;
    text = `Esta semana arrancó con ${registered} clientes registrados (menos de ${w.threshold}): no hay tope semanal por porcentaje. Intelligence decide cuántos contactar, siempre dentro del presupuesto, el consentimiento y la frecuencia por cliente.`;
  } else if (w.capThisWeek === null) {
    text = "Definí el porcentaje para calcular el alcance semanal.";
  } else {
    text = `Esta semana: hasta ${w.capThisWeek} clientes distintos (${percent}% de ${w.contactableCustomers} con WhatsApp autorizado). Ya van ${w.contactedThisWeek}. Se recalcula a medida que crece tu base.`;
  }
  if (w.nextWeek?.mode === "PERCENT") {
    text += ` Ya tenés ${w.registeredCustomers} clientes registrados: desde el lunes rige el ${percent}% semanal${
      w.nextWeek.estimatedCap !== null ? ` (hoy serían hasta ${w.nextWeek.estimatedCap} clientes distintos)` : ""
    }. Las campañas en curso no se cortan por este cambio.`;
  } else if (w.nextWeek?.mode === "ADAPTIVE") {
    text += ` Hoy tenés ${w.registeredCustomers} clientes registrados (menos de ${w.threshold}): desde el lunes no hay tope semanal por porcentaje.`;
  }
  return text;
}

/**
 * Si el cambio toca el presupuesto de incentivos de una política ya aceptada,
 * el texto que el dueño tiene que confirmar. null = no hace falta confirmar.
 */
export function incentiveBudgetChange(
  view: PolicyView,
  next: ParsedPolicyValues,
): string | null {
  if (!view.accepted) return null;
  const before = view.values.incentiveBudgetMonthly;
  const after = next.incentiveBudgetMonthly;
  if (before === after) return null;
  const currency = view.confirmed.currency ?? view.business.currency;
  const label = (v: number | null) => (v === null ? "sin definir" : formatMoney(currency, v));
  return `Vas a cambiar el presupuesto de beneficios e incentivos de ${label(before)} a ${label(after)} por mes.${
    after === null || after === 0 ? " Intelligence va a dejar de comprometer gastos en incentivos." : ""
  }`;
}

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
