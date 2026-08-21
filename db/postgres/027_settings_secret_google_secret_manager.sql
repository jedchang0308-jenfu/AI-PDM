-- DEV-058: allow Google Secret Manager exact-version references.
-- Existing rows and legacy Supabase references are preserved; no plaintext is migrated.

BEGIN;

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

COMMIT;
