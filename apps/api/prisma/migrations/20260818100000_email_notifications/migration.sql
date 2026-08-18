-- Notificaciones por email: dos toggles nuevos (Free: sellos por vencer;
-- Pro: cumpleaños) + un log compartido de idempotencia/historial para TODA
-- notificación por email (sellos por vencer, casi llegás, cumpleaños,
-- reactivación, promociones). No es un motor nuevo — la decisión de a quién
-- y cuándo sigue viviendo en reward-goals/Retention V2; esto solo registra
-- "se mandó, una sola vez" y "cómo salió".

ALTER TABLE "retention_settings" ADD COLUMN "stamps_expiry_email_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "retention_settings" ADD COLUMN "birthday_email_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_logs_business_id_kind_dedupe_key_key" ON "email_logs"("business_id", "kind", "dedupe_key");
CREATE INDEX "email_logs_business_id_created_at_idx" ON "email_logs"("business_id", "created_at");

ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
