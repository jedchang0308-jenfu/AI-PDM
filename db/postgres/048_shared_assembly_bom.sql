-- DEV-096: additive shared assembly BOM authority. Capability remains default-off.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev096:shared-assembly-bom-v1'));

ALTER TABLE part_numbers ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'single_part';
ALTER TABLE part_numbers DROP CONSTRAINT IF EXISTS part_numbers_structure_type_check;
ALTER TABLE part_numbers ADD CONSTRAINT part_numbers_structure_type_check
  CHECK (structure_type IN ('single_part', 'assembly', 'unclassified'));

CREATE TABLE IF NOT EXISTS bom_definitions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  part_root_id TEXT NOT NULL REFERENCES part_roots(id),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bom_definitions_company_root ON bom_definitions(company_id, part_root_id);

ALTER TABLE bom_drafts ADD COLUMN IF NOT EXISTS definition_id TEXT REFERENCES bom_definitions(id);
ALTER TABLE bom_drafts ADD COLUMN IF NOT EXISTS base_release_snapshot_id TEXT;
ALTER TABLE bom_lines_tree ADD COLUMN IF NOT EXISTS logical_line_id TEXT;
ALTER TABLE bom_draft_floating_topics ADD COLUMN IF NOT EXISTS logical_line_id TEXT;
ALTER TABLE bom_review_requests ADD COLUMN IF NOT EXISTS review_schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bom_review_requests ADD COLUMN IF NOT EXISTS definition_row_version INTEGER;
ALTER TABLE bom_review_requests ADD COLUMN IF NOT EXISTS editor_version INTEGER;
ALTER TABLE bom_review_requests ADD COLUMN IF NOT EXISTS review_snapshot_json JSONB;
ALTER TABLE bom_review_requests ADD COLUMN IF NOT EXISTS review_snapshot_hash TEXT;
ALTER TABLE bom_release_snapshots ADD COLUMN IF NOT EXISTS definition_id TEXT REFERENCES bom_definitions(id);
ALTER TABLE bom_release_snapshots ADD COLUMN IF NOT EXISTS snapshot_schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bom_release_snapshots ADD COLUMN IF NOT EXISTS parent_snapshot_json JSONB;
ALTER TABLE bom_release_snapshots ADD COLUMN IF NOT EXISTS mapping_snapshot_json JSONB;
ALTER TABLE bom_release_snapshots ADD COLUMN IF NOT EXISTS resolved_projection_json JSONB;
ALTER TABLE bom_release_snapshots ADD COLUMN IF NOT EXISTS snapshot_hash TEXT;
ALTER TABLE bom_reconfirmation_flags ADD COLUMN IF NOT EXISTS logical_line_id TEXT;
ALTER TABLE bom_reconfirmation_flags ADD COLUMN IF NOT EXISTS parent_part_number_id TEXT REFERENCES part_numbers(id);
ALTER TABLE bom_reconfirmation_flags ADD COLUMN IF NOT EXISTS reference_scope TEXT NOT NULL DEFAULT 'legacy_line';

ALTER TABLE bom_review_requests DROP CONSTRAINT IF EXISTS bom_review_requests_review_schema_version_check;
ALTER TABLE bom_review_requests ADD CONSTRAINT bom_review_requests_review_schema_version_check CHECK (review_schema_version > 0);
ALTER TABLE bom_release_snapshots DROP CONSTRAINT IF EXISTS bom_release_snapshots_snapshot_schema_version_check;
ALTER TABLE bom_release_snapshots ADD CONSTRAINT bom_release_snapshots_snapshot_schema_version_check CHECK (snapshot_schema_version > 0);
ALTER TABLE bom_reconfirmation_flags DROP CONSTRAINT IF EXISTS bom_reconfirmation_flags_reference_scope_check;
ALTER TABLE bom_reconfirmation_flags ADD CONSTRAINT bom_reconfirmation_flags_reference_scope_check
  CHECK (reference_scope IN ('legacy_line', 'candidate', 'parent_selection'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_drafts_base_release_snapshot_fk') THEN
    ALTER TABLE bom_drafts ADD CONSTRAINT bom_drafts_base_release_snapshot_fk
      FOREIGN KEY (base_release_snapshot_id) REFERENCES bom_release_snapshots(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bom_definition_parent_bindings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  definition_id TEXT NOT NULL REFERENCES bom_definitions(id) ON DELETE CASCADE,
  part_number_id TEXT NOT NULL REFERENCES part_numbers(id),
  bound_from_bom_revision TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (definition_id, part_number_id),
  UNIQUE (part_number_id)
);

CREATE TABLE IF NOT EXISTS bom_draft_parent_bindings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  part_number_id TEXT NOT NULL REFERENCES part_numbers(id),
  selection_order INTEGER NOT NULL CHECK (selection_order >= 0),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bom_draft_id, part_number_id),
  UNIQUE (bom_draft_id, selection_order)
);

CREATE TABLE IF NOT EXISTS bom_draft_component_nodes (
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  logical_line_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_location TEXT NOT NULL CHECK (node_location IN ('tree', 'floating')),
  component_mode TEXT NOT NULL CHECK (component_mode IN ('fixed', 'by_parent')),
  child_part_root_id TEXT NOT NULL REFERENCES part_roots(id),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bom_draft_id, logical_line_id),
  UNIQUE (bom_draft_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_bom_draft_component_nodes_location ON bom_draft_component_nodes(bom_draft_id, node_location);

CREATE TABLE IF NOT EXISTS bom_draft_component_candidates (
  bom_draft_id TEXT NOT NULL,
  logical_line_id TEXT NOT NULL,
  child_part_number_id TEXT NOT NULL REFERENCES part_numbers(id),
  selection_order INTEGER NOT NULL CHECK (selection_order >= 0),
  PRIMARY KEY (bom_draft_id, logical_line_id, child_part_number_id),
  FOREIGN KEY (bom_draft_id, logical_line_id) REFERENCES bom_draft_component_nodes(bom_draft_id, logical_line_id) ON DELETE CASCADE,
  UNIQUE (bom_draft_id, logical_line_id, selection_order)
);
CREATE INDEX IF NOT EXISTS idx_bom_draft_candidates_child
  ON bom_draft_component_candidates(child_part_number_id, bom_draft_id, logical_line_id);

CREATE TABLE IF NOT EXISTS bom_draft_parent_selections (
  bom_draft_id TEXT NOT NULL,
  logical_line_id TEXT NOT NULL,
  parent_part_number_id TEXT NOT NULL,
  child_part_number_id TEXT NOT NULL,
  PRIMARY KEY (bom_draft_id, logical_line_id, parent_part_number_id),
  FOREIGN KEY (bom_draft_id, parent_part_number_id) REFERENCES bom_draft_parent_bindings(bom_draft_id, part_number_id) ON DELETE CASCADE,
  FOREIGN KEY (bom_draft_id, logical_line_id, child_part_number_id)
    REFERENCES bom_draft_component_candidates(bom_draft_id, logical_line_id, child_part_number_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bom_release_parent_snapshots (
  release_snapshot_id TEXT NOT NULL REFERENCES bom_release_snapshots(id) ON DELETE CASCADE,
  parent_part_number_id TEXT NOT NULL REFERENCES part_numbers(id) ON DELETE RESTRICT,
  definition_id TEXT NOT NULL REFERENCES bom_definitions(id),
  parent_part_number TEXT NOT NULL,
  parent_part_name TEXT NOT NULL,
  selection_order INTEGER NOT NULL CHECK (selection_order >= 0),
  PRIMARY KEY (release_snapshot_id, parent_part_number_id),
  UNIQUE (release_snapshot_id, selection_order)
);
CREATE INDEX IF NOT EXISTS idx_bom_release_parent_part ON bom_release_parent_snapshots(parent_part_number_id, release_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_bom_release_parent_definition ON bom_release_parent_snapshots(definition_id, parent_part_number_id);

CREATE TABLE IF NOT EXISTS bom_release_resolved_lines (
  id TEXT PRIMARY KEY,
  release_snapshot_id TEXT NOT NULL,
  definition_id TEXT NOT NULL REFERENCES bom_definitions(id),
  parent_part_number_id TEXT NOT NULL,
  logical_line_id TEXT NOT NULL,
  parent_logical_line_id TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('item', 'group')),
  child_part_number_id TEXT REFERENCES part_numbers(id),
  child_part_number TEXT,
  child_part_name TEXT,
  group_name TEXT,
  quantity DOUBLE PRECISION,
  sequence_no INTEGER NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source = 'manual'),
  CHECK ((node_type = 'item' AND child_part_number_id IS NOT NULL AND child_part_number IS NOT NULL AND quantity > 0)
    OR (node_type = 'group' AND child_part_number_id IS NULL AND quantity IS NULL AND group_name IS NOT NULL)),
  FOREIGN KEY (release_snapshot_id, parent_part_number_id)
    REFERENCES bom_release_parent_snapshots(release_snapshot_id, parent_part_number_id) ON DELETE CASCADE,
  UNIQUE (release_snapshot_id, parent_part_number_id, logical_line_id)
);
CREATE INDEX IF NOT EXISTS idx_bom_release_resolved_child
  ON bom_release_resolved_lines(child_part_number_id, release_snapshot_id, parent_part_number_id);
CREATE INDEX IF NOT EXISTS idx_bom_release_resolved_parent
  ON bom_release_resolved_lines(parent_part_number_id, release_snapshot_id, sequence_no);

CREATE TABLE IF NOT EXISTS bom_shared_structure_migration_issues (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  bom_draft_id TEXT REFERENCES bom_drafts(id) ON DELETE SET NULL,
  part_number_id TEXT REFERENCES part_numbers(id) ON DELETE SET NULL,
  issue_code TEXT NOT NULL CHECK (issue_code IN (
    'definition_backfill_ambiguous', 'owner_missing', 'cross_company', 'revision_lineage_conflict',
    'component_identity_ambiguous', 'logical_line_identity_conflict', 'review_snapshot_unavailable',
    'release_projection_unavailable', 'duplicate_current_binding', 'open_revision_conflict')),
  detail_json JSONB NOT NULL,
  issue_status TEXT NOT NULL DEFAULT 'open' CHECK (issue_status IN ('open', 'resolved')),
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bom_shared_migration_issues
  ON bom_shared_structure_migration_issues(issue_status, issue_code, company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_definition_revision
  ON bom_drafts(definition_id, upper(bom_revision)) WHERE definition_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_definition_one_open
  ON bom_drafts(definition_id) WHERE definition_id IS NOT NULL AND status IN ('Draft', 'Rejected', 'PendingReview', 'Archived');
CREATE INDEX IF NOT EXISTS idx_bom_drafts_definition_status ON bom_drafts(definition_id, status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_tree_logical_line
  ON bom_lines_tree(bom_draft_id, logical_line_id) WHERE logical_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_floating_logical_line
  ON bom_draft_floating_topics(bom_draft_id, logical_line_id) WHERE logical_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_review_shared_hash
  ON bom_review_requests(bom_draft_id, review_snapshot_hash) WHERE review_schema_version = 2 AND review_snapshot_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_release_definition_revision
  ON bom_release_snapshots(definition_id, upper(bom_revision)) WHERE definition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bom_release_definition_latest ON bom_release_snapshots(definition_id, released_at DESC);

CREATE OR REPLACE FUNCTION dev096_guard_review_evidence() RETURNS trigger AS $$
BEGIN
  IF OLD.review_schema_version = 2 AND (
    NEW.review_schema_version IS DISTINCT FROM OLD.review_schema_version OR
    NEW.definition_row_version IS DISTINCT FROM OLD.definition_row_version OR
    NEW.editor_version IS DISTINCT FROM OLD.editor_version OR
    NEW.review_snapshot_json IS DISTINCT FROM OLD.review_snapshot_json OR
    NEW.review_snapshot_hash IS DISTINCT FROM OLD.review_snapshot_hash
  ) THEN RAISE EXCEPTION 'DEV096_REVIEW_EVIDENCE_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bom_review_shared_evidence_immutable ON bom_review_requests;
CREATE TRIGGER trg_bom_review_shared_evidence_immutable BEFORE UPDATE ON bom_review_requests
  FOR EACH ROW EXECUTE FUNCTION dev096_guard_review_evidence();

CREATE OR REPLACE FUNCTION dev096_guard_release_evidence() RETURNS trigger AS $$
BEGIN
  IF OLD.snapshot_schema_version = 2 AND (
    NEW.definition_id IS DISTINCT FROM OLD.definition_id OR
    NEW.bom_revision IS DISTINCT FROM OLD.bom_revision OR
    NEW.line_snapshot_json IS DISTINCT FROM OLD.line_snapshot_json OR
    NEW.line_count IS DISTINCT FROM OLD.line_count OR
    NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version OR
    NEW.parent_snapshot_json IS DISTINCT FROM OLD.parent_snapshot_json OR
    NEW.mapping_snapshot_json IS DISTINCT FROM OLD.mapping_snapshot_json OR
    NEW.resolved_projection_json IS DISTINCT FROM OLD.resolved_projection_json OR
    NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
  ) THEN RAISE EXCEPTION 'DEV096_RELEASE_EVIDENCE_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bom_release_shared_evidence_immutable ON bom_release_snapshots;
CREATE TRIGGER trg_bom_release_shared_evidence_immutable BEFORE UPDATE ON bom_release_snapshots
  FOR EACH ROW EXECUTE FUNCTION dev096_guard_release_evidence();

CREATE OR REPLACE FUNCTION dev096_reject_immutable_child_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'DEV096_RELEASE_SNAPSHOT_IMMUTABLE'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bom_release_parent_snapshot_immutable ON bom_release_parent_snapshots;
CREATE TRIGGER trg_bom_release_parent_snapshot_immutable BEFORE UPDATE OR DELETE ON bom_release_parent_snapshots
  FOR EACH ROW EXECUTE FUNCTION dev096_reject_immutable_child_change();
DROP TRIGGER IF EXISTS trg_bom_release_resolved_line_immutable ON bom_release_resolved_lines;
CREATE TRIGGER trg_bom_release_resolved_line_immutable BEFORE UPDATE OR DELETE ON bom_release_resolved_lines
  FOR EACH ROW EXECUTE FUNCTION dev096_reject_immutable_child_change();

COMMIT;
