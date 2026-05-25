-- CreateEnum
CREATE TYPE "CalendarIntegrationStatus" AS ENUM ('pending_calendars', 'active', 'error', 'revoked');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('pending', 'send_check_queued', 'sent', 'skipped');

-- AlterEnum
ALTER TYPE "ServiceEventCreatedVia" ADD VALUE 'google_calendar';

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "review_request_delay_hours" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GoogleCalendarIntegration" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "CalendarIntegrationStatus" NOT NULL DEFAULT 'pending_calendars',
    "encrypted_refresh_token" TEXT,
    "selected_calendar_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignored_title_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auto_send_enabled" BOOLEAN NOT NULL DEFAULT false,
    "send_delay_hours" INTEGER NOT NULL DEFAULT 2,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'pending',
    "service_event_id" TEXT,
    "skip_reason" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarIntegration_businessId_key" ON "GoogleCalendarIntegration"("businessId");

-- CreateIndex
CREATE INDEX "GoogleCalendarIntegration_status_idx" ON "GoogleCalendarIntegration"("status");

-- CreateIndex
CREATE INDEX "CalendarEvent_businessId_idx" ON "CalendarEvent"("businessId");

-- CreateIndex
CREATE INDEX "CalendarEvent_integrationId_idx" ON "CalendarEvent"("integrationId");

-- CreateIndex
CREATE INDEX "CalendarEvent_businessId_status_idx" ON "CalendarEvent"("businessId", "status");

-- CreateIndex
CREATE INDEX "CalendarEvent_businessId_start_at_idx" ON "CalendarEvent"("businessId", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_integrationId_google_event_id_key" ON "CalendarEvent"("integrationId", "google_event_id");

-- AddForeignKey
ALTER TABLE "GoogleCalendarIntegration" ADD CONSTRAINT "GoogleCalendarIntegration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "GoogleCalendarIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
