-- CreateEnum
CREATE TYPE "BusinessGoalType" AS ENUM ('REVIEWS', 'CONTACTS', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "BusinessGoal" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "BusinessGoalType" NOT NULL,
    "target" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessGoal_business_id_created_at_idx" ON "BusinessGoal"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "BusinessGoal" ADD CONSTRAINT "BusinessGoal_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
