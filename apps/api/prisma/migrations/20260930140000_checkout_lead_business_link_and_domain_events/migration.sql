-- Parte 5 — "registro primero, pago después": CheckoutLead pasa a poder
-- pertenecer a un Business/User reales (checkout AUTENTICADO), y se agrega
-- una tabla mínima de idempotencia genérica para eventos de negocio
-- (REGISTRATION_COMPLETED, SUBSCRIPTION_PAID).
--
-- Aditiva y segura sobre una tabla real en producción (checkout_leads, con
-- filas del flujo público): dos columnas FK nuevas (nullable — el flujo
-- público viejo las deja en null) y relajar NOT NULL en name/business_name/
-- phone_e164/email (nunca se pierde dato existente al permitir null hacia
-- adelante). `domain_events` es una tabla nueva, vacía.
--
--   checkout_leads.business_id          -> a qué Business pertenece el pago
--                                           (checkout autenticado). Null en
--                                           leads del flujo público.
--   checkout_leads.requested_by_user_id -> qué User, autenticado, disparó
--                                           el checkout. Null en leads del
--                                           flujo público.
--   checkout_leads.name/business_name/
--   checkout_leads.phone_e164            -> ahora NULLABLE: el checkout
--                                           autenticado no los pisa (la
--                                           identidad real ya vive en
--                                           User/Business) — pedirlos de
--                                           nuevo es justo lo que Parte 5
--                                           evita.
--   checkout_leads.email                 -> ahora NULLABLE a nivel de
--                                           columna, pero el checkout
--                                           autenticado SÍ lo completa (con
--                                           `User.email`): sigue siendo el
--                                           `payer_email` real que viaja a
--                                           Mercado Pago. La app valida que
--                                           nunca quede null antes de armar
--                                           un checkout (ver
--                                           `checkout-leads.service.ts`).
--
--   domain_events                        -> reclamo atómico genérico
--                                           (`eventType` + `entityId`
--                                           UNIQUE) para que un side effect
--                                           de negocio (bienvenida,
--                                           notificación de pago) se
--                                           dispare exactamente una vez,
--                                           sin importar cuántas veces se
--                                           repita el trigger (ej. un
--                                           webhook duplicado).

-- AlterTable
ALTER TABLE "checkout_leads" ADD COLUMN     "business_id" TEXT,
ADD COLUMN "requested_by_user_id" TEXT,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "business_name" DROP NOT NULL,
ALTER COLUMN "phone_e164" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_event_type_entity_id_key" ON "domain_events"("event_type", "entity_id");

-- CreateIndex
CREATE INDEX "checkout_leads_business_id_idx" ON "checkout_leads"("business_id");

-- AddForeignKey
ALTER TABLE "checkout_leads" ADD CONSTRAINT "checkout_leads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_leads" ADD CONSTRAINT "checkout_leads_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
