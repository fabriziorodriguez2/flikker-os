import { resolveAutomationState } from './automation-state';

const READY = {
  toggledOn: true,
  dryRunEnabled: false,
  whatsappAvailable: true,
  setupReady: true,
};

describe('resolveAutomationState', () => {
  it('desactivado wins over everything when the toggle itself is off', () => {
    expect(
      resolveAutomationState({
        ...READY,
        toggledOn: false,
        dryRunEnabled: true,
        whatsappAvailable: false,
        setupReady: false,
      }),
    ).toBe('desactivado');
  });

  it('modo_prueba when dry run is on, even with everything else ready', () => {
    expect(resolveAutomationState({ ...READY, dryRunEnabled: true })).toBe(
      'modo_prueba',
    );
  });

  it('sin_canal when WhatsApp is not available', () => {
    expect(resolveAutomationState({ ...READY, whatsappAvailable: false })).toBe(
      'sin_canal',
    );
  });

  it('preparando when toggled on, channel fine, but no working experiment yet', () => {
    expect(resolveAutomationState({ ...READY, setupReady: false })).toBe(
      'preparando',
    );
  });

  it('activo only when every condition holds', () => {
    expect(resolveAutomationState(READY)).toBe('activo');
  });

  it('channel takes priority over setup readiness (both can be broken at once)', () => {
    expect(
      resolveAutomationState({
        ...READY,
        whatsappAvailable: false,
        setupReady: false,
      }),
    ).toBe('sin_canal');
  });
});
