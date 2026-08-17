ALTER TABLE bom_drafts
  ADD COLUMN IF NOT EXISTS source_revision_package_id TEXT;

ALTER TABLE bom_release_snapshots
  ADD COLUMN IF NOT EXISTS source_revision_package_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bom_drafts_source_revision_package_fk'
  ) THEN
    ALTER TABLE bom_drafts
      ADD CONSTRAINT bom_drafts_source_revision_package_fk
      FOREIGN KEY (source_revision_package_id) REFERENCES drawing_revision_packages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bom_release_snapshots_source_revision_package_fk'
  ) THEN
    ALTER TABLE bom_release_snapshots
      ADD CONSTRAINT bom_release_snapshots_source_revision_package_fk
      FOREIGN KEY (source_revision_package_id) REFERENCES drawing_revision_packages(id) ON DELETE SET NULL;
  END IF;
END $$;
