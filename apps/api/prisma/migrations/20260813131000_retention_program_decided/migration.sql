-- Nuevo onboarding self-service de 2 pasos: el paso 2 ahora se bifurca en
-- "Beneficios" o "Beneficios + sellos". Mismo patrón que
-- welcome_gift_decided/notifications_decided — sin este campo, "eligió
-- Beneficios sin sellos" y "todavía no llegó al paso 2" son indistinguibles
-- mirando solo `reward_goals_enabled` (false en los dos casos).
--
-- Los negocios ya existentes quedan en false: los que ya terminaron el
-- onboarding tienen `onboarding_completed_at` no nulo y nunca vuelven al
-- wizard, así que este campo no los afecta.
ALTER TABLE "Business" ADD COLUMN "retention_program_decided" BOOLEAN NOT NULL DEFAULT false;
