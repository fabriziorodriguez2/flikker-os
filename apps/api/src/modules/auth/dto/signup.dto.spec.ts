import { validate } from 'class-validator';
import { CheckoutPlan } from '@prisma/client';
import { SignupDto } from './signup.dto';

/**
 * `pendingUpgradePlan` nunca se confía directamente al query param del
 * frontend — acá se prueba que el backend lo valida como el enum que es.
 * Un signup normal (sin el campo) sigue siendo válido.
 */
describe('SignupDto — pendingUpgradePlan', () => {
  const BASE = {
    name: 'Ana Pérez',
    email: 'ana@example.com',
    password: 'password1',
    confirmPassword: 'password1',
  };

  it('signup normal, sin pendingUpgradePlan: válido', async () => {
    const dto = Object.assign(new SignupDto(), BASE);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('MONTHLY: válido', async () => {
    const dto = Object.assign(new SignupDto(), {
      ...BASE,
      pendingUpgradePlan: CheckoutPlan.MONTHLY,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('YEARLY: válido', async () => {
    const dto = Object.assign(new SignupDto(), {
      ...BASE,
      pendingUpgradePlan: CheckoutPlan.YEARLY,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('un valor fuera del enum (ej. inyectado a mano, saltando el frontend) se rechaza', async () => {
    const dto = Object.assign(new SignupDto(), {
      ...BASE,
      pendingUpgradePlan: 'WEEKLY',
    });
    const errors = await validate(dto);
    expect(
      errors.some((error) => error.property === 'pendingUpgradePlan'),
    ).toBe(true);
  });
});
