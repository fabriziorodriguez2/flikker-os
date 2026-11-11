-- Planes comerciales del planificador con IA (simulación). Solo aditiva.

-- CreateEnum
CREATE TYPE "IntelligencePlanStatus" AS ENUM ('INVALID', 'DUPLICATE', 'INFEASIBLE', 'NOT_SELECTED', 'SIMULATED');

-- AlterTable
ALTER TABLE "autonomous_runs" ADD COLUMN     "ai_cost_usd" DECIMAL(10,6),
ADD COLUMN     "analysis" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "engine" TEXT NOT NULL DEFAULT 'RULES',
ADD COLUMN     "planner_model" TEXT;

-- AlterTable
ALTER TABLE "business_policies" ADD COLUMN     "autonomy_planner_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "intelligence_plans" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "status" "IntelligencePlanStatus" NOT NULL,
    "rank" INTEGER,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "fingerprint" TEXT,
    "plan" JSONB NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "selection_reason" TEXT,
    "matched" INTEGER,
    "reachable" INTEGER,
    "simulation" JSONB,
    "estimated_cost" DECIMAL(12,2),
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_plans_business_id_created_at_idx" ON "intelligence_plans"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "intelligence_plans_business_id_fingerprint_idx" ON "intelligence_plans"("business_id", "fingerprint");

-- CreateIndex
CREATE INDEX "intelligence_plans_run_id_idx" ON "intelligence_plans"("run_id");

-- AddForeignKey
ALTER TABLE "intelligence_plans" ADD CONSTRAINT "intelligence_plans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_plans" ADD CONSTRAINT "intelligence_plans_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "autonomous_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

