-- AlterTable
ALTER TABLE "retention_settings" ADD COLUMN     "dry_run_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_automated_incentives_per_month" INTEGER,
ADD COLUMN     "max_estimated_incentive_cost_per_month" DECIMAL(12,2);
