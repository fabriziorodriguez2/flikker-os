-- ============================================================================
-- Diagnóstico del comercio piloto (~105 clientes): ¿por qué Autopilot no
-- generó resultados observables?
--
-- SOLO LECTURA. No ejecutar sin autorización explícita del dueño de Flikker.
--
-- Cómo correrlo (psql), una vez autorizado:
--   psql "$DATABASE_URL_READONLY" -v business_id="'<uuid>'" -f docs/pilot-diagnosis-queries.sql
--   (primero correr solo la consulta 0 para identificar el negocio)
--
-- Garantías de este archivo:
--   * Todo corre dentro de una transacción READ ONLY que termina en ROLLBACK:
--     Postgres rechaza cualquier escritura.
--   * Ninguna consulta devuelve nombres, teléfonos, emails, cumpleaños ni ids
--     de clientes. Solo conteos, fechas, estados y configuración del negocio.
--   * Los textos de error del proveedor se recortan y se les reemplaza
--     cualquier secuencia de 7+ dígitos por [num], por si contienen teléfonos.
--   * Solo usa tablas que YA existen en producción. Las tablas nuevas de
--     Intelligence (business_policies, customer_consent_events,
--     autonomous_runs, ...) todavía no se migraron allá.
--   * Lo que no se puede ver con SQL (Redis, cron, logs de Railway) está en la
--     sección final.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- ----------------------------------------------------------------------------
-- 0. Identificar el negocio (correr primero y elegir el business_id).
--    Tablas: "Business", "Customer". Datos: nombre del comercio y conteos.
-- ----------------------------------------------------------------------------
SELECT b.id,
       b.name,
       b.status,
       b."isActive"                     AS is_active,
       b.experience_version,
       b.retention_engine_v2_enabled,
       b.timezone,
       count(c.id)                      AS customers
FROM "Business" b
JOIN "Customer" c ON c."businessId" = b.id
GROUP BY b.id
HAVING count(c.id) BETWEEN 90 AND 130
ORDER BY customers DESC;

-- ----------------------------------------------------------------------------
-- 1. Configuración de Autopilot y del canal.
--    Tablas: "Business", retention_settings. Sin datos de clientes.
--    Responde: ¿está prendido el motor? ¿en simulación? ¿qué horario y días?
--    ¿agotó la cuota de mensajes del mes?
-- ----------------------------------------------------------------------------
SELECT b.experience_version,
       b.retention_engine_v2_enabled,
       b.timezone,
       b.message_quota_monthly,
       b.message_count_current_month,
       rs.automatic_campaigns_enabled,
       rs.dry_run_enabled,
       rs.sending_hour_start,
       rs.sending_hour_end,
       rs.allowed_sending_days,
       rs.minimum_days_between_retention_messages,
       rs.maximum_retention_messages_per_30_days,
       rs.control_group_percent,
       rs.reward_goals_enabled,
       rs.progress_reminder_enabled,
       rs.benefits_enabled,
       rs.ai_copy_enabled,
       rs.ai_insights_enabled,
       rs.max_automated_incentives_per_month,
       rs.max_estimated_incentive_cost_per_month,
       rs.updated_at                    AS settings_updated_at
FROM "Business" b
LEFT JOIN retention_settings rs ON rs.business_id = b.id
WHERE b.id = :business_id;

-- ----------------------------------------------------------------------------
-- 2. Base de clientes: cuántos son contactables.
--    Tabla: "Customer". Solo conteos (no se lee el teléfono, solo si existe).
-- ----------------------------------------------------------------------------
SELECT count(*)                                                     AS total,
       count(*) FILTER (WHERE "isActive")                           AS active,
       count(*) FILTER (WHERE "isActive" AND opted_out)             AS active_opted_out,
       count(*) FILTER (WHERE "isActive" AND NOT opted_out
                          AND coalesce(trim(phone_e164), '') <> '') AS active_contactable,
       min("createdAt")::date                                       AS first_customer,
       max("createdAt")::date                                       AS last_customer
FROM "Customer"
WHERE "businessId" = :business_id;

-- ----------------------------------------------------------------------------
-- 3. Actividad: visitas por mes y distribución de clientes por cantidad de
--    visitas y por días desde la última. Tabla: visits. Solo agregados.
--    Responde: ¿hay clientes en las situaciones que Autopilot busca
--    (una sola visita, demorados, inactivos)?
-- ----------------------------------------------------------------------------
SELECT date_trunc('month', occurred_at)::date AS month,
       count(*)                               AS visits,
       count(DISTINCT customer_id)            AS customers,
       count(*) FILTER (WHERE is_return)      AS return_visits,
       count(*) FILTER (WHERE attribution_type <> 'organic') AS attributed_visits
FROM visits
WHERE business_id = :business_id
  AND occurred_at >= now() - interval '12 months'
GROUP BY 1
ORDER BY 1;

WITH per_customer AS (
  SELECT customer_id,
         count(*)                                    AS visit_count,
         extract(day FROM now() - max(occurred_at))  AS days_since_last
  FROM visits
  WHERE business_id = :business_id
  GROUP BY customer_id
)
SELECT CASE WHEN visit_count = 1 THEN '1 visita'
            WHEN visit_count = 2 THEN '2 visitas'
            WHEN visit_count <= 5 THEN '3-5 visitas'
            ELSE '6+ visitas' END                         AS visits_bucket,
       count(*)                                           AS customers,
       count(*) FILTER (WHERE days_since_last <= 14)      AS last_0_14d,
       count(*) FILTER (WHERE days_since_last BETWEEN 15 AND 30) AS last_15_30d,
       count(*) FILTER (WHERE days_since_last BETWEEN 31 AND 60) AS last_31_60d,
       count(*) FILTER (WHERE days_since_last > 60)       AS last_60d_plus
FROM per_customer
GROUP BY 1
ORDER BY 1;

-- ----------------------------------------------------------------------------
-- 4. Experimentos y variantes de Autopilot.
--    Tablas: retention_experiments, retention_variants. Sin datos de clientes.
--    Responde: ¿existen experimentos RUNNING para "Te extrañamos" / "Cerca
--    del premio"? ¿la asignación de variantes es válida?
-- ----------------------------------------------------------------------------
SELECT e.id,
       e.name,
       e.objective,
       e.segment,
       e.status,
       e.start_at::date,
       e.end_at::date,
       e.control_percent,
       e.managed_by_self_service,
       json_agg(json_build_object(
         'strategy', v."strategyType",
         'allocation', v.allocation_percent,
         'active', v.active,
         'has_incentive', v.incentive_definition_id IS NOT NULL)
         ORDER BY v."strategyType")                     AS variants
FROM retention_experiments e
LEFT JOIN retention_variants v ON v.experiment_id = e.id
WHERE e.business_id = :business_id
GROUP BY e.id
ORDER BY e.created_at;

-- ----------------------------------------------------------------------------
-- 5. Asignaciones: ¿reclutó a alguien? ¿quedaron trabadas?
--    Tabla: retention_assignments. Solo conteos por estado y motivo.
--    "pending_older_than_1d" > 0 apunta al bug de la ventana horaria
--    (asignaciones procesadas fuera de horario que nunca salían).
-- ----------------------------------------------------------------------------
SELECT e.objective,
       a.status,
       coalesce(a.skip_reason, '-')                              AS skip_reason,
       count(*)                                                  AS assignments,
       count(*) FILTER (WHERE a.status = 'PENDING'
                          AND a.assigned_at < now() - interval '1 day') AS pending_older_than_1d,
       min(a.assigned_at)::date                                  AS first_assigned,
       max(a.assigned_at)::date                                  AS last_assigned
FROM retention_assignments a
JOIN retention_experiments e ON e.id = a.experiment_id
WHERE a.business_id = :business_id
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- ----------------------------------------------------------------------------
-- 6. Registro de decisiones: qué decidió Autopilot y por qué no actuó.
--    Tabla: retention_decision_logs. Conteos por código y por motivo.
--    El texto de error se recorta y se le tapan los números largos.
-- ----------------------------------------------------------------------------
SELECT decision_code,
       coalesce(metadata ->> 'reasonCode', metadata ->> 'reason', '-') AS reason,
       count(*)                                                        AS times,
       min(created_at)::date                                           AS first_seen,
       max(created_at)::date                                           AS last_seen
FROM retention_decision_logs
WHERE business_id = :business_id
  AND created_at >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY times DESC;

-- 6b. ¿Corre el job todos los días? Una fila por día con actividad.
SELECT created_at::date                                    AS day,
       count(*)                                            AS decisions,
       count(*) FILTER (WHERE decision_code = 'ELIGIBLE')  AS eligible,
       count(*) FILTER (WHERE decision_code = 'ASSIGNED')  AS assigned,
       count(*) FILTER (WHERE decision_code LIKE 'SKIPPED%') AS skipped,
       count(*) FILTER (WHERE decision_code = 'MESSAGE_SENT') AS sent
FROM retention_decision_logs
WHERE business_id = :business_id
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;

-- 6c. Errores de envío, agrupados y sin números largos.
SELECT decision_code,
       left(regexp_replace(coalesce(metadata ->> 'error', metadata ->> 'reasonCode', '-'),
                           '\d{7,}', '[num]', 'g'), 120)  AS error,
       metadata ->> 'terminal'                             AS terminal,
       count(*)                                            AS times,
       max(created_at)::date                               AS last_seen
FROM retention_decision_logs
WHERE business_id = :business_id
  AND decision_code IN ('MESSAGE_SEND_FAILED', 'MESSAGE_SEND_SKIPPED', 'MESSAGE_FAILED')
GROUP BY 1, 2, 3
ORDER BY times DESC;

-- ----------------------------------------------------------------------------
-- 7. Mensajes de Autopilot por estado (si se intentó enviar algo).
--    Tablas: "Message", retention_assignments. Sin contenido del mensaje.
-- ----------------------------------------------------------------------------
SELECT date_trunc('month', m."createdAt")::date AS month,
       m.status,
       coalesce(m.copy_source::text, '-')       AS copy_source,
       count(*)                                 AS messages,
       max(m."sentAt")::date                    AS last_sent
FROM "Message" m
JOIN retention_assignments a ON a.message_id = m.id
WHERE m."businessId" = :business_id
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- ----------------------------------------------------------------------------
-- 8. Resultados medidos (si hubo exposición).
--    Tabla: retention_outcomes. Conteos por objetivo y variante.
-- ----------------------------------------------------------------------------
SELECT e.objective,
       v."strategyType",
       count(*)                                              AS outcomes,
       count(*) FILTER (WHERE o.returned)                    AS returned,
       count(*) FILTER (WHERE o.confirmed_by_redemption)     AS confirmed_by_redemption,
       count(*) FILTER (WHERE o.observed_within_window)      AS within_window
FROM retention_outcomes o
JOIN retention_experiments e ON e.id = o.experiment_id
JOIN retention_variants v ON v.id = o.variant_id
WHERE o.business_id = :business_id
GROUP BY 1, 2
ORDER BY 1, 2;

-- ----------------------------------------------------------------------------
-- 9. Promociones manuales (fuera de Autopilot), para ver si el canal anduvo.
--    Tablas: "ManualCampaign", "ManualCampaignContact". Sin cuerpo del mensaje
--    ni teléfonos; el motivo de falla se recorta y se tapan números largos.
-- ----------------------------------------------------------------------------
SELECT date_trunc('month', mc.created_at)::date                AS month,
       count(DISTINCT mc.id)                                   AS campaigns,
       count(cc.id)                                            AS contacts,
       count(cc.id) FILTER (WHERE cc.status = 'sent')          AS sent,
       count(cc.id) FILTER (WHERE cc.status = 'failed')        AS failed
FROM "ManualCampaign" mc
LEFT JOIN "ManualCampaignContact" cc ON cc.manual_campaign_id = mc.id
WHERE mc.business_id = :business_id
GROUP BY 1
ORDER BY 1;

SELECT left(regexp_replace(coalesce(fail_reason, '-'), '\d{7,}', '[num]', 'g'), 120) AS fail_reason,
       count(*)                                                                      AS times
FROM "ManualCampaignContact"
WHERE business_id = :business_id
  AND status = 'failed'
GROUP BY 1
ORDER BY times DESC;

-- ----------------------------------------------------------------------------
-- 10. Programa: premios por visitas y beneficios emitidos.
--     Tablas: customer_reward_goals, benefit_participations. Solo conteos.
--     Responde: ¿hay clientes "cerca del premio" o beneficios sin usar?
-- ----------------------------------------------------------------------------
SELECT status, count(*) AS reward_goals
FROM customer_reward_goals
WHERE business_id = :business_id
GROUP BY 1
ORDER BY 1;

SELECT source,
       count(*)                                                        AS issued,
       count(*) FILTER (WHERE redeemed_at IS NOT NULL)                 AS redeemed,
       count(*) FILTER (WHERE redeemed_at IS NULL AND expires_at < now()) AS expired_unused,
       count(*) FILTER (WHERE redeemed_at IS NULL
                          AND (expires_at IS NULL OR expires_at >= now())) AS open
FROM benefit_participations
WHERE business_id = :business_id
GROUP BY 1
ORDER BY 1;

-- ----------------------------------------------------------------------------
-- 11. ¿Corrió el optimizador de Autopilot? Tabla: retention_optimization_runs.
-- ----------------------------------------------------------------------------
SELECT status, reason_code, count(*) AS runs, max(created_at)::date AS last_run
FROM retention_optimization_runs
WHERE business_id = :business_id
GROUP BY 1, 2
ORDER BY runs DESC;

ROLLBACK;

-- ============================================================================
-- Fuera de SQL (también con autorización, sin datos de clientes):
--   * Railway → variables: REDIS_URL presente, RETENTION_V2_EVALUATE_CRON,
--     WHATSAPP_PROVIDER, WASENDER_API_KEY presente (no su valor).
--   * Railway → logs del API: líneas "retention-v2" del job diario (que exista
--     al menos una por día) y "Retention V2 WhatsApp send failed".
--   * WaSender → estado de la sesión (connected / need_scan / logged_out).
--
-- Cómo leer el resultado (orden de descarte):
--   1. retention_engine_v2_enabled = false o experience_version <> CHECKIN_V2
--      → Autopilot nunca evaluó este negocio.
--   2. Consulta 6b sin filas → el job diario no corre (Redis o cron).
--   3. Sin experimentos RUNNING (consulta 4) → nada para reclutar
--      (SKIPPED_NO_EXPERIMENT en la 6).
--   4. Asignaciones PENDING viejas (consulta 5) → bug de ventana horaria.
--   5. MESSAGE_SEND_SKIPPED con CHANNEL_NOT_CONFIGURED / QUOTA_EXCEEDED
--      → canal o cuota.
--   6. Muchos SKIPPED_COOLDOWN / SKIPPED_LIMIT / pocos ELIGIBLE → reglas o
--      falta de clientes en esas situaciones (consulta 3).
--   7. Mensajes SENT pero sin retornos (consultas 7 y 8) → efectividad, con
--      la advertencia de que la muestra es chica.
-- ============================================================================
