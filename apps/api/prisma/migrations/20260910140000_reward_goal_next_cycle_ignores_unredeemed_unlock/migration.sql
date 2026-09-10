-- Revierte la migración 20260820150000_reward_goal_unlocked_blocks_new_cycle
-- — decisión de producto explícita, no un bug de esa migración anterior.
--
-- Aquella migración había ampliado el índice a ACTIVE + UNLOCKED a propósito,
-- para que un premio ya desbloqueado y sin canjear bloqueara la próxima
-- tarjeta ("dos promesas abiertas a la vez" se consideraba un estado a
-- evitar). En la práctica eso significaba que un cliente que no volvía a
-- canjear su premio quedaba con SU TARJETA CONGELADA para siempre — sin
-- redención propia, un goal UNLOCKED no tenía ningún camino de salida hacia
-- REDEEMED (eso depende de una acción del negocio, no del cliente), y el
-- barrido diario solo expira ciclos ACTIVE, nunca UNLOCKED (ver
-- `RewardGoalSweepService.expireOverdue`, y su complemento nuevo
-- `expireOverdueUnlocked` en la misma tanda que esta migración).
--
-- Criterio de producto vigente: un beneficio ganado y pendiente de canje
-- (o ya vencido sin canjear) queda asociado al cliente y visible en Mi
-- Flikker, pero NO frena el inicio de la tarjeta siguiente. Dos promesas
-- pueden convivir: la vieja (UNLOCKED, esperando canje) y la nueva (ACTIVE,
-- en curso). Ver `RewardGoalEngineService.hasActiveGoal`, que ahora solo
-- mira ACTIVE — este índice es su backstop de base de datos, así que tiene
-- que decir lo mismo o la creación de la tarjeta nueva fallaría igual con
-- un P2002 aunque la app ya lo permita.
DROP INDEX "customer_reward_goals_one_active_per_customer";

CREATE UNIQUE INDEX "customer_reward_goals_one_active_per_customer"
  ON "customer_reward_goals" ("business_id", "customer_id")
  WHERE "status" = 'ACTIVE';
