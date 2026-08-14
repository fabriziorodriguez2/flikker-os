-- Snapshot del título del beneficio en el momento en que se otorgó cada
-- participación. Sin esto, renombrar un Benefit reescribía silenciosamente
-- lo que el historial (Programa → Historial, actividad de un cliente,
-- pantalla de canje) dice que un cliente recibió en el pasado.
--
-- Backfill: para las filas que ya existen no hay forma de saber el título
-- exacto que tenía el beneficio en el momento en que se otorgó esa
-- participación — se usa el título VIGENTE como mejor aproximación
-- disponible. Es exactamente el mismo estado que mostraban hasta ahora (una
-- lectura en vivo), así que el backfill no cambia nada que el dueño vea hoy;
-- solo fija el valor para que dejar de leer en vivo, desde ahora, no cambie
-- nada tampoco.
ALTER TABLE "benefit_participations" ADD COLUMN "benefit_title_snapshot" TEXT;

UPDATE "benefit_participations" AS bp
SET "benefit_title_snapshot" = b."title"
FROM "benefits" AS b
WHERE b."id" = bp."benefit_id" AND bp."benefit_title_snapshot" IS NULL;
