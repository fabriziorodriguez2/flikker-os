-- Misiones (Fase 1 de gamificación) — CHECKIN_V2.
--
-- Todo aditivo: dos tablas nuevas, tres enums nuevos y un valor nuevo en
-- `BenefitIssuanceSource`. Nada existente cambia de forma ni de semántica, así
-- que un negocio que no cree ninguna misión no nota absolutamente nada.
--
-- Dos ausencias deliberadas:
--   * `customer_missions` NO tiene columna `progress`. El progreso se deriva
--     contando `visits` dentro de la ventana de la misión. Sin contador no hay
--     nada que una Visit reprocesada pueda incrementar dos veces.
--   * No hay tabla de "premios de misión". El premio es un `benefits` real del
--     dueño y se entrega por `benefit_participations`, como todo lo demás.
--
-- `ADD VALUE` es aditivo y no reescribe filas; corre en la transacción de la
-- migración (Postgres 12+ lo permite mientras el valor nuevo no se USE en la
-- misma transacción — acá no se usa).

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "MissionPeriodPreset" AS ENUM ('THIS_WEEK', 'THIS_MONTH', 'NEXT_N_DAYS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CustomerMissionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "BenefitIssuanceSource" ADD VALUE 'MISSION';

-- CreateTable
CREATE TABLE "missions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_visits" INTEGER NOT NULL,
    "period_preset" "MissionPeriodPreset" NOT NULL DEFAULT 'CUSTOM',
    "period_days" INTEGER,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reward_benefit_id" TEXT,
    "reward_hidden_until_complete" BOOLEAN NOT NULL DEFAULT false,
    "status" "MissionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_missions" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "status" "CustomerMissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "reward_participation_id" TEXT,

    CONSTRAINT "customer_missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "missions_business_id_status_idx" ON "missions"("business_id", "status");

-- CreateIndex
CREATE INDEX "missions_business_id_starts_at_ends_at_idx" ON "missions"("business_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_missions_reward_participation_id_key" ON "customer_missions"("reward_participation_id");

-- CreateIndex
CREATE INDEX "customer_missions_business_id_customer_id_status_idx" ON "customer_missions"("business_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "customer_missions_mission_id_status_idx" ON "customer_missions"("mission_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_missions_mission_id_customer_id_key" ON "customer_missions"("mission_id", "customer_id");

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_reward_benefit_id_fkey" FOREIGN KEY ("reward_benefit_id") REFERENCES "benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_missions" ADD CONSTRAINT "customer_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_missions" ADD CONSTRAINT "customer_missions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_missions" ADD CONSTRAINT "customer_missions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_missions" ADD CONSTRAINT "customer_missions_reward_participation_id_fkey" FOREIGN KEY ("reward_participation_id") REFERENCES "benefit_participations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

