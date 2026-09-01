-- Recordatorio de feedback (Check-in V2): atarlo a su visita y poder saltearlo.
--
-- 1) `skipped`: estado para un envío que se descartó a propósito porque dejó
--    de tener sentido antes de salir. No es `sent` ni `failed`, así que no
--    debe contarse en ninguna de las dos columnas de métricas.
--
--    `ALTER TYPE ... ADD VALUE` es aditivo y no reescribe filas. Corre dentro
--    de la transacción de la migración (Postgres 12+ lo permite mientras el
--    valor nuevo no se USE en la misma transacción — acá no se usa).
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'skipped';

-- 2) `originating_visit_id`: la Visit que originó el mensaje.
--    Nullable y sin backfill: todos los mensajes anteriores a esta columna
--    quedan en NULL, y el worker los trata como "sin visita conocida" (no
--    puede verificar feedback por visita, así que no saltea por ese motivo).
--    `ON DELETE SET NULL` para que borrar una visita nunca borre historial de
--    mensajes.
ALTER TABLE "Message" ADD COLUMN "originating_visit_id" TEXT;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_originating_visit_id_fkey"
  FOREIGN KEY ("originating_visit_id") REFERENCES "visits"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Message_originating_visit_id_idx" ON "Message"("originating_visit_id");
