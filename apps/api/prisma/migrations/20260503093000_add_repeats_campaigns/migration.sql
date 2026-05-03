CREATE TYPE "CampaignTemplateKind" AS ENUM ('post_service', 'reactivation', 'birthday');

CREATE TYPE "CampaignExecutionStatus" AS ENUM ('queued', 'sent', 'failed', 'responded');

ALTER TABLE "Campaign"
ADD COLUMN "template_kind" "CampaignTemplateKind",
ADD COLUMN "trigger_offset_days" INTEGER,
ADD COLUMN "message_body" TEXT,
ADD COLUMN "offer_text" TEXT;

CREATE TABLE "CampaignExecution" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "messageId" TEXT,
    "status" "CampaignExecutionStatus" NOT NULL DEFAULT 'queued',
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "responseText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignExecution_businessId_idx" ON "CampaignExecution"("businessId");
CREATE INDEX "CampaignExecution_campaignId_idx" ON "CampaignExecution"("campaignId");
CREATE INDEX "CampaignExecution_customerId_idx" ON "CampaignExecution"("customerId");
CREATE INDEX "CampaignExecution_messageId_idx" ON "CampaignExecution"("messageId");
CREATE INDEX "CampaignExecution_campaignId_customerId_executedAt_idx" ON "CampaignExecution"("campaignId", "customerId", "executedAt");

ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
