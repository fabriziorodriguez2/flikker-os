import { ReviewFlowMode } from '@prisma/client';

/**
 * Resolución canónica del flujo de reseñas de un Business (Check-in V2).
 * TODO call site que decide "¿formulario privado o directo a Google?" o
 * "¿qué URL de Google uso?" pasa por acá — nunca cada módulo repite su
 * propio cascade o su propia condición de puntaje.
 *
 * Nunca depende del puntaje del cliente: el modo es una elección fija del
 * negocio. LEGACY no usa esto — sigue con su comportamiento propio.
 */

export interface ReviewFlowBusiness {
  reviewFlowMode: ReviewFlowMode;
  defaultReviewRedirectUrl: string | null;
  googleBusinessProfileUrl: string | null;
}

export interface ReviewFlowResolution {
  mode: ReviewFlowMode;
  /**
   * Mismo cascade en todos los call sites (antes inconsistente: algunos
   * preferían `defaultReviewRedirectUrl`, otros usaban solo
   * `googleBusinessProfileUrl`). `null` = el negocio no tiene Google
   * configurado todavía — nunca se fabrica una URL.
   */
  googleReviewUrl: string | null;
}

export function resolveReviewFlow(
  business: ReviewFlowBusiness,
): ReviewFlowResolution {
  return {
    mode: business.reviewFlowMode,
    googleReviewUrl:
      business.defaultReviewRedirectUrl ??
      business.googleBusinessProfileUrl ??
      null,
  };
}

/**
 * DIRECT_GOOGLE sin un destino real mandaría al cliente a un link roto —
 * nunca puede quedar activo así. Usado tanto al guardar la configuración
 * (admin/onboarding) como, defensivamente, en runtime.
 */
export function canUseDirectGoogle(
  business: Pick<
    ReviewFlowBusiness,
    'defaultReviewRedirectUrl' | 'googleBusinessProfileUrl'
  >,
): boolean {
  return Boolean(
    business.defaultReviewRedirectUrl ?? business.googleBusinessProfileUrl,
  );
}
