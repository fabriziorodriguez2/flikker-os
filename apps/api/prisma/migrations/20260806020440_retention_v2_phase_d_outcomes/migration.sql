-- AlterTable
ALTER TABLE "retention_assignments" ADD COLUMN     "exposed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "retention_outcomes" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "returned" BOOLEAN NOT NULL,
    "return_visit_id" TEXT,
    "returned_at" TIMESTAMP(3),
    "days_to_return" INTEGER,
    "attribution_type" "VisitAttributionType",
    "confirmed_by_redemption" BOOLEAN NOT NULL DEFAULT false,
    "benefit_participation_id" TEXT,
    "observed_within_window" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_outcomes_assignment_id_key" ON "retention_outcomes"("assignment_id");

-- CreateIndex
CREATE INDEX "retention_outcomes_business_id_idx" ON "retention_outcomes"("business_id");

-- CreateIndex
CREATE INDEX "retention_outcomes_experiment_id_variant_id_idx" ON "retention_outcomes"("experiment_id", "variant_id");

-- CreateIndex
CREATE INDEX "retention_outcomes_variant_id_returned_idx" ON "retention_outcomes"("variant_id", "returned");

-- CreateIndex
CREATE INDEX "retention_assignments_status_exposed_at_idx" ON "retention_assignments"("status", "exposed_at");

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "retention_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "retention_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "retention_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_return_visit_id_fkey" FOREIGN KEY ("return_visit_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
