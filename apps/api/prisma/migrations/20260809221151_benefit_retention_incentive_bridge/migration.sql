-- AlterTable
ALTER TABLE "retention_incentive_definitions" ADD COLUMN     "benefit_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "retention_incentive_definitions_benefit_id_key" ON "retention_incentive_definitions"("benefit_id");

-- AddForeignKey
ALTER TABLE "retention_incentive_definitions" ADD CONSTRAINT "retention_incentive_definitions_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "benefits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

