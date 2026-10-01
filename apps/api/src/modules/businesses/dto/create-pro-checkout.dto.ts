import { IsEnum } from 'class-validator';
import { CheckoutPlan } from '@prisma/client';

/**
 * Checkout Pro AUTENTICADO (Parte 5) — el browser SOLO elige MONTHLY/YEARLY.
 * El Business sale de la sesión (`TenantGuard`), nunca del body: nadie
 * puede mandar un `businessId` propio para pagar la suscripción de otro
 * negocio.
 */
export class CreateProCheckoutDto {
  @IsEnum(CheckoutPlan)
  plan: CheckoutPlan;
}
