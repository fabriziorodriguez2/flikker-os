
-- CreateEnum
CREATE TYPE "RetentionAssignmentStatus" AS ENUM ('PENDING', 'OBSERVING', 'SENT', 'SKIPPED');

-- AlterTable
ALTER TABLE "benefit_participations" ADD COLUMN     "expires_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "retention_assignments" ADD COLUMN     "benefit_participation_id" TEXT,
ADD COLUMN     "message_id" TEXT,
ADD COLUMN     "sent_at" TIMESTAMP(3),
ADD COLUMN     "skip_reason" TEXT,
ADD COLUMN     "status" "RetentionAssignmentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "retention_variants" ADD COLUMN     "issued_benefit_id" TEXT;

-- CreateTable
CREATE TABLE "retention_decision_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "assignment_id" TEXT,
    "decision_code" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_decision_logs_business_id_created_at_idx" ON "retention_decision_logs"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "retention_decision_logs_assignment_id_idx" ON "retention_decision_logs"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_assignments_message_id_key" ON "retention_assignments"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_assignments_benefit_participation_id_key" ON "retention_assignments"("benefit_participation_id");

-- CreateIndex
CREATE INDEX "retention_assignments_business_id_status_idx" ON "retention_assignments"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retention_variants_issued_benefit_id_key" ON "retention_variants"("issued_benefit_id");

-- AddForeignKey
ALTER TABLE "retention_variants" ADD CONSTRAINT "retention_variants_issued_benefit_id_fkey" FOREIGN KEY ("issued_benefit_id") REFERENCES "benefits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_benefit_participation_id_fkey" FOREIGN KEY ("benefit_participation_id") REFERENCES "benefit_participations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_decision_logs" ADD CONSTRAINT "retention_decision_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_decision_logs" ADD CONSTRAINT "retention_decision_logs_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "retention_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

