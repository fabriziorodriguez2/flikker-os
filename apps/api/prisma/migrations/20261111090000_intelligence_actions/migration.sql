-- CreateEnum
CREATE TYPE "IntelligenceActionKind" AS ENUM ('CREATE_SEGMENT', 'CREATE_CAMPAIGN_DRAFT', 'UPDATE_CAMPAIGN_DRAFT', 'CREATE_REWARD_DRAFT', 'CREATE_MISSION_DRAFT', 'SCHEDULE_CAMPAIGN', 'PAUSE_CAMPAIGN', 'UPDATE_STAMPS_CARD', 'ACTIVATE_BENEFIT', 'SET_MISSION_STATUS', 'SEND_PROMOTION');

-- CreateEnum
CREATE TYPE "IntelligenceActionMode" AS ENUM ('DRAFT', 'CONFIRM', 'DRY_RUN');

-- CreateEnum
CREATE TYPE "IntelligenceActionStatus" AS ENUM ('PROPOSED', 'EXECUTING', 'EXECUTED', 'CANCELLED', 'EXPIRED', 'FAILED', 'DRY_RUN');

-- CreateTable
CREATE TABLE "intelligence_actions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "kind" "IntelligenceActionKind" NOT NULL,
    "mode" "IntelligenceActionMode" NOT NULL,
    "status" "IntelligenceActionStatus" NOT NULL,
    "params" JSONB NOT NULL,
    "impact" JSONB NOT NULL,
    "data_version" TEXT,
    "plan_hash" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intelligence_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_actions_business_id_created_by_user_id_created_idx" ON "intelligence_actions"("business_id", "created_by_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_actions_business_id_idempotency_key_key" ON "intelligence_actions"("business_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "intelligence_actions" ADD CONSTRAINT "intelligence_actions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_actions" ADD CONSTRAINT "intelligence_actions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_actions" ADD CONSTRAINT "intelligence_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "intelligence_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

