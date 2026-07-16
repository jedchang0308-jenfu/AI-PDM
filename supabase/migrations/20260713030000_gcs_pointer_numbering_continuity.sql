-- Add GCS pointer metadata and numbering recovery reservations
-- Source: db/postgres/011_gcs_pointer_numbering_continuity.sql
-- Source SHA-256: 0b23c592f4e8526788d553330c91f444287ae66cf1c33216e5b184bbafce28cb
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

ALTER TABLE submission_files
  DROP CONSTRAINT IF EXISTS submission_files_storage_provider_check,
  ADD COLUMN IF NOT EXISTS storage_generation TEXT,
  ADD COLUMN IF NOT EXISTS storage_metageneration TEXT,
  ADD CONSTRAINT submission_files_storage_provider_check
    CHECK (storage_provider IN ('local_repository', 'supabase_storage', 's3_compatible', 'google_cloud_storage'));

ALTER TABLE release_packages
  DROP CONSTRAINT IF EXISTS release_packages_storage_provider_check,
  ADD COLUMN IF NOT EXISTS storage_generation TEXT,
  ADD COLUMN IF NOT EXISTS storage_metageneration TEXT,
  ADD CONSTRAINT release_packages_storage_provider_check
    CHECK (storage_provider IN ('local_repository', 'supabase_storage', 's3_compatible', 'google_cloud_storage'));

ALTER TABLE file_assets
  DROP CONSTRAINT IF EXISTS file_assets_storage_provider_check,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_generation TEXT,
  ADD COLUMN IF NOT EXISTS storage_metageneration TEXT,
  ADD CONSTRAINT file_assets_storage_provider_check
    CHECK (storage_provider IN ('j_drive', 'local_repository', 'supabase_storage', 's3_compatible', 'google_cloud_storage', 'external'));

ALTER TABLE file_derivatives
  DROP CONSTRAINT IF EXISTS file_derivatives_storage_provider_check,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_generation TEXT,
  ADD COLUMN IF NOT EXISTS storage_metageneration TEXT,
  ADD CONSTRAINT file_derivatives_storage_provider_check
    CHECK (storage_provider IN ('local_repository', 'supabase_storage', 's3_compatible', 'google_cloud_storage', 'external'));

CREATE TABLE IF NOT EXISTS numbering_recovery_reservations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  number_kind TEXT NOT NULL CHECK (number_kind IN ('root', 'drawing', 'part')),
  number_value TEXT NOT NULL,
  reservation_reason TEXT NOT NULL CHECK (reservation_reason IN ('source_archive', 'restored_ledger', 'communicated_number', 'manual_hold')),
  source_archive_ref TEXT NOT NULL,
  ledger_entry_hash TEXT NOT NULL CHECK (length(ledger_entry_hash) = 64),
  reservation_status TEXT NOT NULL DEFAULT 'reserved' CHECK (reservation_status IN ('reserved', 'reconciled')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMPTZ,
  UNIQUE (company_id, number_kind, number_value)
);

CREATE INDEX IF NOT EXISTS idx_numbering_recovery_reservations_lookup
  ON numbering_recovery_reservations(company_id, number_kind, number_value, reservation_status);

COMMIT;
