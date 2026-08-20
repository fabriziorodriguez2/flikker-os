-- "Reseñas con Flikker" nunca debe contar una reseña cuya fecha real de
-- publicación no se pudo determinar (pedido explícito: nunca usar
-- `detectedAt` como sustituto). Hasta ahora `GoogleReviewsProvider` inventaba
-- "ahora" cuando Scrape.do no traía una fecha relativa parseable, así que
-- una reseña vieja importada hoy podía contar como recién publicada. `NULL`
-- reemplaza esa fecha inventada: la reseña se sigue guardando (cuenta para
-- "Reseñas totales en Google"), pero queda afuera de cualquier corte por
-- fecha hasta que se pueda determinar la real.
ALTER TABLE "GoogleReview" ALTER COLUMN "posted_at" DROP NOT NULL;
