-- CreateTable
CREATE TABLE "raffle_draws" (
    "id" TEXT NOT NULL,
    "benefit_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "winner_customer_id" TEXT,
    "participants_count" INTEGER NOT NULL,
    "drawn_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "raffle_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raffle_draws_benefit_id_period_key_key" ON "raffle_draws"("benefit_id", "period_key");
CREATE INDEX "raffle_draws_business_id_idx" ON "raffle_draws"("business_id");
CREATE INDEX "raffle_draws_benefit_id_idx" ON "raffle_draws"("benefit_id");

-- AddForeignKey
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_winner_customer_id_fkey" FOREIGN KEY ("winner_customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "benefit_participations" ADD COLUMN "raffle_draw_id" TEXT;

-- CreateIndex
CREATE INDEX "benefit_participations_raffle_draw_id_idx" ON "benefit_participations"("raffle_draw_id");

-- AddForeignKey
ALTER TABLE "benefit_participations" ADD CONSTRAINT "benefit_participations_raffle_draw_id_fkey" FOREIGN KEY ("raffle_draw_id") REFERENCES "raffle_draws"("id") ON DELETE SET NULL ON UPDATE CASCADE;
