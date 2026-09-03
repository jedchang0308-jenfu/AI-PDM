-- DEV-032 production existing-database migration ownership handoff
-- Execute as the dedicated IAM migration database user through the approved SQL-import path.
-- This file creates no role, schema or data and grants no additional privilege.
-- Existing Cloud SQL objects were historically created by the dedicated IAM migration user.
-- Transfer only that role's objects to the non-login migration owner before the runner assumes it.
DO $cloudsql_migration_owner$
BEGIN
  IF NOT pg_has_role('ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam', 'pdm_migration', 'MEMBER') THEN
    RAISE EXCEPTION 'CLOUDSQL_MIGRATION_ROLE_MEMBERSHIP_MISSING:%', 'ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam';
  END IF;
END
$cloudsql_migration_owner$;

REASSIGN OWNED BY "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam" TO pdm_migration;
