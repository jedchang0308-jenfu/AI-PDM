-- DEV-032 production Cloud SQL admin bootstrap candidate
-- Proposal only. Execute only through the approved privileged database bootstrap path.
-- No secret values are present.
-- DEV-032 Gate C production contract. Apply only through the guarded migration identity.
-- Required psql variables: database_name, runtime_iam_user, migration_iam_user.

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

-- Additive privileged bootstrap for the AI-PDM cross-application contract schema.
-- Safe to apply to an existing Cloud SQL database after pdm_runtime and
-- pdm_migration have already been provisioned.

CREATE SCHEMA IF NOT EXISTS ai_pdm_contract;
REVOKE ALL ON SCHEMA ai_pdm_contract FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA ai_pdm_contract TO pdm_migration;
GRANT USAGE ON SCHEMA ai_pdm_contract TO pdm_runtime;
