-- Precio Pro self-service correcto (UYU 1.000/mes) sin pisar el plan 'pro'
-- existente (USD 129/mes, usado hoy por negocios reales vía Platform Admin).
-- `currency`/`priceAmount` son genéricos: default "USD" preserva el
-- significado de starter/pro tal cual estaba (backfill = priceUsd).
ALTER TABLE "Plan" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Plan" ADD COLUMN "priceAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan" SET "priceAmount" = "priceUsd" WHERE "priceAmount" = 0;
