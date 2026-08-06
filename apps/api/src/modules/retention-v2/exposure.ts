import { RetentionAssignmentStatus } from '@prisma/client';

/**
 * Which assignment states count as "exposed" for experimental measurement
 * (Fase D §4) — the denominator every return-rate calculation divides by.
 *
 *   OBSERVING — confirmed into CONTROL. Nothing was sent, but the customer
 *               was genuinely held out as the causal baseline; it counts.
 *   SENT      — a Message row was actually created (the transaction in
 *               `RetentionV2SendService.createMessage` committed). Whether
 *               WhatsApp later delivered it is a delivery-tracking question,
 *               not an exposure one — this is an intention-to-treat read, the
 *               standard and simpler choice for an experiment like this.
 *
 * Everything else was never exposed and must never enter a denominator:
 *   PENDING — still waiting (for the sending window, a retry, or a decision
 *             that never got made). Includes a transient `createMessage`
 *             failure, which leaves the row PENDING rather than SKIPPED so
 *             the next run can retry it.
 *   SKIPPED — rejected by eligibility, budget, or an unusable incentive
 *             before anything was ever shown to the customer.
 */
export const EXPOSED_STATUSES: RetentionAssignmentStatus[] = [
  RetentionAssignmentStatus.OBSERVING,
  RetentionAssignmentStatus.SENT,
];

export function isExposed(status: RetentionAssignmentStatus): boolean {
  return EXPOSED_STATUSES.includes(status);
}
