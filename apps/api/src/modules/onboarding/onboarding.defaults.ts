/**
 * Defaults del onboarding self-service.
 *
 * ESTA PRIMERA VERSIÓN ES **URUGUAY-FIRST**: el wizard no pregunta país,
 * moneda ni zona horaria — los asume. Es una decisión de alcance, no una
 * limitación técnica: `Business` ya guarda los tres campos por negocio, así
 * que abrir multi-país más adelante es agregar un paso al wizard y leer de
 * acá, sin migración ni cambios de modelo.
 *
 * Todo lo específico de país vive en este archivo y en ningún otro lado, para
 * que ampliar no sea una cacería de constantes repetidas por el repo.
 */
export const ONBOARDING_DEFAULTS = {
  country: 'UY',
  currency: 'UYU',
  timezone: 'America/Montevideo',
} as const;

/**
 * Categorías ofrecidas en el paso 1. Orientadas al producto real: negocios
 * de alta frecuencia y ticket bajo, donde una tarjeta de sellos tiene
 * sentido. Se guardan en `Business.industry`.
 */
export const BUSINESS_CATEGORIES = [
  { value: 'cafeteria', label: 'Cafetería' },
  { value: 'panaderia', label: 'Panadería' },
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'barberia', label: 'Barbería' },
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'estetica', label: 'Estética' },
  { value: 'heladeria', label: 'Heladería' },
  { value: 'gimnasio', label: 'Gimnasio' },
  { value: 'tienda', label: 'Tienda' },
  { value: 'otro', label: 'Otro' },
] as const;

export const BUSINESS_CATEGORY_VALUES = BUSINESS_CATEGORIES.map(
  (category) => category.value,
);
