-- DEV-046 Phase 1 contract. Apply only through the guarded migration identity.
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

-- Cross-application contract schemas are created and retained by the privileged
-- bootstrap identity. The migration role gets DDL only inside this schema and
-- does not receive database-wide CREATE or ownership of the schema boundary.
CREATE SCHEMA IF NOT EXISTS ai_pdm_contract;
REVOKE ALL ON SCHEMA ai_pdm_contract FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA ai_pdm_contract TO pdm_migration;
GRANT USAGE ON SCHEMA ai_pdm_contract TO pdm_runtime;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM pdm_runtime;
GRANT CONNECT ON DATABASE :"database_name" TO pdm_runtime, pdm_migration;
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

GRANT pdm_runtime TO :"runtime_iam_user";
GRANT pdm_migration TO :"migration_iam_user";
