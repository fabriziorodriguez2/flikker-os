/** Respuesta de `GET /loyalty-program/overview`. */
export interface LoyaltyProgramOverview {
  enabled: boolean;
  /** Capacidad independiente de sellos — catálogo de Beneficios visible públicamente. */
  benefitsEnabled: boolean;
  feedbackBonusEnabled: boolean;
  stampsRequired: number | null;
  reward: { name: string; benefitId: string | null } | null;
  welcomeGift: { name: string; benefitId: string } | null;
  stats: {
    customersParticipating: number;
    cardsInProgress: number;
    unlockedTotal: number;
    redeemedTotal: number;
  };
  recentActivity: Array<{
    id: string;
    type: "stamp" | "unlocked" | "redeemed" | "feedback";
    customerName: string | null;
    detail: string | null;
    occurredAt: string;
  }>;
  /** Cuántos beneficios tiene el catálogo — Programa ya no es solo la tarjeta. */
  benefitsCount: number;
  /**
   * Self-service (FREE sellos / trial Beneficios). `maxCustomers: null` =
   * sin tope (plan pago, o sin Subscription — LEGACY/Platform Admin/negocio
   * anterior a esta feature).
   */
  plan: {
    maxCustomers: number | null;
    benefitsTrialExpired: boolean;
    trialEndsAt: string | null;
    isPro: boolean;
    planName: string | null;
  };
}

/** Un ítem del timeline de `GET /loyalty-program/history`. */
export interface ProgramHistoryItem {
  id: string;
  message: string;
  occurredAt: string;
}

/** Los tres usos independientes de un beneficio, tal como los ve el dueño. */
export interface BenefitUses {
  /** Se entrega al completar la tarjeta de sellos. */
  rewardCard: boolean;
  /** Se muestra a todo cliente nuevo en su primer check-in. */
  welcomeGift: boolean;
  /** Flikker puede usarlo para recuperar clientes que dejaron de venir. */
  reactivation: boolean;
}

export interface ProgramBenefit {
  id: string;
  type: string;
  title: string;
  description: string | null;
  terms: string | null;
  active: boolean;
  retentionBridge: {
    recoveryEnabled: boolean;
    rewardGoalEnabled: boolean;
    hasKnownValue: boolean;
  };
}

export interface LoyaltyAppearance {
  logoUrl: string | null;
  primaryColor: string | null;
  loyaltyCardColor: string | null;
  loyaltyStampColor: string | null;
  loyaltyStampIcon: string | null;
  /** Página de inscripción — encabezado propio de la landing de check-in. */
  checkinWelcomeMessage: string | null;
}

/**
 * Fila de `GET/POST/PATCH /retention-v2/incentives` — el catálogo de
 * incentivos que el dueño autoriza. Programa → Incentivos edita solo los
 * campos DESCRIPTIVOS (nombre, tipo, valor, condiciones, días, límites):
 * `automationEligible`/`rewardGoalEligible` son la autorización explícita
 * para que el motor de Retention V2 los use solo, y esa decisión sigue
 * viviendo donde ya vivía (Beneficios, y Herramientas Flikker para Platform
 * Admin) — no se duplica acá.
 */
export interface ProgramIncentive {
  id: string;
  name: string;
  type: string;
  percentageValue: number | null;
  fixedValue: string | null;
  description: string | null;
  conditions: string | null;
  expiresInDays: number;
  active: boolean;
  maxRedemptionsPerCustomer: number | null;
  maxTotalRedemptions: number | null;
  validDays: number[];
}

export const WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

export const BENEFIT_TYPE_LABELS: Record<string, string> = {
  gift: "Regalo",
  discount: "Descuento",
  promotion: "2x1",
  upgrade: "Upgrade",
  other: "Personalizado",
  // `raffle` no se ofrece como tipo del Programa (ver CREATABLE_TYPES), pero
  // se etiqueta igual para negocios que ya tengan sorteos de antes.
  raffle: "Sorteo",
  none: "Sin beneficio",
};

/**
 * Tipos ofrecidos al crear un beneficio del Programa.
 *
 * `raffle` queda AFUERA a propósito: su flujo (participaciones por ciclo +
 * `RaffleDraw` + worker de sorteo) es otra mecánica, no un premio que se
 * canjea en el mostrador, y no encaja en una tarjeta de sellos.
 *
 * "Descuento fijo" tampoco está: `Benefit` no tiene campo de monto —
 * `percentageValue`/`fixedValue` viven en el incentivo de reactivación, no
 * en el beneficio. Hasta que el modelo lo soporte, un descuento fijo se
 * expresa como "Descuento" con el monto en el título.
 */
export const CREATABLE_BENEFIT_TYPES = [
  { value: "gift", label: "Regalo" },
  { value: "discount", label: "Descuento porcentual" },
  { value: "promotion", label: "2x1" },
  { value: "upgrade", label: "Upgrade" },
  { value: "other", label: "Personalizado" },
] as const;
