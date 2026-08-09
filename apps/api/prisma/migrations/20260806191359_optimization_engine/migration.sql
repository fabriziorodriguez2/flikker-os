-- CreateEnum
CREATE TYPE "OptimizationMode" AS ENUM ('OFF', 'ASSISTED', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "OptimizationRunStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'ROLLED_BACK', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OptimizationTrigger" AS ENUM ('AUTOMATIC_WORKER', 'MANUAL_PREVIEW', 'MANUAL_APPLY', 'MANUAL_ROLLBACK');

-- AlterTable
ALTER TABLE "retention_settings" ADD COLUMN     "max_allocation_change_per_optimization" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "minimum_control_percent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "minimum_exploration_percent" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "minimum_exposed_per_variant_for_optimization" INTEGER,
ADD COLUMN     "minimum_meaningful_uplift_points" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "optimization_cooldown_hours" INTEGER NOT NULL DEFAULT 72,
ADD COLUMN     "optimization_mode" "OptimizationMode" NOT NULL DEFAULT 'OFF';

-- CreateTable
CREATE TABLE "retention_optimization_runs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "status" "OptimizationRunStatus" NOT NULL,
    "triggered_by" "OptimizationTrigger" NOT NULL,
    "objective_used" TEXT,
    "winner_variant_id" TEXT,
    "reason_code" TEXT NOT NULL,
    "previous_allocations" JSONB NOT NULL,
    "proposed_allocations" JSONB NOT NULL,
    "applied_allocations" JSONB,
    "metrics_snapshot" JSONB NOT NULL,
    "evidence_snapshot" JSONB NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "retention_optimization_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_optimization_runs_experiment_id_created_at_idx" ON "retention_optimization_runs"("experiment_id", "created_at");

-- CreateIndex
CREATE INDEX "retention_optimization_runs_business_id_idx" ON "retention_optimization_runs"("business_id");

-- AddForeignKey
ALTER TABLE "retention_optimization_runs" ADD CONSTRAINT "retention_optimization_runs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_optimization_runs" ADD CONSTRAINT "retention_optimization_runs_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "retention_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

