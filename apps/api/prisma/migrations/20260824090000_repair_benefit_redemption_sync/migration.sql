-- Repara los canjes que quedaron a medias entre las dos filas que describen
-- el MISMO hecho: `benefit_participations.redeemed_at` (la emisión consumida,
-- que es la fuente de verdad de "¿se canjeó un Benefit?" — ver
-- `BenefitsRepository.countRedeemed`) y `customer_reward_goals.redeemed_at`
-- (la promesa de esa tarjeta puntual).
--
-- Antes, `RedemptionService.redeem` cerraba la tarjeta al final del flujo,
-- después de registrar la visita, adjuntarla y emitir el evento. Un fallo en
-- el medio dejaba las dos fuentes en desacuerdo, y las pantallas que leen una
-- u otra mostraban cosas distintas del mismo canje (Programa y el detalle del
-- cliente decían "canjeó su recompensa" mientras Inicio mostraba 0). El orden
-- de escritura ya se corrigió; esto alinea lo que quedó de antes.
--
-- Sin datos inventados: solo se copia la fecha que la OTRA fila ya tenía.
-- Nunca pisa un valor existente.

-- 1) Tarjeta cerrada pero emisión sin marcar.
UPDATE "benefit_participations" p
SET "redeemed_at" = g."redeemed_at"
FROM "customer_reward_goals" g
WHERE g."benefit_participation_id" = p."id"
  AND g."business_id" = p."business_id"
  AND g."redeemed_at" IS NOT NULL
  AND p."redeemed_at" IS NULL;

-- 2) Emisión consumida pero tarjeta todavía abierta. Solo promueve goals en
--    UNLOCKED: una EXPIRED/CANCELLED es historia cerrada por otra razón y no
--    se reescribe.
UPDATE "customer_reward_goals" g
SET "redeemed_at" = p."redeemed_at",
    "status" = 'REDEEMED'::"RewardGoalStatus"
FROM "benefit_participations" p
WHERE g."benefit_participation_id" = p."id"
  AND g."business_id" = p."business_id"
  AND p."redeemed_at" IS NOT NULL
  AND g."redeemed_at" IS NULL
  AND g."status" = 'UNLOCKED'::"RewardGoalStatus";
