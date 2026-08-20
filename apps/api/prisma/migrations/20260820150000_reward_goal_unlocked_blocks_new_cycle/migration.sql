-- Widens the partial unique index that guarantees "at most one live goal
-- per customer" so it also covers UNLOCKED, not just ACTIVE — a goal that
-- unlocked a reward the customer hasn't redeemed yet is still a live
-- promise; a new cycle must not start until it closes (REDEEMED/expired/
-- cancelled). Hand-authored, same technique as the index it replaces
-- (Prisma has no "unique where" attribute).
DROP INDEX "customer_reward_goals_one_active_per_customer";

CREATE UNIQUE INDEX "customer_reward_goals_one_active_per_customer"
  ON "customer_reward_goals" ("business_id", "customer_id")
  WHERE "status" IN ('ACTIVE', 'UNLOCKED');
