-- Throttle del refresh periódico de metadata del Place (rating + cantidad
-- de reseñas que Google informa).
--
-- Columna propia y no `google_reviews_last_sync_at`: ese campo significa
-- "última corrida del scrape inicial/backfill de reseñas", lo escribe solo
-- `runInitial` (nunca la corrida diaria) y se resetea a NULL al reconectar
-- un Place. Reusarlo movería el throttle por corridas que no refrescaron
-- nada. Son dos hechos distintos.
--
-- NULL = nunca se refrescó desde que existe esta columna. Los valores
-- capturados al conectar siguen siendo válidos; el primer barrido diario
-- los actualiza.
ALTER TABLE "Business"
  ADD COLUMN "google_place_refreshed_at" TIMESTAMP(3);
