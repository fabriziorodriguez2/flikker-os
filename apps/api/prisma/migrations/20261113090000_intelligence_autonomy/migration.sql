-- CreateEnum
CREATE TYPE "AutonomyMode" AS ENUM ('OFF', 'DRY_RUN', 'PILOT');

-- CreateEnum
CREATE TYPE "AutonomousRunStatus" AS ENUM ('RUNNING', 'SIMULATED', 'EXECUTED', 'BLOCKED', 'NO_ACTION', 'FAILED');

-- AlterTable
ALTER TABLE "business_policies" ADD COLUMN     "autonomy_mode" "AutonomyMode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "autonomy_mode_set_at" TIMESTAMP(3),
ADD COLUMN     "autonomy_mode_set_by_user_id" TEXT,
ADD COLUMN     "autonomy_pilot_group_size" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "retention_assignments" ADD COLUMN     "autonomous_run_id" TEXT;

-- CreateTable
CREATE TABLE "autonomous_runs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "mode" "AutonomyMode" NOT NULL,
    "status" "AutonomousRunStatus" NOT NULL DEFAULT 'RUNNING',
    "strategy" TEXT,
    "objective" "RetentionObjective",
    "incentive_level" INTEGER,
    "opportunities" JSONB NOT NULL DEFAULT '[]',
    "discarded" JSONB NOT NULL DEFAULT '[]',
    "blockers" JSONB NOT NULL DEFAULT '[]',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "explanation" TEXT NOT NULL DEFAULT '',
    "suggestions" JSONB NOT NULL DEFAULT '[]',
    "planned_customer_ids" TEXT[],
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(12,2),
    "currency" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autonomous_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "autonomous_runs_business_id_created_at_idx" ON "autonomous_runs"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "autonomous_runs_business_id_run_key_key" ON "autonomous_runs"("business_id", "run_key");

-- CreateIndex
CREATE INDEX "retention_assignments_autonomous_run_id_idx" ON "retention_assignments"("autonomous_run_id");

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_autonomous_run_id_fkey" FOREIGN KEY ("autonomous_run_id") REFERENCES "autonomous_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autonomous_runs" ADD CONSTRAINT "autonomous_runs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

