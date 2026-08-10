-- DEV-061: contextual file ownership, strict drawing revision inputs, and
-- content-level 3D reuse. Legacy loose drawing attachments remain readable;
-- new revision writes use the controlled intake route.

ALTER TABLE submission_files
  ALTER COLUMN local_path DROP NOT NULL;

ALTER TABLE submission_files
  ADD COLUMN IF NOT EXISTS source_file_asset_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'submission_files_source_file_asset_id_fkey'
  ) THEN
    ALTER TABLE submission_files
      ADD CONSTRAINT submission_files_source_file_asset_id_fkey
      FOREIGN KEY (source_file_asset_id) REFERENCES file_assets(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'submission_files_source_pointer_check'
  ) THEN
    ALTER TABLE submission_files
      ADD CONSTRAINT submission_files_source_pointer_check
      CHECK (source_file_asset_id IS NOT NULL OR local_path IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_submission_files_source_asset
  ON submission_files(source_file_asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_revision_package_files_primary_role
  ON drawing_revision_package_files(package_id, role)
  WHERE is_primary = 1;

CREATE INDEX IF NOT EXISTS idx_file_assets_active_content_hash
  ON file_assets(content_hash, file_size, linked_entity_type, linked_entity_id)
  WHERE deleted_at IS NULL AND content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shared_cad_model_versions_active_hash
  ON shared_cad_model_versions(company_id, owner_scope, owner_id, content_hash, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_cad_model_versions_active_owner_hash_unique
  ON shared_cad_model_versions(company_id, owner_scope, owner_id, content_hash)
  WHERE status <> 'Obsolete';
