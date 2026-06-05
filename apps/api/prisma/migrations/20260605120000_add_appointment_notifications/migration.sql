CREATE TYPE "AppointmentNotificationStatus" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "AppointmentNotification" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "appointment_date" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AppointmentNotificationStatus" NOT NULL,

    CONSTRAINT "AppointmentNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppointmentNotification_contact_id_idx" ON "AppointmentNotification"("contact_id");
CREATE INDEX "AppointmentNotification_business_id_idx" ON "AppointmentNotification"("business_id");
CREATE INDEX "AppointmentNotification_appointment_date_idx" ON "AppointmentNotification"("appointment_date");

ALTER TABLE "AppointmentNotification" ADD CONSTRAINT "AppointmentNotification_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentNotification" ADD CONSTRAINT "AppointmentNotification_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
