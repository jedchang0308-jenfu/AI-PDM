-- DEV-046 Cloud SQL candidate generated from db/postgres/048_shared_assembly_bom.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-096: additive shared assembly BOM authority. Capability remains default-off.
-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:2

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev096:shared-assembly-bom-v1'));

ALTER TABLE part_numbers ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'single_part';
ALTER TABLE part_numbers DROP CONSTRAINT IF EXISTS part_numbers_structure_type_check;
ALTER TABLE part_numbers ADD CONSTRAINT part_numbers_structure_type_check
  CHECK (structure_type IN ('single_part', 'assembly', 'unclassified'));
ALTER TABLE part_numbers ADD COLUMN IF NOT EXISTS bom_usage_policy TEXT NOT NULL DEFAULT 'undecided'
  CHECK (bom_usage_policy IN ('undecided', 'not_required', 'available', 'restricted', 'obsolete'));

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

-- Production applied the historical full BOM retirement under version 047.
-- Recreate the current manual/shared BOM foundation without restoring retired
-- CAD/XLS intake data. CREATE TABLE IF NOT EXISTS keeps fresh/current schemas
-- byte-compatible while repairing the verified production schema gap.
CREATE TABLE IF NOT EXISTS bom_headers (
  id TEXT PRIMARY KEY,
  parent_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  parent_submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  parent_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'ReleasedSnapshot')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'imported')),
  line_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id TEXT PRIMARY KEY,
  bom_header_id TEXT NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  child_part_number TEXT NOT NULL,
  child_revision TEXT,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (quantity > 0),
  source_file_id TEXT REFERENCES submission_files(id) ON DELETE SET NULL,
  source_reference_id TEXT REFERENCES file_references(id) ON DELETE SET NULL,
  source_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bom_header_id, line_no)
);

CREATE TABLE IF NOT EXISTS bom_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id),
  owner_part_number_id TEXT REFERENCES part_numbers(id),
  bom_revision TEXT,
  source_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  identity_authority TEXT NOT NULL DEFAULT 'canonical_part_number'
    CHECK (identity_authority IN ('canonical_part_number', 'legacy_submission_bound', 'manual_review')),
  parent_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  parent_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  parent_revision TEXT,
  draft_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'PendingReview', 'Rejected', 'Released', 'Obsolete', 'Archived')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source = 'manual'),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  line_count INTEGER NOT NULL DEFAULT 0,
  review_attempt INTEGER NOT NULL DEFAULT 0,
  editor_version INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_lines_tree (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  parent_line_id TEXT REFERENCES bom_lines_tree(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('item', 'group')),
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  part_number TEXT,
  revision TEXT,
  group_name TEXT,
  quantity DOUBLE PRECISION CHECK (quantity IS NULL OR quantity > 0),
  sequence_no INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source = 'manual'),
  source_priority INTEGER NOT NULL DEFAULT 30,
  source_ref_id TEXT,
  source_filename TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (node_type = 'item' AND part_number IS NOT NULL AND trim(part_number) <> '' AND quantity IS NOT NULL)
    OR (node_type = 'group' AND group_name IS NOT NULL AND trim(group_name) <> '' AND quantity IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS bom_draft_floating_topics (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  parent_floating_topic_id TEXT REFERENCES bom_draft_floating_topics(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('item', 'group')),
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  part_number TEXT,
  revision TEXT,
  group_name TEXT,
  quantity DOUBLE PRECISION CHECK (quantity IS NULL OR quantity > 0),
  sequence_no INTEGER NOT NULL,
  root_position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  root_position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source = 'manual'),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (node_type = 'item' AND part_number IS NOT NULL AND trim(part_number) <> '' AND quantity IS NOT NULL)
    OR (node_type = 'group' AND group_name IS NOT NULL AND trim(group_name) <> '' AND quantity IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS bom_edit_events (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_review_requests (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PendingReview'
    CHECK (status IN ('PendingReview', 'Approved', 'Rejected', 'Cancelled')),
  lifecycle_action TEXT NOT NULL DEFAULT 'release' CHECK (lifecycle_action IN ('release', 'obsolete')),
  submitted_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  change_reason TEXT NOT NULL,
  decision_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bom_release_snapshots (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id),
  company_id TEXT REFERENCES companies(id),
  owner_part_number_id TEXT REFERENCES part_numbers(id),
  bom_revision TEXT,
  source_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  parent_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  parent_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  parent_revision TEXT,
  line_snapshot_json TEXT NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  released_by TEXT NOT NULL REFERENCES users(id),
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  obsolete_at TIMESTAMPTZ,
  obsolete_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_create_effects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES bom_drafts(id),
  outcome_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS bom_reconfirmation_flags (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-jenfu' REFERENCES companies(id),
  bom_draft_id TEXT NOT NULL REFERENCES bom_drafts(id) ON DELETE CASCADE,
  old_part_number_id TEXT NOT NULL REFERENCES part_numbers(id),
  new_part_number_id TEXT NOT NULL REFERENCES part_numbers(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id)
);

-- Retire only the obsolete CAD/XLS intake. This is intentionally safe when the
-- historical production 047 already removed every BOM table and row.
DELETE FROM bom_create_effects effect
USING bom_drafts draft
WHERE effect.draft_id = draft.id
  AND draft.source IN ('cad_reference', 'solidworks_xls');
DELETE FROM bom_release_snapshots snapshot
USING bom_drafts draft
WHERE snapshot.bom_draft_id = draft.id
  AND draft.source IN ('cad_reference', 'solidworks_xls');
DELETE FROM bom_drafts WHERE source IN ('cad_reference', 'solidworks_xls');
DELETE FROM bom_headers WHERE source = 'cad_references';
DELETE FROM file_references WHERE reference_type = 'assembly_component';

DROP INDEX IF EXISTS idx_bom_import_jobs_parent_submission_id;
DROP TABLE IF EXISTS bom_import_jobs;
DROP TABLE IF EXISTS bom_import_profiles;

ALTER TABLE bom_drafts DROP CONSTRAINT IF EXISTS bom_drafts_source_revision_package_fk;
ALTER TABLE bom_drafts DROP COLUMN IF EXISTS source_revision_package_id;
ALTER TABLE bom_release_snapshots DROP COLUMN IF EXISTS source_revision_package_id;

ALTER TABLE file_references DROP CONSTRAINT IF EXISTS file_references_reference_type_check;
ALTER TABLE file_references ADD CONSTRAINT file_references_reference_type_check
  CHECK (reference_type IN ('drawing_model', 'derived', 'unknown'));
ALTER TABLE bom_headers DROP CONSTRAINT IF EXISTS bom_headers_source_check;
ALTER TABLE bom_headers ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_headers ADD CONSTRAINT bom_headers_source_check CHECK (source IN ('manual', 'imported'));
ALTER TABLE bom_drafts DROP CONSTRAINT IF EXISTS bom_drafts_source_check;
ALTER TABLE bom_drafts ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_drafts ALTER COLUMN identity_authority SET DEFAULT 'canonical_part_number';
ALTER TABLE bom_drafts ADD CONSTRAINT bom_drafts_source_check CHECK (source = 'manual');
UPDATE bom_lines_tree SET source = 'manual', source_priority = 30
WHERE source <> 'manual' OR source_priority <> 30;
ALTER TABLE bom_lines_tree DROP CONSTRAINT IF EXISTS bom_lines_tree_source_check;
ALTER TABLE bom_lines_tree ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_lines_tree ALTER COLUMN source_priority SET DEFAULT 30;
ALTER TABLE bom_lines_tree ADD CONSTRAINT bom_lines_tree_source_check CHECK (source = 'manual');
UPDATE bom_draft_floating_topics SET source = 'manual' WHERE source <> 'manual';
ALTER TABLE bom_draft_floating_topics DROP CONSTRAINT IF EXISTS bom_draft_floating_topics_source_check;
ALTER TABLE bom_draft_floating_topics ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE bom_draft_floating_topics ADD CONSTRAINT bom_draft_floating_topics_source_check CHECK (source = 'manual');

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_one_active
  ON bom_drafts(parent_item_id, parent_revision) WHERE is_active = 1 AND status IN ('Draft', 'Rejected');
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_one_pending_review
  ON bom_drafts(parent_item_id, parent_revision) WHERE status = 'PendingReview';
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_canonical_one_active
  ON bom_drafts(owner_part_number_id, bom_revision)
  WHERE owner_part_number_id IS NOT NULL AND bom_revision IS NOT NULL AND is_active = 1 AND status IN ('Draft', 'Rejected');
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_canonical_one_pending_review
  ON bom_drafts(owner_part_number_id, bom_revision)
  WHERE owner_part_number_id IS NOT NULL AND bom_revision IS NOT NULL AND status = 'PendingReview';
CREATE INDEX IF NOT EXISTS idx_bom_headers_parent_item_id ON bom_headers(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_parent_submission_id ON bom_headers(parent_submission_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_header_id ON bom_lines(bom_header_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_child_part_number ON bom_lines(child_part_number);
CREATE INDEX IF NOT EXISTS idx_bom_lines_child_part_revision ON bom_lines(child_part_number, child_revision);
CREATE INDEX IF NOT EXISTS idx_bom_drafts_parent_submission_id ON bom_drafts(parent_submission_id, status, is_active);
CREATE INDEX IF NOT EXISTS idx_bom_drafts_parent_item_revision ON bom_drafts(parent_item_id, parent_revision, status);
CREATE INDEX IF NOT EXISTS idx_bom_lines_tree_draft_parent ON bom_lines_tree(bom_draft_id, parent_line_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_bom_lines_tree_part_revision ON bom_lines_tree(part_number, revision);
CREATE INDEX IF NOT EXISTS idx_bom_draft_floating_topics_draft_parent
  ON bom_draft_floating_topics(bom_draft_id, parent_floating_topic_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_bom_edit_events_draft_id ON bom_edit_events(bom_draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_review_requests_draft_status ON bom_review_requests(bom_draft_id, status);
CREATE INDEX IF NOT EXISTS idx_bom_release_snapshots_parent_item_revision
  ON bom_release_snapshots(parent_item_id, parent_revision, released_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_reconfirmation_flags_open
  ON bom_reconfirmation_flags(company_id, bom_draft_id, resolved_at);

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

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:483
