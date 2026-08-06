-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('NEW', 'REPEAT', 'FREQUENT', 'AT_RISK', 'INACTIVE', 'RECOVERED');

-- CreateEnum
CREATE TYPE "RetentionObjective" AS ENUM ('SECOND_VISIT', 'AT_RISK_RECOVERY', 'INACTIVE_RECOVERY');

-- CreateEnum
CREATE TYPE "RetentionStrategyType" AS ENUM ('CONTROL', 'REMINDER', 'SOFT_BENEFIT', 'STRONG_BENEFIT');

-- CreateEnum
CREATE TYPE "RetentionExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "retention_settings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "average_ticket_amount" DECIMAL(12,2),
    "estimated_margin_percent" INTEGER,
    "automatic_campaigns_enabled" BOOLEAN NOT NULL DEFAULT true,
    "minimum_days_between_retention_messages" INTEGER NOT NULL DEFAULT 14,
    "maximum_retention_messages_per_30_days" INTEGER NOT NULL DEFAULT 2,
    "sending_hour_start" INTEGER NOT NULL DEFAULT 10,
    "sending_hour_end" INTEGER NOT NULL DEFAULT 20,
    "allowed_sending_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "control_group_percent" INTEGER NOT NULL DEFAULT 15,
    "minimum_sample_size_for_recommendations" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_incentive_definitions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "percentage_value" INTEGER,
    "fixed_value" DECIMAL(12,2),
    "estimated_cost" DECIMAL(12,2),
    "description" TEXT,
    "conditions" TEXT,
    "expires_in_days" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "automation_eligible" BOOLEAN NOT NULL DEFAULT false,
    "max_redemptions_per_customer" INTEGER,
    "max_total_redemptions" INTEGER,
    "valid_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_incentive_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_experiments" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "RetentionObjective" NOT NULL,
    "segment" "CustomerSegment",
    "status" "RetentionExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "start_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_at" TIMESTAMP(3),
    "attribution_window_days" INTEGER NOT NULL DEFAULT 30,
    "minimum_sample_size" INTEGER NOT NULL DEFAULT 30,
    "control_percent" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_variants" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategyType" "RetentionStrategyType" NOT NULL,
    "incentive_definition_id" TEXT,
    "allocation_percent" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_assignments" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "segment_at_assignment" "CustomerSegment" NOT NULL,
    "visit_count_at_assignment" INTEGER NOT NULL,
    "days_since_last_visit" INTEGER NOT NULL,
    "typical_interval_days" INTEGER,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_settings_business_id_key" ON "retention_settings"("business_id");

-- CreateIndex
CREATE INDEX "retention_incentive_definitions_business_id_idx" ON "retention_incentive_definitions"("business_id");

-- CreateIndex
CREATE INDEX "retention_incentive_definitions_business_id_active_automati_idx" ON "retention_incentive_definitions"("business_id", "active", "automation_eligible");

-- CreateIndex
CREATE INDEX "retention_experiments_business_id_idx" ON "retention_experiments"("business_id");

-- CreateIndex
CREATE INDEX "retention_experiments_business_id_status_idx" ON "retention_experiments"("business_id", "status");

-- CreateIndex
CREATE INDEX "retention_variants_experiment_id_idx" ON "retention_variants"("experiment_id");

-- CreateIndex
CREATE INDEX "retention_variants_business_id_idx" ON "retention_variants"("business_id");

-- CreateIndex
CREATE INDEX "retention_assignments_business_id_idx" ON "retention_assignments"("business_id");

-- CreateIndex
CREATE INDEX "retention_assignments_customer_id_idx" ON "retention_assignments"("customer_id");

-- CreateIndex
CREATE INDEX "retention_assignments_variant_id_idx" ON "retention_assignments"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_assignments_experiment_id_customer_id_key" ON "retention_assignments"("experiment_id", "customer_id");

-- AddForeignKey
ALTER TABLE "retention_settings" ADD CONSTRAINT "retention_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_incentive_definitions" ADD CONSTRAINT "retention_incentive_definitions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_experiments" ADD CONSTRAINT "retention_experiments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_variants" ADD CONSTRAINT "retention_variants_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "retention_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_variants" ADD CONSTRAINT "retention_variants_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_variants" ADD CONSTRAINT "retention_variants_incentive_definition_id_fkey" FOREIGN KEY ("incentive_definition_id") REFERENCES "retention_incentive_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "retention_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "retention_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
