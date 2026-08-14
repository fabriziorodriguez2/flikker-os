import { resolveBenefitsAutomationStatus } from './benefits-automation-status';

describe('resolveBenefitsAutomationStatus', () => {
  it('sin_autorizar cuando no hay ningún beneficio autorizado', () => {
    expect(
      resolveBenefitsAutomationStatus({
        anyAuthorized: false,
        hasAnyCap: false,
        quantityLimit: null,
        usedThisMonth: 0,
      }),
    ).toBe('sin_autorizar');
  });

  it('necesita_limite cuando hay autorizados pero ningún cap configurado', () => {
    expect(
      resolveBenefitsAutomationStatus({
        anyAuthorized: true,
        hasAnyCap: false,
        quantityLimit: null,
        usedThisMonth: 0,
      }),
    ).toBe('necesita_limite');
  });

  it('listo cuando hay cap y todavía no se alcanzó', () => {
    expect(
      resolveBenefitsAutomationStatus({
        anyAuthorized: true,
        hasAnyCap: true,
        quantityLimit: 10,
        usedThisMonth: 3,
      }),
    ).toBe('listo');
  });

  it('limite_alcanzado cuando el uso llega al límite configurado', () => {
    expect(
      resolveBenefitsAutomationStatus({
        anyAuthorized: true,
        hasAnyCap: true,
        quantityLimit: 3,
        usedThisMonth: 3,
      }),
    ).toBe('limite_alcanzado');
  });

  it('listo (no limite_alcanzado) cuando el único cap es monetario — no hay número de cantidad para comparar', () => {
    expect(
      resolveBenefitsAutomationStatus({
        anyAuthorized: true,
        hasAnyCap: true,
        quantityLimit: null,
        usedThisMonth: 999,
      }),
    ).toBe('listo');
  });
});
