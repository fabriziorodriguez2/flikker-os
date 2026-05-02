-- CreateEnum
CREATE TYPE "ServiceEventCreatedVia" AS ENUM ('manual_panel', 'whatsapp_bot', 'csv_batch', 'api');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('whatsapp');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "WidgetMode" AS ENUM ('toast', 'carousel', 'grid');

-- CreateEnum
CREATE TYPE "WidgetPosition" AS ENUM ('bottom_left', 'bottom_right');

-- CreateEnum
CREATE TYPE "WidgetEventType" AS ENUM ('impression', 'click', 'close');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "google_place_id" TEXT,
ADD COLUMN     "message_count_current_month" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "message_quota_monthly" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "vertical" TEXT,
ADD COLUMN     "whatsapp_phone_id" TEXT;

-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_reviews_shown" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "min_stars" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "mode" "WidgetMode" NOT NULL DEFAULT 'toast',
ADD COLUMN     "position" "WidgetPosition" NOT NULL DEFAULT 'bottom_right',
ADD COLUMN     "primary_color" TEXT,
ADD COLUMN     "rotation_seconds" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "birthday" TIMESTAMP(3),
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdVia" "ServiceEventCreatedVia" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "serviceEventId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "trackingToken" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "whatsapp_msg_id" TEXT,
    "cost_usd" DECIMAL(65,30),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackResponse" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "redirectedToGoogle" BOOLEAN NOT NULL,
    "acknowledgedByOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "eventType" "WidgetEventType" NOT NULL,
    "googleReviewId" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WidgetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- CreateIndex
CREATE INDEX "Customer_businessId_phone_e164_idx" ON "Customer"("businessId", "phone_e164");

-- CreateIndex
CREATE INDEX "ServiceEvent_businessId_idx" ON "ServiceEvent"("businessId");

-- CreateIndex
CREATE INDEX "ServiceEvent_customerId_idx" ON "ServiceEvent"("customerId");

-- CreateIndex
CREATE INDEX "ServiceEvent_businessId_createdAt_idx" ON "ServiceEvent"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_trackingToken_key" ON "Message"("trackingToken");

-- CreateIndex
CREATE INDEX "Message_businessId_idx" ON "Message"("businessId");

-- CreateIndex
CREATE INDEX "Message_customerId_idx" ON "Message"("customerId");

-- CreateIndex
CREATE INDEX "Message_campaignId_idx" ON "Message"("campaignId");

-- CreateIndex
CREATE INDEX "Message_serviceEventId_idx" ON "Message"("serviceEventId");

-- CreateIndex
CREATE INDEX "Message_businessId_createdAt_idx" ON "Message"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackResponse_businessId_idx" ON "FeedbackResponse"("businessId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_messageId_idx" ON "FeedbackResponse"("messageId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_customerId_idx" ON "FeedbackResponse"("customerId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_businessId_createdAt_idx" ON "FeedbackResponse"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "WidgetEvent_businessId_idx" ON "WidgetEvent"("businessId");

-- CreateIndex
CREATE INDEX "WidgetEvent_businessId_createdAt_idx" ON "WidgetEvent"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_serviceEventId_fkey" FOREIGN KEY ("serviceEventId") REFERENCES "ServiceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WidgetEvent" ADD CONSTRAINT "WidgetEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
