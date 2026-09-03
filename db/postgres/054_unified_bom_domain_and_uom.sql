-- DEV-109 unified BOM domain. Forward-only, idempotent, S0 (pre-052) and
-- S1 (post-052) safe. Run in a disposable shadow before any production gate.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ai-pdm:dev-109:unified-bom-domain'));

ALTER TABLE part_numbers ADD COLUMN IF NOT EXISTS base_uom_code TEXT;
ALTER TABLE bom_lines_tree ADD COLUMN IF NOT EXISTS quantity_uom_code TEXT;
ALTER TABLE bom_lines_tree ADD COLUMN IF NOT EXISTS quantity_scaled_6 BIGINT;
ALTER TABLE bom_draft_floating_topics ADD COLUMN IF NOT EXISTS quantity_uom_code TEXT;
ALTER TABLE bom_draft_floating_topics ADD COLUMN IF NOT EXISTS quantity_scaled_6 BIGINT;
ALTER TABLE bom_release_resolved_lines ADD COLUMN IF NOT EXISTS quantity_uom_code TEXT;
ALTER TABLE bom_release_resolved_lines ADD COLUMN IF NOT EXISTS quantity_scaled_6 BIGINT;
ALTER TABLE bom_definitions ADD COLUMN IF NOT EXISTS legacy_purpose TEXT;

DO $$
DECLARE
  has_purpose BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bom_definitions' AND column_name = 'purpose'
  ) INTO has_purpose;
  IF has_purpose THEN
    EXECUTE $sql$
      UPDATE bom_definitions
      SET legacy_purpose = purpose
      WHERE legacy_purpose IS NULL AND purpose IS NOT NULL
    $sql$;
    EXECUTE 'DROP INDEX IF EXISTS idx_bom_definitions_company_purpose';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_bom_definition_purpose_immutable ON bom_definitions';
    EXECUTE 'ALTER TABLE bom_definitions DROP CONSTRAINT IF EXISTS bom_definitions_purpose_check';
    EXECUTE 'ALTER TABLE bom_definitions DROP COLUMN purpose';
  END IF;
END $$;

ALTER TABLE part_numbers DROP CONSTRAINT IF EXISTS part_numbers_base_uom_code_check;
ALTER TABLE part_numbers ADD CONSTRAINT part_numbers_base_uom_code_check
  CHECK (base_uom_code IS NULL OR base_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'));
ALTER TABLE bom_lines_tree DROP CONSTRAINT IF EXISTS bom_lines_tree_quantity_uom_code_check;
ALTER TABLE bom_lines_tree ADD CONSTRAINT bom_lines_tree_quantity_uom_code_check
  CHECK (quantity_uom_code IS NULL OR quantity_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'));
ALTER TABLE bom_lines_tree DROP CONSTRAINT IF EXISTS bom_lines_tree_quantity_scaled_6_check;
ALTER TABLE bom_lines_tree ADD CONSTRAINT bom_lines_tree_quantity_scaled_6_check
  CHECK (quantity_scaled_6 IS NULL OR quantity_scaled_6 BETWEEN 1 AND 999999999999999);
ALTER TABLE bom_draft_floating_topics DROP CONSTRAINT IF EXISTS bom_draft_floating_topics_quantity_uom_code_check;
ALTER TABLE bom_draft_floating_topics ADD CONSTRAINT bom_draft_floating_topics_quantity_uom_code_check
  CHECK (quantity_uom_code IS NULL OR quantity_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'));
ALTER TABLE bom_draft_floating_topics DROP CONSTRAINT IF EXISTS bom_draft_floating_topics_quantity_scaled_6_check;
ALTER TABLE bom_draft_floating_topics ADD CONSTRAINT bom_draft_floating_topics_quantity_scaled_6_check
  CHECK (quantity_scaled_6 IS NULL OR quantity_scaled_6 BETWEEN 1 AND 999999999999999);
ALTER TABLE bom_release_resolved_lines DROP CONSTRAINT IF EXISTS bom_release_resolved_lines_quantity_uom_code_check;
ALTER TABLE bom_release_resolved_lines ADD CONSTRAINT bom_release_resolved_lines_quantity_uom_code_check
  CHECK (quantity_uom_code IS NULL OR quantity_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'));
ALTER TABLE bom_release_resolved_lines DROP CONSTRAINT IF EXISTS bom_release_resolved_lines_quantity_scaled_6_check;
ALTER TABLE bom_release_resolved_lines ADD CONSTRAINT bom_release_resolved_lines_quantity_scaled_6_check
  CHECK (quantity_scaled_6 IS NULL OR quantity_scaled_6 BETWEEN 1 AND 999999999999999);

DO $$
DECLARE
  issue_codes TEXT[] := ARRAY[
    'definition_backfill_ambiguous','owner_missing','cross_company','revision_lineage_conflict',
    'component_identity_ambiguous','logical_line_identity_conflict','review_snapshot_unavailable',
    'release_projection_unavailable','duplicate_current_binding','open_revision_conflict',
    'legacy_purpose_invalid','duplicate_current_parent_definition','pending_legacy_review',
    'part_base_uom_missing','draft_line_uom_unresolved','draft_quantity_exactness_unresolved',
    'sldasm_target_missing','sldasm_target_ambiguous'
  ];
BEGIN
  ALTER TABLE bom_shared_structure_migration_issues DROP CONSTRAINT IF EXISTS bom_shared_structure_migration_issues_issue_code_check;
  EXECUTE format('ALTER TABLE bom_shared_structure_migration_issues ADD CONSTRAINT bom_shared_structure_migration_issues_issue_code_check CHECK (issue_code = ANY (%L::text[]))', issue_codes);
END $$;

COMMIT;
