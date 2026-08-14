/**
 * §11 — separate from the automation's own ON/OFF state (`automation-state.ts`):
 * "Te extrañamos" can be genuinely `activo` (sending reminders) while its
 * benefits sub-status is anything here. Reminder-only is a fully working
 * product on its own — it must never read as broken just because no budget
 * is configured for benefits.
 *
 *  - `sin_autorizar`   — 0 benefits authorized. Not a problem: "Flikker está
 *                        usando solo recordatorios."
 *  - `necesita_limite` — at least one benefit authorized, but no budget cap
 *                        exists. Since `RetentionSettingsService.
 *                        assertBudgetReadyToAuthorize` now blocks NEW
 *                        authorizations from ever reaching this state, this
 *                        should only ever describe a business that got here
 *                        before that guard existed — kept reachable in the
 *                        read model rather than assumed away.
 *  - `listo`           — authorized, capped, under this month's usage.
 *  - `limite_alcanzado`— authorized, capped, this month's quantity cap is
 *                        already used up. Only computed against the
 *                        quantity cap Notificaciones itself exposes — a
 *                        business with ONLY a monetary cap (Platform Admin
 *                        advanced settings) reads as `listo` here even if
 *                        that cap is in fact exhausted; the authoritative
 *                        gate (RetentionBudgetService) still enforces it
 *                        correctly regardless of what this display shows.
 */
export type BenefitsAutomationStatus =
  | 'sin_autorizar'
  | 'necesita_limite'
  | 'listo'
  | 'limite_alcanzado';

export function resolveBenefitsAutomationStatus(input: {
  anyAuthorized: boolean;
  hasAnyCap: boolean;
  quantityLimit: number | null;
  usedThisMonth: number;
}): BenefitsAutomationStatus {
  if (!input.anyAuthorized) return 'sin_autorizar';
  if (!input.hasAnyCap) return 'necesita_limite';
  if (
    input.quantityLimit !== null &&
    input.usedThisMonth >= input.quantityLimit
  ) {
    return 'limite_alcanzado';
  }
  return 'listo';
}
