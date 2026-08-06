-- Per-business rollout flags. Purely additive: no UPDATE, no data removal, and
-- no change to the already-applied check-in migrations.
--
-- Both columns are NOT NULL with a non-volatile DEFAULT, so Postgres backfills
-- them from catalog metadata without rewriting the table. Every existing
-- Business therefore lands on LEGACY automatically and keeps behaving exactly
-- as before, because nothing reads the column until the guards ship with it.
CREATE TYPE "ExperienceVersion" AS ENUM ('LEGACY', 'CHECKIN_V2');

ALTER TABLE "Business"
  ADD COLUMN "experience_version" "ExperienceVersion" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "retention_engine_v2_enabled" BOOLEAN NOT NULL DEFAULT false;
