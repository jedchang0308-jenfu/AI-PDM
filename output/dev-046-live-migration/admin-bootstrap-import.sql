-- DEV-046 staging Cloud SQL admin bootstrap execution input.
-- Approved for the 2026-07-15 staging bootstrap only.
-- Source: output/dev-046-cloudsql-migration-package/sql/000_admin_bootstrap_grants.sql

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
-- privileges. The migration runner refreshes runtime grants after every
-- successful migration transaction instead.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM pdm_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM pdm_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pdm_migration;

GRANT pdm_runtime TO "pdm-runtime-stg@jenfu-ai-pdm-stg-361825.iam";
GRANT pdm_migration TO "pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam";

COMMIT;
