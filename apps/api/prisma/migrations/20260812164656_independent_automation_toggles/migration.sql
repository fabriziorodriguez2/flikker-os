-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "welcome_gift_decided" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "retention_settings" ADD COLUMN     "progress_reminder_enabled" BOOLEAN NOT NULL DEFAULT false;
