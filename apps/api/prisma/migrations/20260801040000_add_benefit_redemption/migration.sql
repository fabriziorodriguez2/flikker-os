-- Benefit redemption: a unique per-customer code, consumed atomically at most
-- once (double-canje guard is a conditional UPDATE ... WHERE redeemed_at IS NULL).
ALTER TABLE "benefit_participations"
  ADD COLUMN "redemption_code" TEXT,
  ADD COLUMN "redeemed_at" TIMESTAMP(3),
  ADD COLUMN "redeemed_by_user_id" TEXT,
  ADD COLUMN "redeemed_visit_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "benefit_participations_redemption_code_key"
  ON "benefit_participations"("redemption_code");
