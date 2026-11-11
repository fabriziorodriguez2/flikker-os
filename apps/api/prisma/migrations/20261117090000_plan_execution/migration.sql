-- Ejecución y medición de planes comerciales de Intelligence. Solo aditiva.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntelligencePlanStatus" ADD VALUE 'EXECUTING';
ALTER TYPE "IntelligencePlanStatus" ADD VALUE 'MEASURING';
ALTER TYPE "IntelligencePlanStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "IntelligencePlanStatus" ADD VALUE 'STOPPED';

-- AlterEnum
ALTER TYPE "RetentionObjective" ADD VALUE 'INTELLIGENCE_PLAN';

-- AlterTable
ALTER TABLE "business_policies" ADD COLUMN     "autonomy_planner_execution_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "intelligence_plans" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "executed_at" TIMESTAMP(3),
ADD COLUMN     "measure_until" TIMESTAMP(3),
ADD COLUMN     "results" JSONB,
ADD COLUMN     "stop_reason" TEXT;

-- AlterTable
ALTER TABLE "retention_experiments" ADD COLUMN     "intelligence_plan_id" TEXT;

-- AlterTable
ALTER TABLE "retention_variants" ADD COLUMN     "message_template" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "retention_experiments_intelligence_plan_id_key" ON "retention_experiments"("intelligence_plan_id");

-- AddForeignKey
ALTER TABLE "retention_experiments" ADD CONSTRAINT "retention_experiments_intelligence_plan_id_fkey" FOREIGN KEY ("intelligence_plan_id") REFERENCES "intelligence_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

