-- DEV-032 production Cloud SQL admin bootstrap fail-closed readback.
-- Read-only role and membership assertions; no business data is accessed.

DO $$
DECLARE
  runtime_role pg_roles%ROWTYPE;
  migration_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO runtime_role FROM pg_roles WHERE rolname = 'pdm_runtime';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_RUNTIME_ROLE_MISSING';
  END IF;

  SELECT * INTO migration_role FROM pg_roles WHERE rolname = 'pdm_migration';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_MIGRATION_ROLE_MISSING';
  END IF;

  IF runtime_role.rolcanlogin OR runtime_role.rolsuper OR runtime_role.rolcreatedb OR
     runtime_role.rolcreaterole OR runtime_role.rolreplication OR runtime_role.rolbypassrls THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_RUNTIME_ROLE_OVERPRIVILEGED';
  END IF;

  IF migration_role.rolcanlogin OR migration_role.rolsuper OR migration_role.rolcreatedb OR
     migration_role.rolcreaterole OR migration_role.rolreplication OR migration_role.rolbypassrls THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_MIGRATION_ROLE_OVERPRIVILEGED';
  END IF;

  IF NOT pg_has_role('ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam', 'pdm_runtime', 'MEMBER') THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_RUNTIME_MEMBERSHIP_MISSING';
  END IF;

  IF NOT pg_has_role('ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam', 'pdm_migration', 'MEMBER') THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_MIGRATION_MEMBERSHIP_MISSING';
  END IF;

  IF has_schema_privilege('pdm_runtime', 'public', 'CREATE') OR
     NOT has_schema_privilege('pdm_runtime', 'public', 'USAGE') OR
     NOT has_schema_privilege('pdm_migration', 'public', 'CREATE') OR
     NOT has_schema_privilege('pdm_migration', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'DEV032_ADMIN_BOOTSTRAP_SCHEMA_PRIVILEGE_MISMATCH';
  END IF;
END
$$;
