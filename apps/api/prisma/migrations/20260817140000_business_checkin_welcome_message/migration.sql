-- Programa → Página de inscripción: encabezado propio y editable para la
-- landing pública de check-in. Aditivo únicamente, nullable, sin default:
-- null conserva el comportamiento actual (usar el título del beneficio
-- activo como encabezado).
ALTER TABLE "Business" ADD COLUMN "checkin_welcome_message" TEXT;
