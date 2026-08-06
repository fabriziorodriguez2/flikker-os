/*
  Warnings:

  - Added the required column `updated_at` to the `customer_reward_goals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customer_reward_goals" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
