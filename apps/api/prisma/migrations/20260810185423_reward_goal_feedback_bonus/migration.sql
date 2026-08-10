-- AlterEnum
ALTER TYPE "CustomerEventType" ADD VALUE 'feedback_submitted';

-- CreateTable
CREATE TABLE "checkin_feedback" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_goal_bonus_stamps" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "reward_goal_id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL DEFAULT 'feedback_completed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_goal_bonus_stamps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkin_feedback_visit_id_key" ON "checkin_feedback"("visit_id");

-- CreateIndex
CREATE INDEX "checkin_feedback_business_id_created_at_idx" ON "checkin_feedback"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "checkin_feedback_customer_id_idx" ON "checkin_feedback"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_goal_bonus_stamps_feedback_id_key" ON "reward_goal_bonus_stamps"("feedback_id");

-- CreateIndex
CREATE INDEX "reward_goal_bonus_stamps_reward_goal_id_idx" ON "reward_goal_bonus_stamps"("reward_goal_id");

-- AddForeignKey
ALTER TABLE "checkin_feedback" ADD CONSTRAINT "checkin_feedback_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_feedback" ADD CONSTRAINT "checkin_feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_feedback" ADD CONSTRAINT "checkin_feedback_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_goal_bonus_stamps" ADD CONSTRAINT "reward_goal_bonus_stamps_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_goal_bonus_stamps" ADD CONSTRAINT "reward_goal_bonus_stamps_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_goal_bonus_stamps" ADD CONSTRAINT "reward_goal_bonus_stamps_reward_goal_id_fkey" FOREIGN KEY ("reward_goal_id") REFERENCES "customer_reward_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_goal_bonus_stamps" ADD CONSTRAINT "reward_goal_bonus_stamps_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "checkin_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
