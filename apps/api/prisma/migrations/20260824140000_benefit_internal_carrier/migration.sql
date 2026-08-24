-- Marca explícita de "carrier interno" en Benefit.
--
-- Un carrier es una fila que el SISTEMA crea solo para poder emitir una
-- recompensa (Reward Goals, Retention V2). No es un beneficio del dueño.
--
-- Hasta ahora no había forma inequívoca de distinguirlos: se creaban con
-- `active = false`, pero eso no significa "interno" (un beneficio normal del
-- dueño está inactivo la mayor parte del tiempo). El resultado fue que los
-- carriers se listaban en Programa → Beneficios como duplicados del premio,
-- el dueño borró el que no reconocía, y el `onDelete: Cascade` se llevó
-- puesta una `BenefitParticipation` YA CANJEADA.

ALTER TABLE "benefits"
  ADD COLUMN "is_internal_carrier" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "benefits_business_id_is_internal_carrier_idx"
  ON "benefits" ("business_id", "is_internal_carrier");

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Solo se marca lo que se puede demostrar que es un carrier. Ante la duda,
-- se deja como beneficio del dueño: ocultarle uno suyo por error es peor
-- que dejar visible un carrier.

-- 1) Carriers de Retention V2 — apuntados por `RetentionVariant.issued_benefit_id`.
UPDATE "benefits" b
SET "is_internal_carrier" = true
FROM "retention_variants" v
WHERE v."issued_benefit_id" = b."id";

-- 2) Carriers de Reward Goals — `RewardGoalIssuerService` crea uno dedicado
--    por goal y le cuelga la participación que la goal referencia.
--
--    La exclusión del final es la parte importante: el beneficio REAL que el
--    dueño eligió como premio está puenteado por
--    `retention_incentive_definitions.benefit_id`. Ese nunca es un carrier y
--    tiene que seguir viéndose y editándose.
UPDATE "benefits" b
SET "is_internal_carrier" = true
WHERE EXISTS (
        SELECT 1
        FROM "benefit_participations" p
        JOIN "customer_reward_goals" g
          ON g."benefit_participation_id" = p."id"
        WHERE p."benefit_id" = b."id"
      )
  AND NOT EXISTS (
        SELECT 1 FROM "retention_incentive_definitions" d
        WHERE d."benefit_id" = b."id"
      );
