-- Retention V2 self-service bootstrap: marks which experiments
-- RetentionV2BootstrapService created and owns, so it can tell them apart
-- from anything a Platform Admin configured by hand and never touch those.
-- Defaults to false so every existing experiment (all of them hand-seeded
-- today) reads as "not ours" — exactly the safe starting state.
ALTER TABLE "retention_experiments" ADD COLUMN "managed_by_self_service" BOOLEAN NOT NULL DEFAULT false;
