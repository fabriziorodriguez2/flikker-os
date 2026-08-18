-- Google Places API (New) — datos de solo lectura del Place conectado desde
-- Reseñas → Conectar Google. Aditivo únicamente; googlePlaceId y
-- googleBusinessProfileUrl/defaultReviewRedirectUrl ya existían y no se
-- duplican acá.
ALTER TABLE "Business" ADD COLUMN "google_place_display_name" TEXT;
ALTER TABLE "Business" ADD COLUMN "google_place_formatted_address" TEXT;
ALTER TABLE "Business" ADD COLUMN "google_place_rating" DOUBLE PRECISION;
ALTER TABLE "Business" ADD COLUMN "google_place_user_rating_count" INTEGER;
ALTER TABLE "Business" ADD COLUMN "google_place_reviews_uri" TEXT;
