-- AlterTable
ALTER TABLE "Business" DROP COLUMN "ai_copy_enabled",
DROP COLUMN "ai_insights_enabled";

-- AlterTable
ALTER TABLE "retention_settings" ADD COLUMN     "ai_copy_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_insights_enabled" BOOLEAN NOT NULL DEFAULT false;

