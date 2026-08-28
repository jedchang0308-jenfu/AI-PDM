-- DEV-046 Cloud SQL candidate generated from db/postgres/027_settings_secret_google_secret_manager.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-058: allow Google Secret Manager exact-version references.
-- Existing rows and legacy Supabase references are preserved; no plaintext is migrated.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:4

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.secret_references'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%vault_provider%'
  LOOP
    EXECUTE format('ALTER TABLE public.secret_references DROP CONSTRAINT IF EXISTS %I', constraint_row.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.secret_references
  ADD CONSTRAINT secret_references_vault_provider_check
  CHECK (vault_provider IN ('local_test_double', 'windows_dpapi', 'google_secret_manager', 'supabase_vault'));

COMMENT ON COLUMN public.secret_references.vault_secret_id IS
  'Opaque provider reference. For google_secret_manager this is an exact projects/.../versions/N resource name; plaintext is never stored.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:29
