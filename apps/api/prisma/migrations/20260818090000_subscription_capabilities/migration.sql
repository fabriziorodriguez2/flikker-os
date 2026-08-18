-- Capacidades independientes (Programa → Configuración): "Catálogo de
-- beneficios" y "Tarjeta de sellos" ya no son un modo fijo elegido una sola
-- vez en el onboarding. `benefitsEnabled` es la mitad nueva del par —
-- `rewardGoalsEnabled` (sellos) ya existía.
ALTER TABLE "retention_settings" ADD COLUMN "benefits_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Trial de Beneficios (30 días de acceso Pro TEMPORAL) — independiente de
-- Subscription/Plan, porque un negocio puede estar en el plan Free de sellos
-- y tener este trial corriendo al mismo tiempo (una sola Subscription por
-- negocio no puede representar las dos cosas a la vez).
ALTER TABLE "Business" ADD COLUMN "benefits_trial_started_at" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "benefits_trial_ends_at" TIMESTAMP(3);

-- Nuevos tipos de evento para el historial de Programa (ver
-- ProgramAuditEventType en schema.prisma). ALTER TYPE ... ADD VALUE no puede
-- vivir en la misma transacción que un uso de ese valor, pero acá no se usa
-- ninguno — solo se declara.
ALTER TYPE "ProgramAuditEventType" ADD VALUE 'benefits_catalog_activated';
ALTER TYPE "ProgramAuditEventType" ADD VALUE 'benefits_catalog_deactivated';

-- ---------------------------------------------------------------------------
-- Consolidación de planes self-service (auditado antes de tocar: el plan
-- 'pro' de abajo YA es el plan comercial real que usan los negocios Pro
-- existentes — no se crea uno nuevo, se reutiliza).
--
-- Antes de esta tanda había DOS planes self-service (`free-sellos` para
-- "Beneficios + sellos", `benefits-trial` para "solo Beneficios"), tratados
-- como modos excluyentes. Ahora que sellos y Beneficios son capacidades
-- independientes que pueden convivir, un solo plan Free basta: el tope de
-- clientes participantes (`maxCustomers`) solo importa cuando los sellos
-- están realmente prendidos (ver `PlansService#canAddParticipant`), así que
-- aplicarlo también a un negocio "solo Beneficios" no cambia nada para él.
-- El trial de Beneficios se movió a Business (columnas de arriba), así que
-- `benefits-trial` como PLAN separado ya no tiene ningún propósito.
UPDATE "Plan" SET "slug" = 'free', "name" = 'Free — sellos y beneficios'
WHERE "slug" = 'free-sellos';

-- Cualquier negocio que hoy esté en el plan 'benefits-trial' pasa al plan
-- Free (ACTIVE, sin vencimiento) — su Subscription nunca se borra, solo
-- cambia de plan. Esto es no-op en una instalación limpia (no hay filas).
UPDATE "Subscription"
SET "planId" = (SELECT "id" FROM "Plan" WHERE "slug" = 'free'),
    "status" = 'ACTIVE'
WHERE "planId" = (SELECT "id" FROM "Plan" WHERE "slug" = 'benefits-trial');

DELETE FROM "Plan" WHERE "slug" = 'benefits-trial';
