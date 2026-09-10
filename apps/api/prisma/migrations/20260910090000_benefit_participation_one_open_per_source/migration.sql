-- ---------------------------------------------------------------------------
-- Escrito a mano: Prisma no modela índices únicos parciales — mismo patrón
-- que "customer_reward_goals_one_active_per_customer" y
-- "return_challenges_one_active_per_customer".
-- ---------------------------------------------------------------------------

-- Backstop de DB para la política CHECKIN_ACTIVE/WELCOME: "como máximo una
-- participación ABIERTA por (negocio, beneficio, cliente, origen)". Antes de
-- este índice, `ensureRedemptionCode` decidía esto con un `findFirst` seguido
-- de un `create` en dos pasos separados — dos requests simultáneos (dos scans
-- casi a la vez, o un doble submit) podían pasar los dos por el `findFirst`
-- antes de que cualquiera hiciera el `create`, y terminar con DOS filas
-- abiertas para la misma promesa. Este índice hace que la segunda `create`
-- falle en la base (P2002) en vez de crear la fila duplicada; el repository
-- atrapa ese error y devuelve la fila que ganó la carrera.
--
-- Escopeado a WELCOME y CHECKIN_ACTIVE — los ÚNICOS dos orígenes que hoy
-- pasan por `ensureRedemptionCode` con semántica de "reusar mientras esté
-- abierta" (ver el comentario de ese método en benefits.repository.ts).
-- PROMOTION queda deliberadamente AFUERA: su contrato es lo opuesto —
-- "cada envío es una emisión NUEVA e independiente, nunca idempotente a
-- propósito" (ver notifications-promotions.service.ts) — un negocio puede
-- mandar dos promociones manuales del mismo Benefit al mismo cliente sin que
-- la primera esté canjeada, y el repo YA tiene un test de integración real
-- que ejercita justo eso (benefit-issuance.integration.spec.ts). Meter
-- PROMOTION en este índice rompería ese contrato existente, no el que se
-- pidió reforzar acá.
--
-- `redeemed_at IS NULL` es lo que permite el historial: en el momento en que
-- una participación se canjea, deja de contar para el índice, así que la
-- próxima visita válida puede abrir una nueva sin chocar con ninguna vieja.
CREATE UNIQUE INDEX "benefit_participations_one_open_per_source"
  ON "benefit_participations" ("business_id", "benefit_id", "customer_id", "source")
  WHERE "redeemed_at" IS NULL
    AND "source" IN ('WELCOME', 'CHECKIN_ACTIVE');
