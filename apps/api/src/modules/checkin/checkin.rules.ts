import { VisitAttributionType } from '@prisma/client';

// ── Deduplication ────────────────────────────────────────────────────────────

export interface DedupInput {
  /** occurredAt of the customer's most recent visit, or null if none. */
  lastVisitAt: Date | null;
  /** How many visits the customer already has on the current local day. */
  visitsToday: number;
  now: Date;
  minHoursBetweenVisits: number;
  maxVisitsPerDay: number;
}

export type DedupDecision =
  | { allowed: true }
  | { allowed: false; reason: 'min_hours' | 'max_per_day' };

/**
 * Pure dedup decision. The moving 8h window (min_hours) cannot be expressed as a
 * static DB index, so it is evaluated here under the caller's advisory lock. The
 * per-day cap is a simple count comparison.
 */
export function evaluateDedup(input: DedupInput): DedupDecision {
  const {
    lastVisitAt,
    visitsToday,
    now,
    minHoursBetweenVisits,
    maxVisitsPerDay,
  } = input;

  if (lastVisitAt) {
    const elapsedMs = now.getTime() - lastVisitAt.getTime();
    if (elapsedMs < minHoursBetweenVisits * 3_600_000) {
      return { allowed: false, reason: 'min_hours' };
    }
  }

  if (visitsToday >= maxVisitsPerDay) {
    return { allowed: false, reason: 'max_per_day' };
  }

  return { allowed: true };
}

// ── Attribution ──────────────────────────────────────────────────────────────

export interface CandidateMessage {
  id: string;
  campaignId: string | null;
  sentAt: Date | null;
  clickedAt: Date | null;
}

export interface AttributionResult {
  attributionType: VisitAttributionType;
  messageId: string | null;
  campaignId: string | null;
}

/**
 * Resolves a single attribution for a RETURN visit from recent outreach.
 * Priority (per product rules):
 *   1. a message whose link was opened (strongest evidence) — most recent click;
 *   2. otherwise the most recently sent message;
 *   3. no candidates → organic (not attributable to Flikker outreach).
 * A visit is never attributed to more than one campaign. The link click itself
 * is NOT a return — it is only used here to attribute a separately-occurring
 * check-in. `confirmed_redemption` is applied later when a benefit is redeemed.
 */
export function resolveAttribution(
  candidates: CandidateMessage[],
): AttributionResult {
  if (candidates.length === 0) {
    return {
      attributionType: VisitAttributionType.organic,
      messageId: null,
      campaignId: null,
    };
  }

  const clicked = candidates
    .filter((c) => c.clickedAt != null)
    .sort((a, b) => timeOf(b.clickedAt) - timeOf(a.clickedAt));

  const chosen =
    clicked[0] ??
    [...candidates].sort((a, b) => timeOf(b.sentAt) - timeOf(a.sentAt))[0];

  return {
    attributionType: VisitAttributionType.post_campaign_checkin,
    messageId: chosen.id,
    campaignId: chosen.campaignId,
  };
}

function timeOf(date: Date | null): number {
  return date ? date.getTime() : 0;
}
