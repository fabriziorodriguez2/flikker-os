-- CheckoutLead: intención de compra desde la landing pública.
-- Tabla nueva, sin FKs: un lead existe antes que cualquier User o Business.

CREATE TYPE "CheckoutPlan" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TYPE "CheckoutLeadStatus" AS ENUM (
  'PENDING',
  'CHECKOUT_CREATED',
  'PAID',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "checkout_leads" (
  "id"                  TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "business_name"       TEXT NOT NULL,
  "phone_e164"          TEXT NOT NULL,
  "email"               TEXT NOT NULL,
  "plan"                "CheckoutPlan" NOT NULL,
  "status"              "CheckoutLeadStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key"     TEXT,
  "payment_provider"    TEXT,
  "external_reference"  TEXT,
  "checkout_created_at" TIMESTAMP(3),
  "paid_at"             TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "checkout_leads_pkey" PRIMARY KEY ("id")
);

-- Parcial a propósito: la idempotency key es OPCIONAL. Un unique común
-- trataría a todos los leads sin key como duplicados entre sí y solo
-- dejaría existir uno. Prisma no expresa "unique where", así que este
-- índice se escribe a mano y NO está en schema.prisma.
CREATE UNIQUE INDEX "checkout_leads_idempotency_key_unique"
  ON "checkout_leads" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Buscar los intentos de una persona SIN impedirle volver a intentar.
CREATE INDEX "checkout_leads_email_created_at_idx"
  ON "checkout_leads" ("email", "created_at");

CREATE INDEX "checkout_leads_status_created_at_idx"
  ON "checkout_leads" ("status", "created_at");
