-- Desafíos de vuelta (Fase 3 de gamificación) — CHECKIN_V2.
--
-- Una tabla nueva, dos enums, y tres cambios sobre `reward_goal_bonus_stamps`
-- para que un sello pueda tener una segunda causa además del feedback.
--
-- Compatibilidad con los datos existentes: al momento de escribir esto la
-- tabla tiene 7 filas, todas con `feedback_id` y por lo tanto con
-- `return_challenge_id` en NULL → `num_nonnulls(...) = 1` → pasan el CHECK
-- sin ningún backfill. `DROP NOT NULL` solo toca el catálogo (instantáneo) y
-- el CHECK valida esas 7 filas de una, sin necesidad de NOT VALID ni de una
-- ventana de mantenimiento.
--
-- El vínculo desafío ↔ sello vive en UNA sola FK (`return_challenge_id`), no
-- en dos punteros espejo: dos fuentes de verdad para la misma relación pueden
-- discrepar. Su UNIQUE es la garantía de que un desafío nunca emite dos
-- sellos, incluso con dos procesos concurrentes.

CREATE TYPE "ReturnChallengeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "ReturnChallengeCancelReason" AS ENUM ('REWARD_GOAL_CLOSED');

-- AlterTable
ALTER TABLE "reward_goal_bonus_stamps" ADD COLUMN     "return_challenge_id" TEXT,
ALTER COLUMN "feedback_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "return_challenges" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "retention_assignment_id" TEXT,
    "reward_goal_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "ReturnChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "completed_at" TIMESTAMP(3),
    "cancel_reason" "ReturnChallengeCancelReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_challenges_retention_assignment_id_key" ON "return_challenges"("retention_assignment_id");

-- CreateIndex
CREATE INDEX "return_challenges_status_expires_at_idx" ON "return_challenges"("status", "expires_at");

-- CreateIndex
CREATE INDEX "return_challenges_business_id_customer_id_idx" ON "return_challenges"("business_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_goal_bonus_stamps_return_challenge_id_key" ON "reward_goal_bonus_stamps"("return_challenge_id");

-- AddForeignKey
ALTER TABLE "reward_goal_bonus_stamps" ADD CONSTRAINT "reward_goal_bonus_stamps_return_challenge_id_fkey" FOREIGN KEY ("return_challenge_id") REFERENCES "return_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_challenges" ADD CONSTRAINT "return_challenges_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_challenges" ADD CONSTRAINT "return_challenges_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_challenges" ADD CONSTRAINT "return_challenges_reward_goal_id_fkey" FOREIGN KEY ("reward_goal_id") REFERENCES "customer_reward_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_challenges" ADD CONSTRAINT "return_challenges_retention_assignment_id_fkey" FOREIGN KEY ("retention_assignment_id") REFERENCES "retention_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Escrito a mano: Prisma no modela ni índices únicos parciales ni CHECKs.
-- ---------------------------------------------------------------------------

-- Un solo desafío VIVO por cliente y negocio. Backstop de base de datos para
-- la misma regla que `ensureReturnChallenge` aplica en código — mismo patrón
-- que `customer_reward_goals_one_active_per_customer`. Los estados terminales
-- (COMPLETED/EXPIRED/CANCELLED) quedan fuera del índice, así que un cliente
-- puede acumular todo el historial que quiera sin bloquear uno nuevo.
CREATE UNIQUE INDEX "return_challenges_one_active_per_customer"
  ON "return_challenges" ("business_id", "customer_id")
  WHERE "status" = 'ACTIVE';

-- Exactamente UNA causa por sello: nunca cero (un sello sin motivo no se
-- puede auditar) y nunca dos (no se puede saber cuál lo originó).
ALTER TABLE "reward_goal_bonus_stamps"
  ADD CONSTRAINT "bonus_stamp_one_cause"
  CHECK (num_nonnulls("feedback_id", "return_challenge_id") = 1);
