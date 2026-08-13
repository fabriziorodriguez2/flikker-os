-- Backfill obligatorio antes de que exista el guard de ruta.
--
-- `Business.onboarding_completed_at` se agregó nullable, así que TODOS los
-- negocios que ya existían quedaron en NULL. El guard nuevo lee ese campo como
-- "este negocio está a medio configurar" y manda al dueño a /comenzar: sin este
-- backfill, cada cliente actual entraría al wizard al abrir el panel.
--
-- Se usa `created_at` y no `now()` para no inventar una fecha de onboarding
-- posterior a actividad que ya ocurrió.
UPDATE "Business"
SET "onboarding_completed_at" = "createdAt"
WHERE "onboarding_completed_at" IS NULL;
