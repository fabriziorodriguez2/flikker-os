-- CreateEnum
CREATE TYPE "AiCopySource" AS ENUM ('AI', 'DETERMINISTIC_FALLBACK', 'DETERMINISTIC_DISABLED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "ai_copy_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_insights_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "ai_usage_event_id" TEXT,
ADD COLUMN     "copy_source" "AiCopySource";

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "use_case" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "fallback_used" BOOLEAN NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_events_business_id_use_case_created_at_idx" ON "ai_usage_events"("business_id", "use_case", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_business_id_created_at_idx" ON "ai_usage_events"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Message_ai_usage_event_id_key" ON "Message"("ai_usage_event_id");

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_ai_usage_event_id_fkey" FOREIGN KEY ("ai_usage_event_id") REFERENCES "ai_usage_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

