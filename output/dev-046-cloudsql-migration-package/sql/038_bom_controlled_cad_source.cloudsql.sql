-- DEV-046 Cloud SQL candidate generated from db/postgres/038_bom_controlled_cad_source.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

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
