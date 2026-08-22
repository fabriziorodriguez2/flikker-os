-- Idempotencia de los emails automáticos al dueño/manager de negocios
-- CHECKIN_V2 (primera semana, resumen semanal/mensual, primer mes, trial por
-- terminar, hitos). Tabla propia, no una extensión de "email_logs": esa tabla
-- tiene customer_id NOT NULL y estos envíos no tienen ningún Customer
-- asociado (el destinatario es la lista de OWNER/ADMIN del negocio). Ver
-- owner-lifecycle-emails.service.ts.

CREATE TABLE "owner_lifecycle_email_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_lifecycle_email_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "owner_lifecycle_email_logs_business_id_kind_dedupe_key_key" ON "owner_lifecycle_email_logs"("business_id", "kind", "dedupe_key");

CREATE INDEX "owner_lifecycle_email_logs_business_id_created_at_idx" ON "owner_lifecycle_email_logs"("business_id", "created_at");

ALTER TABLE "owner_lifecycle_email_logs" ADD CONSTRAINT "owner_lifecycle_email_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
