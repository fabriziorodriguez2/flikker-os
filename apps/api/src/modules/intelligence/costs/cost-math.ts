/**
 * Costo aproximado de Intelligence, separado por naturaleza. Tres bolsas que
 * NUNCA se suman entre sí: la IA se paga en USD a OpenAI; la mensajería y
 * las recompensas, en la moneda del negocio. Todo sale de telemetría real
 * (AiUsageEvent, mensajes enviados, emisiones de premios); los precios son
 * configurables y el resultado dice con qué precios se calculó.
 */

export interface AiUsageRow {
  useCase: string;
  success: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface AiPrices {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export interface AiCost {
  turns: number;
  failedTurns: number;
  conversations: number;
  inputTokens: number;
  outputTokens: number;
  /** Lo que se estimó en el momento de cada llamada. */
  recordedUsd: number;
  /** Recalculado con los precios configurados hoy (por si cambiaron). */
  atCurrentPricesUsd: number;
  perTurnUsd: number | null;
  perConversationUsd: number | null;
  /** Otros usos de IA del negocio (copy de Autopilot, resúmenes, chatbot). */
  otherUseCasesUsd: number;
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export function aiCost(
  rows: AiUsageRow[],
  conversations: number,
  prices: AiPrices,
  agentUseCase: string,
): AiCost {
  let turns = 0;
  let failedTurns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let recordedUsd = 0;
  let otherUseCasesUsd = 0;
  for (const row of rows) {
    if (row.useCase !== agentUseCase) {
      otherUseCasesUsd += row.estimatedCostUsd ?? 0;
      continue;
    }
    turns += 1;
    if (!row.success) failedTurns += 1;
    inputTokens += row.inputTokens ?? 0;
    outputTokens += row.outputTokens ?? 0;
    recordedUsd += row.estimatedCostUsd ?? 0;
  }
  const atCurrentPricesUsd =
    (inputTokens * prices.inputPerMillionUsd +
      outputTokens * prices.outputPerMillionUsd) /
    1_000_000;
  return {
    turns,
    failedTurns,
    conversations,
    inputTokens,
    outputTokens,
    recordedUsd: round6(recordedUsd),
    atCurrentPricesUsd: round6(atCurrentPricesUsd),
    perTurnUsd: turns > 0 ? round6(atCurrentPricesUsd / turns) : null,
    perConversationUsd:
      conversations > 0 ? round6(atCurrentPricesUsd / conversations) : null,
    otherUseCasesUsd: round6(otherUseCasesUsd),
  };
}

export interface MessagingCost {
  marketingMessagesSent: number;
  unitCost: number | null;
  currency: string;
  /** null cuando no hay costo por mensaje cargado: nunca se inventa. */
  cost: number | null;
}

export function messagingCost(
  sent: number,
  unitCost: number | null,
  currency: string,
): MessagingCost {
  return {
    marketingMessagesSent: sent,
    unitCost,
    currency,
    cost: unitCost === null ? null : Math.round(sent * unitCost * 100) / 100,
  };
}

/** Proyección mensual simple: lo observado por día × 30. Solo si hay días. */
export function monthlyProjection(
  amount: number | null,
  days: number,
): number | null {
  if (amount === null || days <= 0) return null;
  return Math.round((amount / days) * 30 * 100) / 100;
}
