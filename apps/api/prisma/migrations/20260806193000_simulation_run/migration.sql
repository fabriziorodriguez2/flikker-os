-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SimulationScenario" AS ENUM ('BASELINE_HEALTHY', 'LOW_CHECKIN_COMPLIANCE', 'HIGH_CHECKIN_COMPLIANCE', 'PROMO_SENSITIVE', 'PROGRESS_SENSITIVE', 'HIGH_CHURN', 'LOW_BUDGET', 'AI_PROVIDER_FAILURE', 'MESSAGE_PROVIDER_FAILURE', 'OPTIMIZATION_STRESS');

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'PENDING',
    "scenario" "SimulationScenario" NOT NULL,
    "seed" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "customer_count" INTEGER NOT NULL,
    "with_ai" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB NOT NULL,
    "results" JSONB,
    "summary" JSONB,
    "failure_reason" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "current_virtual_day" INTEGER NOT NULL DEFAULT 0,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulation_runs_status_idx" ON "simulation_runs"("status");

-- CreateIndex
CREATE INDEX "simulation_runs_created_at_idx" ON "simulation_runs"("created_at");

-- AddForeignKey
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

