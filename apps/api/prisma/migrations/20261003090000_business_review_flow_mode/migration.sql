-- CreateEnum
CREATE TYPE "ReviewFlowMode" AS ENUM ('PRIVATE_FEEDBACK', 'DIRECT_GOOGLE');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "review_flow_mode" "ReviewFlowMode" NOT NULL DEFAULT 'PRIVATE_FEEDBACK';
