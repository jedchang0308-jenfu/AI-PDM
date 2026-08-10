-- Allow exact-version Google Secret Manager references without migrating plaintext
-- Source: db/postgres/027_settings_secret_google_secret_manager.sql
-- Source SHA-256: d6a34e44fd310f921c3df68a93da8f9605425f2b813b6073a5e307460ca6b4c5
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

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
  CHECK (vault_provider IN ('local_test_double', 'google_secret_manager', 'supabase_vault'));

COMMENT ON COLUMN public.secret_references.vault_secret_id IS
  'Opaque provider reference. For google_secret_manager this is an exact projects/.../versions/N resource name; plaintext is never stored.';

COMMIT;
