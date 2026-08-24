-- DEV-095: retire the assembly-specific BOM intake and XLS import persistence.
-- This migration intentionally preserves canonical/manual BOM drafts and released snapshots.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev095:retire-assembly-bom-intake-v1'));

DELETE FROM bom_create_effects effect
USING bom_drafts draft
WHERE effect.draft_id = draft.id
  AND draft.source IN ('cad_reference', 'solidworks_xls');

DELETE FROM bom_release_snapshots snapshot
USING bom_drafts draft
WHERE snapshot.bom_draft_id = draft.id
  AND draft.source IN ('cad_reference', 'solidworks_xls');

DELETE FROM bom_drafts
WHERE source IN ('cad_reference', 'solidworks_xls');

DELETE FROM bom_headers
WHERE source = 'cad_references';

DELETE FROM file_references
WHERE reference_type = 'assembly_component';

DROP INDEX IF EXISTS idx_bom_import_jobs_parent_submission_id;
DROP TABLE IF EXISTS bom_import_jobs;
DROP TABLE IF EXISTS bom_import_profiles;

ALTER TABLE bom_drafts DROP CONSTRAINT IF EXISTS bom_drafts_source_revision_package_fk;
ALTER TABLE bom_drafts DROP COLUMN IF EXISTS source_revision_package_id;
ALTER TABLE bom_release_snapshots DROP COLUMN IF EXISTS source_revision_package_id;

ALTER TABLE file_references DROP CONSTRAINT IF EXISTS file_references_reference_type_check;
ALTER TABLE file_references
  ADD CONSTRAINT file_references_reference_type_check
  CHECK (reference_type IN ('drawing_model', 'derived', 'unknown'));

ALTER TABLE bom_headers DROP CONSTRAINT IF EXISTS bom_headers_source_check;
ALTER TABLE bom_headers ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_headers
  ADD CONSTRAINT bom_headers_source_check
  CHECK (source IN ('manual', 'imported'));

ALTER TABLE bom_drafts DROP CONSTRAINT IF EXISTS bom_drafts_source_check;
ALTER TABLE bom_drafts ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_drafts ALTER COLUMN identity_authority SET DEFAULT 'canonical_part_number';
ALTER TABLE bom_drafts
  ADD CONSTRAINT bom_drafts_source_check
  CHECK (source = 'manual');

UPDATE bom_lines_tree
SET source = 'manual', source_priority = 30
WHERE source <> 'manual' OR source_priority <> 30;
ALTER TABLE bom_lines_tree DROP CONSTRAINT IF EXISTS bom_lines_tree_source_check;
ALTER TABLE bom_lines_tree ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_lines_tree ALTER COLUMN source_priority SET DEFAULT 30;
ALTER TABLE bom_lines_tree
  ADD CONSTRAINT bom_lines_tree_source_check
  CHECK (source = 'manual');

UPDATE bom_draft_floating_topics
SET source = 'manual'
WHERE source <> 'manual';
ALTER TABLE bom_draft_floating_topics DROP CONSTRAINT IF EXISTS bom_draft_floating_topics_source_check;
ALTER TABLE bom_draft_floating_topics ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_draft_floating_topics
  ADD CONSTRAINT bom_draft_floating_topics_source_check
  CHECK (source = 'manual');

COMMIT;
