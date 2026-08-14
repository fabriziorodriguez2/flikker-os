-- Records changes to RetentionSettings.maxAutomatedIncentivesPerMonth in
-- Programa's history — it silently changes whether an already-authorized
-- benefit can be issued, without touching the Benefit itself, so it deserves
-- its own audit trail entry the same way authorizing/revoking one does.
ALTER TYPE "ProgramAuditEventType" ADD VALUE 'automation_incentive_limit_changed';
