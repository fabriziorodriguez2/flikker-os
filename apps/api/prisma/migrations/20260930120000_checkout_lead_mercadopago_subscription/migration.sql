-- CheckoutLead: campos para reconciliar con la subscription (`/preapproval`)
-- de Mercado Pago, en vez de una Order.
--
-- Reemplaza limpiamente a `20260929180000_checkout_lead_mercadopago_order`
-- (borrada): esa migración NUNCA se aplicó en ningún entorno (verificado
-- contra `_prisma_migrations` en producción antes de tocar nada), así que
-- no hace falta una migración de rename/compensación — esta migración se
-- escribe directamente encima de `20260929120000_checkout_leads`, que SÍ
-- está aplicada en producción y no se toca.
--
-- Editada dos veces antes de aplicarse a producción (siempre confirmando
-- primero que seguía sin aplicarse): 1) incidente 2026-09-30, se agregó
-- CHECKOUT_RECONCILIATION_REQUIRED; 2) pivot 2026-09-30 a subscription SIN
-- plan asociado, se sacó `provider_plan_id` (dejó de tener sentido — ver
-- mercado-pago-subscription.provider.ts).
--
-- Aditiva pura sobre una tabla que hoy tiene 0 filas en producción: sin
-- default que pisar, sin backfill, sin downtime.
--
--   provider_subscription_id -> `preapproval.id` de Mercado Pago (la
--                                subscription real, POST /preapproval).
--   provider_status            -> `status` que devolvió MP en la respuesta
--                                (ej. "pending"). Solo informativo.
--   provider_idempotency_key  -> la X-Idempotency-Key que se manda a MP.
--                                Defensa secundaria: a diferencia de la
--                                Orders API, MP no documenta que
--                                `/preapproval` deduplique por esta key.
--   checkout_url               -> el `init_point` que devuelve el POST de
--                                creación.
--   checkout_claimed_at        -> cuándo un request reclamó el derecho
--                                exclusivo de llamar a MP (ver el nuevo
--                                valor de enum CHECKOUT_CREATING). Permite
--                                recuperar un reclamo abandonado por un
--                                proceso que se cayó a mitad de la llamada.
--
-- provider_subscription_id y provider_idempotency_key son UNIQUE cuando
-- tienen valor — un UNIQUE INDEX estándar de Postgres ya trata cada NULL
-- como distinto de cualquier otro, así que no hace falta (ni corresponde)
-- un índice parcial acá.

-- AlterEnum
-- Estado intermedio de "reclamo en vuelo": ver comentario en schema.prisma.
-- CHECKOUT_RECONCILIATION_REQUIRED: agregado tras el incidente 2026-09-30
-- (ver mercado-pago-subscription.provider.ts) — un resultado ambiguo
-- (timeout/5xx) de /preapproval deja al lead acá, nunca reconciliado
-- automáticamente. Solo se puede AGREGAR un valor a un enum ya aplicado
-- (no se puede reordenar ni borrar en la misma migración sin recrear el
-- tipo), así que los dos terminan al final de la lista existente en
-- Postgres aunque en schema.prisma aparezcan entre PENDING y
-- CHECKOUT_CREATED — el orden físico del enum no afecta a ninguna lógica
-- de este repo, que siempre compara por valor, nunca por posición.
ALTER TYPE "CheckoutLeadStatus" ADD VALUE 'CHECKOUT_CREATING';
ALTER TYPE "CheckoutLeadStatus" ADD VALUE 'CHECKOUT_RECONCILIATION_REQUIRED';

-- AlterTable
ALTER TABLE "checkout_leads" ADD COLUMN     "checkout_claimed_at" TIMESTAMP(3),
ADD COLUMN     "checkout_url" TEXT,
ADD COLUMN     "provider_idempotency_key" TEXT,
ADD COLUMN     "provider_status" TEXT,
ADD COLUMN     "provider_subscription_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "checkout_leads_provider_subscription_id_key" ON "checkout_leads"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_leads_provider_idempotency_key_key" ON "checkout_leads"("provider_idempotency_key");
