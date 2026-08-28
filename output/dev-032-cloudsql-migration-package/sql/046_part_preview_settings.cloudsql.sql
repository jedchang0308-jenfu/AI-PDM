-- DEV-046 Cloud SQL candidate generated from db/postgres/046_part_preview_settings.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-065 Part identity preview authority. Additive, no backfill.
-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:2

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev065:part-preview-v1'));

CREATE TABLE IF NOT EXISTS part_preview_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_number_id TEXT NOT NULL REFERENCES part_numbers(id) ON DELETE CASCADE,
  source_mode TEXT NOT NULL CHECK (source_mode IN ('auto', 'custom_image')),
  file_asset_id TEXT REFERENCES file_assets(id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, part_number_id),
  CHECK (
    (source_mode = 'auto' AND file_asset_id IS NULL)
    OR (source_mode = 'custom_image' AND file_asset_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_part_preview_settings_active_asset
  ON part_preview_settings(file_asset_id)
  WHERE source_mode = 'custom_image' AND file_asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION dev065_validate_part_preview_setting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM part_numbers part
    WHERE part.id = NEW.part_number_id AND part.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'PART_PREVIEW_PART_SCOPE_INVALID';
  END IF;

  IF NEW.source_mode = 'custom_image' AND NOT EXISTS (
    SELECT 1 FROM file_assets asset
    WHERE asset.id = NEW.file_asset_id
      AND asset.linked_entity_type = 'part_number'
      AND asset.linked_entity_id = NEW.part_number_id
      AND asset.document_category = 'part_preview_image'
      AND asset.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PART_PREVIEW_ASSET_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev065_part_preview_settings_validate ON part_preview_settings;
CREATE TRIGGER trg_dev065_part_preview_settings_validate
BEFORE INSERT OR UPDATE ON part_preview_settings
FOR EACH ROW EXECUTE FUNCTION dev065_validate_part_preview_setting();

CREATE OR REPLACE FUNCTION dev065_guard_active_part_preview_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM part_preview_settings setting
    WHERE setting.source_mode = 'custom_image'
      AND setting.file_asset_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'PART_PREVIEW_ACTIVE_ASSET';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev065_file_asset_active_preview_delete ON file_assets;
CREATE TRIGGER trg_dev065_file_asset_active_preview_delete
BEFORE UPDATE OF deleted_at ON file_assets
FOR EACH ROW EXECUTE FUNCTION dev065_guard_active_part_preview_delete();

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:77
