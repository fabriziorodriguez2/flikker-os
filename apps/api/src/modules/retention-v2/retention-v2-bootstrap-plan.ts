import { RetentionObjective, RetentionStrategyType } from '@prisma/client';

/**
 * Pure planning logic for `RetentionV2BootstrapService` — kept separate from
 * the DB/transaction/admin-service orchestration so the "what should this
 * experiment look like" decision is unit-testable without touching Prisma.
 */

/**
 * The three objectives "Te extrañamos" needs covered — one experiment each,
 * since `RetentionExperiment.objective` is a single scalar field. Shared
 * with `NotificationsService`'s setup-readiness check, so the two never
 * drift into checking a different set of objectives.
 */
export const RECOVERY_OBJECTIVES: RetentionObjective[] = [
  RetentionObjective.SECOND_VISIT,
  RetentionObjective.AT_RISK_RECOVERY,
  RetentionObjective.INACTIVE_RECOVERY,
];

export interface DesiredVariant {
  name: string;
  strategyType: RetentionStrategyType;
  incentiveDefinitionId: string | null;
  allocationPercent: number;
}

/**
 * The minimum shape the real engine needs per objective (see
 * RetentionExperimentsAdminService.validateStrategyForObjective, which this
 * mirrors rather than duplicates a second definition of):
 *  - REWARD_GOAL_PROGRESS: CONTROL + PROGRESS_REMINDER only — it never
 *    carries a benefit (see PROGRESS_REMINDER's own docstring in schema.prisma).
 *  - every other objective: CONTROL + REMINDER, plus one SOFT_BENEFIT
 *    variant per currently-authorized incentive. REMINDER always stays
 *    present even when benefits exist — "solo enviar un recordatorio" must
 *    remain a real, reachable arm, not just the day-1 default.
 *
 * Control keeps a non-zero, non-100 share by construction, so there is
 * always at least one treatment arm to route the rest to — matching
 * `validateAllocation`'s hard requirement that CONTROL never take 100%.
 */
export function computeDesiredVariants(
  objective: RetentionObjective,
  controlPercent: number,
  authorizedIncentiveIds: string[],
): DesiredVariant[] {
  const control = Math.min(95, Math.max(1, Math.round(controlPercent)));
  const remaining = 100 - control;

  const treatments: Omit<DesiredVariant, 'allocationPercent'>[] =
    objective === RetentionObjective.REWARD_GOAL_PROGRESS
      ? [
          {
            name: 'Recordatorio de progreso',
            strategyType: RetentionStrategyType.PROGRESS_REMINDER,
            incentiveDefinitionId: null,
          },
        ]
      : [
          {
            name: 'Recordatorio',
            strategyType: RetentionStrategyType.REMINDER,
            incentiveDefinitionId: null,
          },
          ...authorizedIncentiveIds.map((id, index) => ({
            name: `Beneficio ${index + 1}`,
            strategyType: RetentionStrategyType.SOFT_BENEFIT,
            incentiveDefinitionId: id,
          })),
        ];

  const shares = splitEvenly(remaining, treatments.length);

  return [
    {
      name: 'Control',
      strategyType: RetentionStrategyType.CONTROL,
      incentiveDefinitionId: null,
      allocationPercent: control,
    },
    ...treatments.map((t, i) => ({ ...t, allocationPercent: shares[i] })),
  ];
}

/**
 * Splits `total` into `count` non-negative integers that sum to exactly
 * `total`, as evenly as possible. The remainder from integer division lands
 * on the first shares rather than the last — arbitrary, but deterministic,
 * which is all that matters (nothing about arm identity depends on order).
 */
function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
}

/** The identity of a variant set, ignoring allocation percentages and names. */
export type VariantShape = {
  strategyType: RetentionStrategyType;
  incentiveDefinitionId: string | null;
};

/**
 * Whether an existing (active) variant set already matches what we want.
 * Order-independent — recruitment doesn't care which variant was created
 * first, only which strategy/incentive combinations exist.
 */
export function shapesMatch(
  desired: VariantShape[],
  current: VariantShape[],
): boolean {
  if (desired.length !== current.length) return false;
  const key = (v: VariantShape) =>
    `${v.strategyType}:${v.incentiveDefinitionId ?? ''}`;
  const desiredKeys = desired.map(key).sort();
  const currentKeys = current.map(key).sort();
  return desiredKeys.every((k, i) => k === currentKeys[i]);
}
