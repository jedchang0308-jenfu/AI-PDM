-- DEV-032 production Cloud SQL admin bootstrap execution input.
-- Approved by the active DEV-032 production release goal.
-- Source: output/dev-032-cloudsql-migration-package/sql/000_admin_bootstrap_grants.sql

BEGIN;

DO $$
BEGIN
  CREATE ROLE pdm_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE ROLE pdm_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM pdm_runtime;
GRANT CONNECT ON DATABASE "ai_pdm" TO pdm_runtime, pdm_migration;
GRANT USAGE ON SCHEMA public TO pdm_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO pdm_migration;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pdm_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO pdm_runtime;

-- Cloud SQL's managed postgres role cannot alter another role's default
-- privileges. Every successful migration must run pdm_runtime_grants_refresh.sql
-- in the same transaction instead.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM pdm_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM pdm_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pdm_migration;

GRANT pdm_runtime TO "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam";
GRANT pdm_migration TO "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam";

COMMIT;
