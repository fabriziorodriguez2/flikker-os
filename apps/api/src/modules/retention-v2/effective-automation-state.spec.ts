import { resolveEffectiveAutomationState } from './effective-automation-state';

/**
 * La única definición de "¿esto está realmente activo?". El caso que existe
 * para cerrar: `automaticCampaignsEnabled` tiene default `true` en el schema,
 * `retentionEngineV2Enabled` tiene default `false` — un negocio que nunca
 * tocó Notificaciones puede tener el primero en true sin que el segundo lo
 * acompañe, y en ese estado el worker no manda absolutamente nada.
 */
describe('resolveEffectiveAutomationState', () => {
  it('auto=true / engine=false → Te extrañamos DESACTIVADO', () => {
    const result = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: false,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: false,
    });
    expect(result.recoveryEnabled).toBe(false);
  });

  it('auto=false / engine=true → DESACTIVADO', () => {
    const result = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: true,
      automaticCampaignsEnabled: false,
      progressReminderEnabled: false,
    });
    expect(result.recoveryEnabled).toBe(false);
  });

  it('auto=true / engine=true → ACTIVO', () => {
    const result = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: true,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: false,
    });
    expect(result.recoveryEnabled).toBe(true);
  });

  it('progressReminderEnabled sigue siendo independiente de automaticCampaignsEnabled', () => {
    const soloProgreso = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: true,
      automaticCampaignsEnabled: false,
      progressReminderEnabled: true,
    });
    expect(soloProgreso.progressReminderEffective).toBe(true);
    expect(soloProgreso.recoveryEnabled).toBe(false);

    const soloRecuperacion = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: true,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: false,
    });
    expect(soloRecuperacion.progressReminderEffective).toBe(false);
    expect(soloRecuperacion.recoveryEnabled).toBe(true);
  });

  it('el kill switch apagado apaga las dos, sin importar los flags propios', () => {
    const result = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: false,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: true,
    });
    expect(result.recoveryEnabled).toBe(false);
    expect(result.progressReminderEffective).toBe(false);
  });

  it('las dos activas cuando el kill switch y ambos flags están en true', () => {
    const result = resolveEffectiveAutomationState({
      retentionEngineV2Enabled: true,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: true,
    });
    expect(result.recoveryEnabled).toBe(true);
    expect(result.progressReminderEffective).toBe(true);
  });
});
