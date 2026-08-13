/**
 * El estado EFECTIVO de las dos automatizaciones — la única definición de
 * producto de "¿esto está realmente funcionando?".
 *
 * El bug que esto existe para cerrar: `RetentionSettings.automaticCampaignsEnabled`
 * tiene default `true` en el schema, pero `Business.retentionEngineV2Enabled`
 * tiene default `false`. Un negocio que nunca pasó por Notificaciones (o cuyo
 * kill switch fue tocado por separado desde Platform Admin — ver
 * `platform.service.ts`) puede terminar con:
 *
 *   automaticCampaignsEnabled = true
 *   retentionEngineV2Enabled  = false
 *
 * En ese estado el worker NO manda nada: `RetentionV2EvaluateService.
 * findOwnedBusinesses()` filtra por `retentionEngineV2Enabled: true` ANTES de
 * mirar ningún otro flag, así que ninguna de las dos pasadas de reclutamiento
 * corre para ese negocio. Pero si la UI mostrara `automaticCampaignsEnabled`
 * tal cual, diría "Te extrañamos: Activo" sobre una automatización apagada.
 *
 * La regla real, confirmada leyendo el worker (`findOwnedBusinesses` +
 * `evaluateBusiness` + `evaluateBusinessForRewardGoalProgress`, todos en
 * `retention-v2-evaluate.service.ts`) y el gate compartido de envío
 * (`evaluateEligibility` en `eligibility.ts`, que también exige el kill
 * switch): cada automatización necesita el kill switch del negocio Y su
 * propio flag. Ninguna automatización depende de la otra — seguimos sin tener
 * un solo interruptor que controle ambas.
 *
 * Se usa en cualquier lugar que le muestre al dueño si algo está activo:
 * Notificaciones (fuente), Home (hereda de Notificaciones) y — deliberadamente
 * NO — el `getState` de onboarding, que muestra los flags CRUDOS que el dueño
 * eligió para poder reanudar el wizard con su selección intacta, no si el
 * motor ya los está ejecutando (ver el comentario en `onboarding.service.ts`).
 */

export interface AutomationFlags {
  /** Kill switch del negocio completo. Sin esto, ninguna automatización corre. */
  retentionEngineV2Enabled: boolean;
  /** Interruptor propio de "Te extrañamos". */
  automaticCampaignsEnabled: boolean;
  /** Interruptor propio de "Cerca del premio". */
  progressReminderEnabled: boolean;
}

export interface EffectiveAutomationState {
  /** "Cerca del premio" — true solo si además el motor puede ejecutarla. */
  progressReminderEffective: boolean;
  /** "Te extrañamos" — true solo si además el motor puede ejecutarla. */
  recoveryEnabled: boolean;
}

export function resolveEffectiveAutomationState(
  flags: AutomationFlags,
): EffectiveAutomationState {
  return {
    progressReminderEffective:
      flags.retentionEngineV2Enabled && flags.progressReminderEnabled,
    recoveryEnabled:
      flags.retentionEngineV2Enabled && flags.automaticCampaignsEnabled,
  };
}
