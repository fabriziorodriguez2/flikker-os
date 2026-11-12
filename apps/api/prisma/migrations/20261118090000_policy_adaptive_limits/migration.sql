-- Política v2: el tope semanal pasa a ser un % de la base contactable.
-- La columna vieja (max_unique_recipients_per_week) queda sin uso; se borra
-- en una migración posterior. Nadie hereda un % sin verlo: la política v2
-- obliga a volver a aceptarla.
ALTER TABLE "business_policies" ADD COLUMN "weekly_reach_percent" INTEGER;

-- Frecuencia por cliente: nuevos defaults (máximo, no objetivo). Solo afecta
-- filas nuevas; las existentes conservan lo que tienen.
ALTER TABLE "retention_settings"
  ALTER COLUMN "minimum_days_between_retention_messages" SET DEFAULT 10,
  ALTER COLUMN "maximum_retention_messages_per_30_days" SET DEFAULT 3;
