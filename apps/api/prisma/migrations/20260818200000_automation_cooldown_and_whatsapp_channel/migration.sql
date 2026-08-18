-- 1. email_logs gana un canal real (WhatsApp, no solo email) — el unique
--    pasa a incluir `channel` para que un email y un WhatsApp de la MISMA
--    ocurrencia (mismo kind + dedupeKey) puedan coexistir sin pisarse.
ALTER TABLE "email_logs" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email';

DROP INDEX "email_logs_business_id_kind_dedupe_key_key";
CREATE UNIQUE INDEX "email_logs_business_id_kind_channel_dedupe_key_key" ON "email_logs"("business_id", "kind", "channel", "dedupe_key");

-- 2. Cooldown central: máximo 1 mensaje automático por cliente cada 24h,
--    sin importar cuál automatización lo manda.
CREATE TABLE "customer_automation_contacts" (
    "customer_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "last_kind" TEXT NOT NULL,
    "last_contact_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_automation_contacts_pkey" PRIMARY KEY ("customer_id")
);

CREATE INDEX "customer_automation_contacts_business_id_idx" ON "customer_automation_contacts"("business_id");

ALTER TABLE "customer_automation_contacts" ADD CONSTRAINT "customer_automation_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_automation_contacts" ADD CONSTRAINT "customer_automation_contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
