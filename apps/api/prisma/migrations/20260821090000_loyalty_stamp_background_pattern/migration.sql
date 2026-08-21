-- Fondo decorativo detrás del área de sellos — mismo criterio que el resto
-- de los campos loyalty_*: nullable, sin default, null = automático/sin patrón.
ALTER TABLE "Business"
  ADD COLUMN "loyalty_stamp_background_pattern" TEXT,
  ADD COLUMN "loyalty_stamp_background_opacity" INTEGER;
