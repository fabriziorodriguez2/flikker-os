-- CreateEnum
CREATE TYPE "VisitSourceType" AS ENUM ('qr', 'nfc', 'link', 'manual');

-- CreateEnum
CREATE TYPE "VisitVerificationType" AS ENUM ('persistent_session', 'campaign_link', 'benefit_redemption', 'staff_confirmation', 'manual');

-- CreateEnum
CREATE TYPE "VisitAttributionType" AS ENUM ('organic', 'post_campaign_checkin', 'confirmed_redemption', 'unknown');

-- CreateEnum
CREATE TYPE "CustomerEventType" AS ENUM ('customer_registered', 'customer_session_restored', 'visit_created', 'visit_duplicate_prevented', 'benefit_viewed', 'benefit_redeemed', 'review_prompt_shown', 'review_link_clicked');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "checkin_max_visits_per_day" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "checkin_min_hours_between_visits" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "checkin_review_prompt_every_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "visit_sources" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VisitSourceType" NOT NULL DEFAULT 'qr',
    "token" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "last_scanned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "source_id" TEXT,
    "campaign_id" TEXT,
    "message_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visit_day_key" TEXT NOT NULL,
    "verification_type" "VisitVerificationType" NOT NULL,
    "attribution_type" "VisitAttributionType" NOT NULL DEFAULT 'organic',
    "is_return" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_verifications" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'session_recovery',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" "CustomerEventType" NOT NULL,
    "visit_id" TEXT,
    "source_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_sources_token_key" ON "visit_sources"("token");

-- CreateIndex
CREATE INDEX "visit_sources_business_id_idx" ON "visit_sources"("business_id");

-- CreateIndex
CREATE INDEX "visit_sources_business_id_is_active_idx" ON "visit_sources"("business_id", "is_active");

-- CreateIndex
CREATE INDEX "visits_business_id_idx" ON "visits"("business_id");

-- CreateIndex
CREATE INDEX "visits_business_id_occurred_at_idx" ON "visits"("business_id", "occurred_at");

-- CreateIndex
CREATE INDEX "visits_customer_id_idx" ON "visits"("customer_id");

-- CreateIndex
CREATE INDEX "visits_customer_id_occurred_at_idx" ON "visits"("customer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "visits_business_id_customer_id_visit_day_key_idx" ON "visits"("business_id", "customer_id", "visit_day_key");

-- CreateIndex
CREATE INDEX "visits_campaign_id_idx" ON "visits"("campaign_id");

-- CreateIndex
CREATE INDEX "visits_source_id_idx" ON "visits"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_business_id_idx" ON "customer_sessions"("business_id");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_idx" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "customer_verifications_business_id_idx" ON "customer_verifications"("business_id");

-- CreateIndex
CREATE INDEX "customer_verifications_customer_id_idx" ON "customer_verifications"("customer_id");

-- CreateIndex
CREATE INDEX "customer_verifications_expires_at_idx" ON "customer_verifications"("expires_at");

-- CreateIndex
CREATE INDEX "customer_events_business_id_idx" ON "customer_events"("business_id");

-- CreateIndex
CREATE INDEX "customer_events_business_id_created_at_idx" ON "customer_events"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_events_customer_id_idx" ON "customer_events"("customer_id");

-- CreateIndex
CREATE INDEX "customer_events_customer_id_created_at_idx" ON "customer_events"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_events_business_id_type_idx" ON "customer_events"("business_id", "type");

-- AddForeignKey
ALTER TABLE "visit_sources" ADD CONSTRAINT "visit_sources_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "visit_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_verifications" ADD CONSTRAINT "customer_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_verifications" ADD CONSTRAINT "customer_verifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "visit_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce exactly one default VisitSource per business (partial unique index).
-- This makes the idempotent default-source backfill safe under concurrency:
-- a second attempt to create a default for the same business fails cleanly.
CREATE UNIQUE INDEX "visit_sources_one_default_per_business"
  ON "visit_sources" ("business_id")
  WHERE "is_default";
