-- CreateEnum
CREATE TYPE "IntelligenceConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IntelligenceTitleSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "IntelligenceMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "IntelligenceMessageKind" AS ENUM ('TEXT', 'TOOL_RESULT', 'ACTION');

-- CreateTable
CREATE TABLE "intelligence_conversations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_source" "IntelligenceTitleSource" NOT NULL DEFAULT 'AUTO',
    "status" "IntelligenceConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intelligence_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "role" "IntelligenceMessageRole" NOT NULL,
    "kind" "IntelligenceMessageKind" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_conversations_business_id_created_by_user_id_l_idx" ON "intelligence_conversations"("business_id", "created_by_user_id", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_conversations_id_business_id_key" ON "intelligence_conversations"("id", "business_id");

-- CreateIndex
CREATE INDEX "intelligence_messages_conversation_id_created_at_idx" ON "intelligence_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "intelligence_conversations" ADD CONSTRAINT "intelligence_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_conversations" ADD CONSTRAINT "intelligence_conversations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_messages" ADD CONSTRAINT "intelligence_messages_conversation_id_business_id_fkey" FOREIGN KEY ("conversation_id", "business_id") REFERENCES "intelligence_conversations"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

