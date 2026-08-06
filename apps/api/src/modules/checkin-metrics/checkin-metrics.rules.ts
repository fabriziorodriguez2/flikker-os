// Pure, data-driven helpers for the retention dashboard. Kept separate from DB
// access so the rules and math are unit-testable and never "invent" numbers.

export interface FunnelCounts {
  scanned: number;
  registered: number;
  messagesSent: number;
  messagesOpened: number;
  returns: number;
  benefitsRedeemed: number;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
}

// Thresholds — a rule only fires with enough signal, so we never nag on noise.
const MIN_SCANS_FOR_SIGNAL = 20;
const LOW_REGISTRATION_RATIO = 0.3;
const MIN_SCANS = 10;
const MIN_OPENS_FOR_SIGNAL = 10;
const LOW_RETURN_FROM_OPENS_RATIO = 0.2;

/** Percentage (1 decimal) or null when the denominator is 0. */
export function ratePct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Average of the deltas (ms) as whole days, or null when empty. */
export function averageDays(deltasMs: number[]): number | null {
  if (deltasMs.length === 0) return null;
  const sum = deltasMs.reduce((a, b) => a + b, 0);
  return Math.round(sum / deltasMs.length / 86_400_000);
}

/**
 * Rule-based (no AI) suggestions. Each rule only fires with enough signal and
 * describes a concrete next action. Empty array = nothing actionable yet.
 */
export function buildRecommendations(funnel: FunnelCounts): Recommendation[] {
  const recs: Recommendation[] = [];

  if (funnel.scanned < MIN_SCANS) {
    recs.push({
      id: 'few_scans',
      title: 'Pocos escaneos',
      detail:
        'Pedile al personal que invite a escanear el QR en la mesa o el mostrador.',
    });
  } else if (
    funnel.scanned >= MIN_SCANS_FOR_SIGNAL &&
    ratePctSafe(funnel.registered, funnel.scanned) < LOW_REGISTRATION_RATIO
  ) {
    recs.push({
      id: 'reduce_form',
      title: 'Muchos escaneos y pocos registros',
      detail:
        'Reducí el formulario a nombre y WhatsApp, o reforzá el beneficio de entrada.',
    });
  }

  if (
    funnel.messagesOpened >= MIN_OPENS_FOR_SIGNAL &&
    ratePctSafe(funnel.returns, funnel.messagesOpened) <
      LOW_RETURN_FROM_OPENS_RATIO
  ) {
    recs.push({
      id: 'short_benefit',
      title: 'Muchos clics y pocos retornos',
      detail:
        'Probá un beneficio con vencimiento corto para motivar la vuelta.',
    });
  }

  return recs;
}

function ratePctSafe(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}
