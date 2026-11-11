-- CreateEnum
CREATE TYPE "IntelligenceReportKind" AS ENUM ('PERIOD_SUMMARY', 'PERIOD_COMPARISON', 'CUSTOMER_COHORT', 'MONTHLY');

-- CreateTable
CREATE TABLE "intelligence_reports" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "kind" "IntelligenceReportKind" NOT NULL,
    "title" TEXT NOT NULL,
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_reports_business_id_created_by_user_id_compute_idx" ON "intelligence_reports"("business_id", "created_by_user_id", "computed_at");

-- AddForeignKey
ALTER TABLE "intelligence_reports" ADD CONSTRAINT "intelligence_reports_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_reports" ADD CONSTRAINT "intelligence_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_reports" ADD CONSTRAINT "intelligence_reports_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "intelligence_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

