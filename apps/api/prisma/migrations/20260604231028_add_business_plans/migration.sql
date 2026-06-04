-- CreateEnum
CREATE TYPE "BusinessPlanType" AS ENUM ('FREE_TRIAL', 'BASE', 'PRO');

-- CreateTable
CREATE TABLE "BusinessPlan" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "plan" "BusinessPlanType" NOT NULL,
    "trial_goal" INTEGER,
    "trial_start" TIMESTAMP(3),
    "start_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "BusinessPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessPlan_business_id_created_at_idx" ON "BusinessPlan"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "BusinessPlan" ADD CONSTRAINT "BusinessPlan_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPlan" ADD CONSTRAINT "BusinessPlan_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
