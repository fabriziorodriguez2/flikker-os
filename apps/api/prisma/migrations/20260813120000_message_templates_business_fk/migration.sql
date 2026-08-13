-- Reconciliación incremental del drift de message_templates.
--
-- NO EJECUTADA TODAVÍA. Se prepara como parte del hardening pre-deploy y
-- queda en el árbol de migraciones para que `migrate deploy` la aplique en su
-- momento — no se corre manualmente contra producción desde acá.
--
-- Qué pasó (investigado leyendo `_prisma_migrations` en producción,
-- read-only): la migración `20260713120000_add_message_template` falló dos
-- veces en producción por un bug de nombre de tabla ya corregido en el
-- archivo local (la versión vieja decía "businesses", la tabla real es
-- "Business"). Entre el segundo intento fallido y el tercero, alguien creó
-- `message_templates` a mano (CREATE TABLE + índice) y corrió
-- `prisma migrate resolve --applied` para desatascar el historial — sin
-- volver a ejecutar el `ALTER TABLE ... ADD CONSTRAINT` final. Resultado: la
-- tabla y su índice existen tal cual el archivo local los describe, pero la
-- foreign key nunca se creó.
--
-- Confirmado con las tres queries que motivan este archivo:
--   1. La tabla y `message_templates_business_id_idx` existen en producción.
--   2. `pg_constraint` para "message_templates" solo tiene la PK — cero FKs.
--   3. La tabla tiene 0 filas — un ALTER TABLE ADD CONSTRAINT acá no puede
--      fallar por datos huérfanos, porque no hay ningún dato.
--
-- Por eso la reparación es exactamente el paso que faltó, y nada más: no se
-- toca la tabla, no se re-crea el índice, no se usa `migrate resolve` de
-- nuevo. Es una migración nueva y aditiva que Prisma aplicará normalmente
-- porque nunca fue registrada en el historial.
ALTER TABLE "message_templates"
  ADD CONSTRAINT "message_templates_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
