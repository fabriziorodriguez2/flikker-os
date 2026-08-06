-- CreateEnum
CREATE TYPE "RewardGoalStatus" AS ENUM ('ACTIVE', 'UNLOCKED', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "RetentionStrategyType" ADD VALUE 'PROGRESS_REMINDER';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "flikker_account_id" TEXT;

-- AlterTable
ALTER TABLE "retention_incentive_definitions" ADD COLUMN     "reward_goal_eligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "retention_settings" ADD COLUMN     "max_promised_reward_goals_per_incentive" INTEGER,
ADD COLUMN     "reward_goal_cooldown_days" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "reward_goal_max_visits" INTEGER,
ADD COLUMN     "reward_goal_min_visits" INTEGER,
ADD COLUMN     "reward_goals_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "customer_reward_goals" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "incentive_definition_id" TEXT NOT NULL,
    "status" "RewardGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "starting_visit_count" INTEGER NOT NULL,
    "target_additional_visits" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "unlocked_at" TIMESTAMP(3),
    "redeemed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'reward_goal_engine',
    "reason_code" TEXT NOT NULL,
    "segment_at_creation" "CustomerSegment" NOT NULL,
    "benefit_participation_id" TEXT,

    CONSTRAINT "customer_reward_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flikker_accounts" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flikker_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flikker_account_verifications" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flikker_account_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flikker_account_sessions" (
    "id" TEXT NOT NULL,
    "flikker_account_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flikker_account_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_reward_goals_benefit_participation_id_key" ON "customer_reward_goals"("benefit_participation_id");

-- CreateIndex
CREATE INDEX "customer_reward_goals_business_id_customer_id_idx" ON "customer_reward_goals"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_reward_goals_business_id_status_idx" ON "customer_reward_goals"("business_id", "status");

-- CreateIndex
CREATE INDEX "customer_reward_goals_incentive_definition_id_status_idx" ON "customer_reward_goals"("incentive_definition_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "flikker_accounts_phone_e164_key" ON "flikker_accounts"("phone_e164");

-- CreateIndex
CREATE INDEX "flikker_account_verifications_phone_e164_idx" ON "flikker_account_verifications"("phone_e164");

-- CreateIndex
CREATE INDEX "flikker_account_verifications_expires_at_idx" ON "flikker_account_verifications"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "flikker_account_sessions_token_hash_key" ON "flikker_account_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "flikker_account_sessions_flikker_account_id_idx" ON "flikker_account_sessions"("flikker_account_id");

-- CreateIndex
CREATE INDEX "flikker_account_sessions_expires_at_idx" ON "flikker_account_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "Customer_flikker_account_id_idx" ON "Customer"("flikker_account_id");

-- CreateIndex
CREATE INDEX "retention_incentive_definitions_business_id_active_reward_g_idx" ON "retention_incentive_definitions"("business_id", "active", "reward_goal_eligible");

-- AddForeignKey
ALTER TABLE "customer_reward_goals" ADD CONSTRAINT "customer_reward_goals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_reward_goals" ADD CONSTRAINT "customer_reward_goals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_reward_goals" ADD CONSTRAINT "customer_reward_goals_incentive_definition_id_fkey" FOREIGN KEY ("incentive_definition_id") REFERENCES "retention_incentive_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_reward_goals" ADD CONSTRAINT "customer_reward_goals_benefit_participation_id_fkey" FOREIGN KEY ("benefit_participation_id") REFERENCES "benefit_participations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_flikker_account_id_fkey" FOREIGN KEY ("flikker_account_id") REFERENCES "flikker_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flikker_account_sessions" ADD CONSTRAINT "flikker_account_sessions_flikker_account_id_fkey" FOREIGN KEY ("flikker_account_id") REFERENCES "flikker_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fase E §7: at most one ACTIVE CustomerRewardGoal per (business, customer).
-- Prisma has no "unique where" attribute, so this partial unique index is
-- hand-authored — same technique already used for
-- benefits_one_active_per_business / visit_sources_one_default_per_business.
CREATE UNIQUE INDEX "customer_reward_goals_one_active_per_customer"
  ON "customer_reward_goals" ("business_id", "customer_id")
  WHERE "status" = 'ACTIVE';
