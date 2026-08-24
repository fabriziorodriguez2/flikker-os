-- Estado de la importación histórica completa de reseñas de Google.
-- Dos fechas en vez de un enum: "está corriendo" y "cuándo terminó" se
-- derivan de ellas, sin un estado nuevo que mantener en sincronía con el
-- worker. Ambas nullable: los negocios existentes quedan en "idle", nunca
-- en un "listo" que no corrió.
ALTER TABLE "Business"
  ADD COLUMN "google_reviews_backfill_started_at" TIMESTAMP(3),
  ADD COLUMN "google_reviews_backfill_completed_at" TIMESTAMP(3);
