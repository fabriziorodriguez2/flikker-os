-- Historial de Programa (/dashboard/programa → tab Historial).
--
-- Bitácora mínima: solo los cambios de configuración que hoy no dejan
-- ninguna fecha real en otro lado (activar/desactivar la tarjeta, cambiar
-- sellos/recompensa, autorizar/revocar reactivación, crear/editar un
-- beneficio). Todo lo demás (beneficio ofrecido/canjeado, tarjeta
-- completada/canjeada) se sigue leyendo de las tablas que ya lo registran.

-- CreateEnum
CREATE TYPE "ProgramAuditEventType" AS ENUM (
    'card_activated',
    'card_deactivated',
    'card_config_changed',
    'benefit_created',
    'benefit_edited',
    'benefit_reactivation_authorized',
    'benefit_reactivation_revoked'
);

-- CreateTable
CREATE TABLE "program_audit_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "ProgramAuditEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_audit_events_business_id_created_at_idx" ON "program_audit_events"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "program_audit_events" ADD CONSTRAINT "program_audit_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_audit_events" ADD CONSTRAINT "program_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
