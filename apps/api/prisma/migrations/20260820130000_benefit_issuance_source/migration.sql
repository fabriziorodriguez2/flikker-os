-- Beneficios: un cliente puede recibir el MISMO Benefit múltiples veces
-- (pedido explícito) -- cada entrega es su propia fila, auditable para
-- siempre, con su propio código de canje. El @@unique([benefitId,
-- customerId]) que lo impedía se reemplaza por un índice NO único
-- equivalente (mismas queries de siempre, ya no bloquea una segunda
-- emisión legítima del mismo Benefit al mismo cliente).
--
-- `source` distingue el origen de cada emisión (Promociones, bienvenida,
-- reactivación, recompensa de tarjeta, sorteo, el `active` del check-in).
-- Se agrega NULLABLE, se backfillea por la relación que cada fila YA
-- tiene, y se cierra NOT NULL en la misma migración -- nunca queda una
-- fila sin clasificar.
--
-- `manual_campaign_id` solo se completa para emisiones nuevas de origen
-- PROMOTION (trazabilidad "qué promoción mandó esto") -- filas existentes
-- quedan NULL, no hay forma de reconstruir esa asociación retroactivamente.

CREATE TYPE "BenefitIssuanceSource" AS ENUM ('PROMOTION', 'WELCOME', 'REACTIVATION', 'REWARD_GOAL', 'RAFFLE', 'CHECKIN_ACTIVE', 'LEGACY');

ALTER TABLE "benefit_participations"
  ADD COLUMN "source" "BenefitIssuanceSource",
  ADD COLUMN "manual_campaign_id" TEXT;

ALTER TABLE "ManualCampaignContact" ADD COLUMN "link" TEXT;

-- Backfill, en orden de especificidad -- cada UPDATE solo toca filas que
-- el paso anterior dejó sin clasificar (bp."source" IS NULL).

-- Reactivación y recompensa de tarjeta: relación inversa ya sin ambigüedad.
UPDATE "benefit_participations" bp
SET "source" = 'REACTIVATION'
WHERE EXISTS (
  SELECT 1 FROM "retention_assignments" ra WHERE ra.benefit_participation_id = bp.id
);

UPDATE "benefit_participations" bp
SET "source" = 'REWARD_GOAL'
WHERE bp."source" IS NULL AND EXISTS (
  SELECT 1 FROM "customer_reward_goals" crg WHERE crg.benefit_participation_id = bp.id
);

-- Sorteos: el propio Benefit ya dice que es de tipo raffle.
UPDATE "benefit_participations" bp
SET "source" = 'RAFFLE'
WHERE bp."source" IS NULL AND EXISTS (
  SELECT 1 FROM "benefits" b WHERE b.id = bp.benefit_id AND b.type = 'raffle'
);

-- Bienvenida: el Benefit de esta fila es (o fue) el regalo de bienvenida
-- configurado en el negocio.
UPDATE "benefit_participations" bp
SET "source" = 'WELCOME'
WHERE bp."source" IS NULL AND EXISTS (
  SELECT 1 FROM "Business" biz WHERE biz.id = bp.business_id AND biz.welcome_benefit_id = bp.benefit_id
);

-- Resto: sin forma de determinar el origen retroactivamente (el `active`
-- del check-in y una promoción vieja se ven idénticos antes de esta
-- columna) -- LEGACY es metadata de auditoría, no afecta canje ni
-- disponibilidad.
UPDATE "benefit_participations" bp
SET "source" = 'LEGACY'
WHERE bp."source" IS NULL;

ALTER TABLE "benefit_participations" ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "benefit_participations"
  ADD CONSTRAINT "benefit_participations_manual_campaign_id_fkey"
  FOREIGN KEY ("manual_campaign_id") REFERENCES "ManualCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "benefit_participations_benefit_id_customer_id_key";
CREATE INDEX "benefit_participations_benefit_id_customer_id_idx" ON "benefit_participations"("benefit_id", "customer_id");
CREATE INDEX "benefit_participations_manual_campaign_id_idx" ON "benefit_participations"("manual_campaign_id");
