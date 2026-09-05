-- DEV-010 R1-06 compatibility control. Apply only through the guarded production principal bootstrap.
-- Required psql variables: database_name, fence_iam_user.
\set ON_ERROR_STOP on

DO $$
BEGIN
  CREATE ROLE pdm_fence_controller NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

GRANT CONNECT ON DATABASE :"database_name" TO pdm_fence_controller;

-- The controller is the recoverable control plane for the maintenance fence. It
-- is not attached to Cloud Run. ADMIN OPTION is required to suspend and restore
-- the migration runner's pdm_migration membership atomically.
GRANT pdm_migration TO pdm_fence_controller WITH ADMIN OPTION;
GRANT pdm_fence_controller TO :"fence_iam_user";

REVOKE pdm_runtime FROM pdm_fence_controller;
