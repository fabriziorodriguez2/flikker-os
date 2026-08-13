-- Cierra el último paso del onboarding que no distinguía "decidí que no" de
-- "todavía no decidí". Mismo patrón que `welcome_gift_decided`.
--
-- Los negocios ya existentes quedan en false, que es correcto: los que ya
-- terminaron el onboarding tienen `onboarding_completed_at` no nulo y nunca
-- vuelven al wizard, así que este campo no los afecta.
ALTER TABLE "Business" ADD COLUMN "notifications_decided" BOOLEAN NOT NULL DEFAULT false;
