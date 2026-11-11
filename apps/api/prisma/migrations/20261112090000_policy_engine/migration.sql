-- CreateEnum
CREATE TYPE "PolicyPauseReason" AS ENUM ('MANUAL', 'AUTO_SEND_ERRORS', 'AUTO_OPT_OUTS', 'AUTO_COMPLAINTS');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('GRANTED', 'REVOKED', 'SUPPRESSED', 'UNSUPPRESSED');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('CHECKIN_FORM', 'STAFF', 'INBOUND_KEYWORD', 'COMPLAINT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "PolicyReservationStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PolicyEffectSource" AS ENUM ('PROMOTION', 'INTELLIGENCE', 'AUTOPILOT');

-- CreateTable
CREATE TABLE "business_policies" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "messaging_budget_monthly" DECIMAL(12,2),
    "max_unique_recipients_per_week" INTEGER,
    "max_new_campaigns_per_week" INTEGER,
    "max_campaign_share_percent" INTEGER,
    "message_unit_cost" DECIMAL(12,4),
    "message_unit_cost_currency" TEXT,
    "message_unit_cost_set_at" TIMESTAMP(3),
    "accepted_version" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "confirmed_currency" TEXT,
    "confirmed_timezone" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "paused_reason" "PolicyPauseReason",
    "paused_at" TIMESTAMP(3),
    "paused_by_user_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_consent_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "text_version" TEXT,
    "actor_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_reservations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "source" "PolicyEffectSource" NOT NULL,
    "source_ref" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" "PolicyReservationStatus" NOT NULL DEFAULT 'HELD',
    "month_key" TEXT NOT NULL,
    "week_key" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "message_count" INTEGER NOT NULL,
    "messaging_amount" DECIMAL(12,2) NOT NULL,
    "incentive_count" INTEGER NOT NULL,
    "incentive_amount" DECIMAL(12,2) NOT NULL,
    "customer_ids" TEXT[],
    "creates_campaign" BOOLEAN NOT NULL DEFAULT false,
    "result" JSONB,
    "created_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "committed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_policies_business_id_key" ON "business_policies"("business_id");

-- CreateIndex
CREATE INDEX "customer_consent_events_business_id_customer_id_channel_cre_idx" ON "customer_consent_events"("business_id", "customer_id", "channel", "created_at");

-- CreateIndex
CREATE INDEX "customer_consent_events_business_id_action_created_at_idx" ON "customer_consent_events"("business_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "policy_reservations_business_id_status_month_key_idx" ON "policy_reservations"("business_id", "status", "month_key");

-- CreateIndex
CREATE INDEX "policy_reservations_business_id_status_expires_at_idx" ON "policy_reservations"("business_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "policy_reservations_business_id_idempotency_key_key" ON "policy_reservations"("business_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "business_policies" ADD CONSTRAINT "business_policies_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consent_events" ADD CONSTRAINT "customer_consent_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consent_events" ADD CONSTRAINT "customer_consent_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_reservations" ADD CONSTRAINT "policy_reservations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

