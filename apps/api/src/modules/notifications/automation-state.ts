/**
 * §16/§17 — the full vocabulary for "what is this automation actually
 * doing right now", in the order that matters: a switched-off automation is
 * "desactivado" no matter what else is true, dry run always shows as its own
 * state before channel/setup are even considered, and so on down to the one
 * state that means "genuinely sending": activo.
 *
 * `preparando` exists for exactly one real scenario: a business whose
 * settings say an automation is on, but Retention V2 has no working
 * experiment for it yet (self-service bootstrap has not run — see
 * RetentionV2BootstrapService — or, before that service existed, a business
 * whose flag predates this feature entirely). Without this state, such a
 * business would either show "Activo" while sending nothing (the exact lie
 * this whole phase exists to stop), or "Desactivado" while the owner
 * insists they turned it on.
 */
export type AutomationState =
  | 'activo'
  | 'modo_prueba'
  | 'sin_canal'
  | 'preparando'
  | 'desactivado';

export function resolveAutomationState(input: {
  /** The effective flag: engine kill switch AND this automation's own toggle. */
  toggledOn: boolean;
  dryRunEnabled: boolean;
  whatsappAvailable: boolean;
  setupReady: boolean;
}): AutomationState {
  if (!input.toggledOn) return 'desactivado';
  if (input.dryRunEnabled) return 'modo_prueba';
  if (!input.whatsappAvailable) return 'sin_canal';
  if (!input.setupReady) return 'preparando';
  return 'activo';
}
