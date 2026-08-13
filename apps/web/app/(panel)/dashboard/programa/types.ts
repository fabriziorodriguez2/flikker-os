/** Respuesta de `GET /loyalty-program/overview`. */
export interface LoyaltyProgramOverview {
  enabled: boolean;
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
}

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
