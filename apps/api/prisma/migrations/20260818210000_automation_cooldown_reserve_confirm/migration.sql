-- La tabla anterior (`customer_automation_contacts`) modelaba un simple
-- "primero que escribe gana", que no alcanza para prioridad determinística
-- (Cumpleaños > Sellos por vencer > Casi llegás > Te extrañamos): un
-- accidente de scheduling podía dejar ganar a la de menor prioridad. Se
-- reemplaza por un protocolo reservar → confirmar (ver
-- AutomationCooldownService). Sin filas todavía (nunca se desplegó) — se
-- recrea entera en vez de ALTER, sin pérdida de datos real.
DROP TABLE "customer_automation_contacts";

CREATE TABLE "customer_automation_contacts" (
    "customer_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_automation_contacts_pkey" PRIMARY KEY ("customer_id")
);

CREATE INDEX "customer_automation_contacts_business_id_idx" ON "customer_automation_contacts"("business_id");

ALTER TABLE "customer_automation_contacts" ADD CONSTRAINT "customer_automation_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_automation_contacts" ADD CONSTRAINT "customer_automation_contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
