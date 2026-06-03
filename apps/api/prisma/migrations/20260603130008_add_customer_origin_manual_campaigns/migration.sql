-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "ManualCampaign" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "message_body" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualCampaignContact" (
    "id" TEXT NOT NULL,
    "manual_campaign_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "phone_e164" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualCampaignContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualCampaign_business_id_idx" ON "ManualCampaign"("business_id");

-- CreateIndex
CREATE INDEX "ManualCampaignContact_manual_campaign_id_idx" ON "ManualCampaignContact"("manual_campaign_id");

-- CreateIndex
CREATE INDEX "ManualCampaignContact_business_id_idx" ON "ManualCampaignContact"("business_id");

-- CreateIndex
CREATE INDEX "Customer_businessId_origin_idx" ON "Customer"("businessId", "origin");

-- AddForeignKey
ALTER TABLE "ManualCampaign" ADD CONSTRAINT "ManualCampaign_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualCampaignContact" ADD CONSTRAINT "ManualCampaignContact_manual_campaign_id_fkey" FOREIGN KEY ("manual_campaign_id") REFERENCES "ManualCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualCampaignContact" ADD CONSTRAINT "ManualCampaignContact_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
