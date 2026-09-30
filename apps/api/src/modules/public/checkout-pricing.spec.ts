import { CheckoutPlan } from '@prisma/client';
import { resolveCheckoutPricing } from './checkout-pricing';

/**
 * La única fuente de verdad del precio. Estos números son los que se
 * mandan a Mercado Pago — si alguno cambia acá por error, se le cobra mal
 * a alguien real.
 */
describe('resolveCheckoutPricing', () => {
  it('MONTHLY: UYU 1000', () => {
    const pricing = resolveCheckoutPricing(CheckoutPlan.MONTHLY);
    expect(pricing.currency).toBe('UYU');
    expect(pricing.amount).toBe(1000);
    expect(pricing.serviceMonths).toBe(1);
  });

  it('YEARLY: UYU 10000 — 12 meses de uso pagando 10', () => {
    const pricing = resolveCheckoutPricing(CheckoutPlan.YEARLY);
    expect(pricing.currency).toBe('UYU');
    expect(pricing.amount).toBe(10000);
    expect(pricing.serviceMonths).toBe(12);
  });

  it('el anual es exactamente 10x el mensual — la promesa "pagás 10, usás 12"', () => {
    const monthly = resolveCheckoutPricing(CheckoutPlan.MONTHLY);
    const yearly = resolveCheckoutPricing(CheckoutPlan.YEARLY);
    expect(yearly.amount).toBe(monthly.amount * 10);
  });

  it('los títulos identifican el plan sin ambigüedad', () => {
    expect(resolveCheckoutPricing(CheckoutPlan.MONTHLY).title).toBe(
      'Flikker Pro Mensual',
    );
    expect(resolveCheckoutPricing(CheckoutPlan.YEARLY).title).toBe(
      'Flikker Pro Anual',
    );
  });

  /*
   * Pivot 2026-09-30: subscription SIN plan asociado — `mercadoPagoReason`
   * y `frequency`/`frequencyType` son lo que arma el body real de
   * `/preapproval` (ver `mercado-pago-subscription.provider.ts`). Distinto
   * de `title` a propósito: `mercadoPagoReason` replica el nombre de los
   * planes que ya existen del lado de Mercado Pago.
   */
  it('mercadoPagoReason usa el mismo nombre que los planes ya existentes en Mercado Pago', () => {
    expect(resolveCheckoutPricing(CheckoutPlan.MONTHLY).mercadoPagoReason).toBe(
      'Flikker Pro',
    );
    expect(resolveCheckoutPricing(CheckoutPlan.YEARLY).mercadoPagoReason).toBe(
      'Flikker Pro Anual',
    );
  });

  it('frequency/frequencyType coinciden con serviceMonths en meses', () => {
    const monthly = resolveCheckoutPricing(CheckoutPlan.MONTHLY);
    expect(monthly.frequency).toBe(1);
    expect(monthly.frequencyType).toBe('months');

    const yearly = resolveCheckoutPricing(CheckoutPlan.YEARLY);
    expect(yearly.frequency).toBe(12);
    expect(yearly.frequencyType).toBe('months');
  });
});
