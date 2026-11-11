-- Intentos de envío por el proveedor de mensajería. Solo aditiva.

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('IN_FLIGHT', 'ACCEPTED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "message_delivery_attempts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "message_id" TEXT,
    "purpose" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sender_session" TEXT NOT NULL,
    "recipient_hash" TEXT NOT NULL,
    "status" "DeliveryAttemptStatus" NOT NULL,
    "provider_message_id" TEXT,
    "error_class" TEXT,
    "http_status" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "message_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_delivery_attempts_business_id_created_at_idx" ON "message_delivery_attempts"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "message_delivery_attempts_sender_session_created_at_idx" ON "message_delivery_attempts"("sender_session", "created_at");

-- CreateIndex
CREATE INDEX "message_delivery_attempts_idempotency_key_idx" ON "message_delivery_attempts"("idempotency_key");

-- AddForeignKey
ALTER TABLE "message_delivery_attempts" ADD CONSTRAINT "message_delivery_attempts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Anti-duplicados: a lo sumo un intento vivo (en curso, aceptado o de
-- resultado desconocido) por envío lógico. Un FAILED libera la clave para
-- reintentar; un UNKNOWN no, porque el mensaje pudo haber salido.
CREATE UNIQUE INDEX "message_delivery_attempts_live_key"
  ON "message_delivery_attempts"("idempotency_key")
  WHERE "status" IN ('IN_FLIGHT', 'ACCEPTED', 'UNKNOWN');
