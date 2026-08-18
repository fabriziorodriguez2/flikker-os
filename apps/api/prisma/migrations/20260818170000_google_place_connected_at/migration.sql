-- Ancla real de "reseñas desde que usás Flikker": cuándo se conectó el
-- Place actual. Nullable porque los negocios ya conectados antes de esta
-- migración no tienen ese dato — se muestra como desconocido, no como 0.
ALTER TABLE "Business" ADD COLUMN "google_place_connected_at" TIMESTAMP(3);
