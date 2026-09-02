-- DEV-046 Cloud SQL candidate generated from db/postgres/042_status_data_rebuild.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-087 canonical workbench state authority.
-- Migration 041 is reserved for DEV-088. This migration is intentionally independent and may run after 040.

ALTER TABLE platform_command_receipts ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE platform_command_receipts ADD COLUMN IF NOT EXISTS effect_key TEXT;

-- DEV-087 keeps approved recognition evidence append-only, while allowing the
-- exact unapproved Drawing work revision to be removed inside its cancel transaction.
CREATE OR REPLACE FUNCTION dev068_reject_append_only_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cleanup_revision_id TEXT := current_setting('app.dev087_cancel_revision_id', true);
  row_session_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' AND COALESCE(cleanup_revision_id, '') <> '' THEN
    IF TG_TABLE_NAME IN ('drawing_recognition_sources', 'drawing_recognition_adapter_results', 'drawing_recognition_observations', 'drawing_recognition_decisions') THEN
      row_session_id := OLD.session_id;
    ELSIF TG_TABLE_NAME = 'drawing_recognition_candidate_observations' THEN
      SELECT candidate.session_id INTO row_session_id FROM drawing_recognition_candidates candidate WHERE candidate.id = OLD.candidate_id;
    END IF;
    IF row_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM drawing_recognition_sessions session
      JOIN drawing_revisions revision ON revision.id = session.drawing_revision_id
      WHERE session.id = row_session_id AND session.status = 'cancelled'
        AND session.source_context_type = 'drawing_revision'
        AND revision.id = cleanup_revision_id
        AND revision.lifecycle_state IN ('preparing', 'correction_required')
    ) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'DRAWING_RECOGNITION_APPEND_ONLY';
END;
$$;

CREATE TABLE IF NOT EXISTS pdm_workbench_state_authority_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('legacy_only', 'shadow_compare', 'cutover_window', 'canonical_only')),
  expected_commit TEXT NOT NULL DEFAULT '',
  schema_hash TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  switched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdm_workbench_aggregates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('drawing', 'part', 'relation')),
  canonical_entity_id TEXT NOT NULL,
  open_branch_count INTEGER NOT NULL DEFAULT 0 CHECK (open_branch_count BETWEEN 0 AND 3),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity_type, canonical_entity_id),
  CHECK (entity_type = 'drawing' OR open_branch_count = 0)
);

CREATE TABLE IF NOT EXISTS drawing_rd_branches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE RESTRICT,
  base_production_revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  latest_approved_revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'historical')),
  closed_reason TEXT CHECK (closed_reason IS NULL OR closed_reason IN ('production_promoted', 'latest_rd_voided')),
  closed_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE (company_id, id),
  CHECK (
    (status = 'open' AND closed_reason IS NULL AND closed_at IS NULL)
    OR (status = 'historical' AND closed_reason IS NOT NULL AND closed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS drawing_revision_claims (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES drawing_rd_branches(id) ON DELETE RESTRICT,
  target_major INTEGER NOT NULL CHECK (target_major >= 0),
  target_minor INTEGER NOT NULL CHECK (target_minor >= 0),
  target_label TEXT NOT NULL,
  predecessor_revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  claim_state TEXT NOT NULL DEFAULT 'work' CHECK (claim_state IN ('work', 'approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, drawing_id, target_major, target_minor),
  UNIQUE (company_id, id),
  CHECK (target_label = CASE WHEN target_minor = 0 THEN target_major::text ELSE target_major::text || '.' || target_minor::text END)
);

CREATE TABLE IF NOT EXISTS drawing_revision_works (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES drawing_rd_branches(id) ON DELETE RESTRICT,
  target_claim_id TEXT NOT NULL UNIQUE REFERENCES drawing_revision_claims(id) ON DELETE RESTRICT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_payload JSONB NOT NULL,
  base_hash TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, branch_id),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS drawing_revision_work_files (
  work_id TEXT NOT NULL REFERENCES drawing_revision_works(id) ON DELETE CASCADE,
  file_binding_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  content_hash TEXT NOT NULL,
  PRIMARY KEY (work_id, file_binding_id)
);

CREATE TABLE IF NOT EXISTS part_change_works (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_id TEXT NOT NULL REFERENCES part_numbers(id) ON DELETE RESTRICT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_payload JSONB NOT NULL,
  base_formal_row_version INTEGER,
  base_hash TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, part_id),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS relation_change_works (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  root_id TEXT NOT NULL REFERENCES part_roots(id) ON DELETE RESTRICT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_tree JSONB NOT NULL,
  proposed_tree_hash TEXT NOT NULL,
  base_formal_tree_hash TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, root_id),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS canonical_workbench_states (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('drawing', 'part', 'relation')),
  canonical_entity_id TEXT NOT NULL,
  data_layer TEXT NOT NULL CHECK (data_layer IN ('drawing_production', 'drawing_rd', 'part_formal', 'part_work', 'relation_formal', 'relation_work')),
  branch_id TEXT REFERENCES drawing_rd_branches(id) ON DELETE RESTRICT,
  revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  work_id TEXT,
  handling TEXT NOT NULL DEFAULT 'none' CHECK (handling IN ('none', 'owner', 'review_owner', 'system', 'system_admin', 'blocked')),
  blocker_reason TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((handling = 'blocked' AND blocker_reason IS NOT NULL) OR (handling <> 'blocked' AND blocker_reason IS NULL)),
  CHECK (
    (data_layer = 'drawing_production' AND entity_type = 'drawing' AND branch_id IS NULL AND revision_id IS NOT NULL AND work_id IS NULL)
    OR (data_layer = 'drawing_rd' AND entity_type = 'drawing' AND branch_id IS NOT NULL AND revision_id IS NOT NULL)
    OR (data_layer = 'part_formal' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NULL)
    OR (data_layer = 'part_work' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NOT NULL)
    OR (data_layer = 'relation_formal' AND entity_type = 'relation' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NULL)
    OR (data_layer = 'relation_work' AND entity_type = 'relation' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_workbench_drawing_production
  ON canonical_workbench_states(company_id, canonical_entity_id, data_layer) WHERE data_layer = 'drawing_production';
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_workbench_drawing_rd
  ON canonical_workbench_states(company_id, canonical_entity_id, branch_id) WHERE data_layer = 'drawing_rd';
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_workbench_part_layer
  ON canonical_workbench_states(company_id, canonical_entity_id, data_layer) WHERE data_layer IN ('part_formal', 'part_work');
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_workbench_relation_layer
  ON canonical_workbench_states(company_id, canonical_entity_id, data_layer) WHERE data_layer IN ('relation_formal', 'relation_work');
CREATE INDEX IF NOT EXISTS idx_canonical_workbench_list
  ON canonical_workbench_states(company_id, entity_type, data_layer, canonical_entity_id);

CREATE TABLE IF NOT EXISTS pdm_work_review_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('drawing_revision', 'drawing_rd_void', 'part_change', 'relation_change')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('drawing', 'part', 'relation')),
  canonical_entity_id TEXT NOT NULL,
  work_id TEXT,
  branch_id TEXT REFERENCES drawing_rd_branches(id) ON DELETE RESTRICT,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_cycle_id TEXT NOT NULL UNIQUE,
  snapshot_payload JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'applying', 'apply_failed')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (request_kind = 'drawing_rd_void' AND entity_type = 'drawing' AND work_id IS NULL AND branch_id IS NOT NULL)
    OR (request_kind <> 'drawing_rd_void' AND work_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pdm_work_review_active_work
  ON pdm_work_review_requests(company_id, work_id) WHERE work_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdm_work_review_active_void
  ON pdm_work_review_requests(company_id, branch_id) WHERE request_kind = 'drawing_rd_void';
CREATE INDEX IF NOT EXISTS idx_pdm_work_review_inbox
  ON pdm_work_review_requests(company_id, reviewer_user_id, request_status, created_at);
CREATE INDEX IF NOT EXISTS idx_pdm_work_review_retry
  ON pdm_work_review_requests(request_status, updated_at);

CREATE TABLE IF NOT EXISTS pdm_review_traces (
  review_cycle_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('drawing', 'part', 'relation')),
  canonical_entity_id TEXT NOT NULL,
  decision_at TIMESTAMPTZ NOT NULL
);

-- Minimal terminal receipt used only to make an already-open reviewer tab
-- deterministic after the active request is removed.
CREATE TABLE IF NOT EXISTS pdm_work_review_terminal_receipts (
  request_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pdm_work_review_terminal_receipts_company_time
  ON pdm_work_review_terminal_receipts(company_id, decided_at);

CREATE TABLE IF NOT EXISTS part_approved_change_snapshots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_id TEXT NOT NULL REFERENCES part_numbers(id) ON DELETE RESTRICT,
  before_payload JSONB NOT NULL,
  after_payload JSONB NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  formalized_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS relation_approved_change_snapshots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  root_id TEXT NOT NULL REFERENCES part_roots(id) ON DELETE RESTRICT,
  before_tree JSONB NOT NULL,
  after_tree JSONB NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  formalized_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pdm_workbench_migration_quarantine (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_kind TEXT NOT NULL,
  source_identity TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  evidence_payload JSONB NOT NULL,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  UNIQUE (source_kind, source_identity),
  CHECK ((resolution IS NULL AND resolved_at IS NULL) OR (resolution IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE OR REPLACE FUNCTION dev087_guard_company_reference() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'drawing_rd_branches' THEN
    IF NOT EXISTS (SELECT 1 FROM drawings d WHERE d.id = NEW.drawing_id AND d.company_id = NEW.company_id)
      OR (NEW.base_production_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.base_production_revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.drawing_id))
      OR (NEW.latest_approved_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.latest_approved_revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.drawing_id))
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'drawing_revision_claims' THEN
    IF NOT EXISTS (SELECT 1 FROM drawings d JOIN drawing_rd_branches b ON b.id = NEW.branch_id WHERE d.id = NEW.drawing_id AND d.company_id = NEW.company_id AND b.company_id = NEW.company_id AND b.drawing_id = NEW.drawing_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.predecessor_revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.drawing_id)
    THEN RAISE EXCEPTION 'DEV087_PREDECESSOR_REFERENCE_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'drawing_revision_works' THEN
    IF NOT EXISTS (SELECT 1 FROM drawing_rd_branches b JOIN drawing_revision_claims c ON c.id = NEW.target_claim_id WHERE b.id = NEW.branch_id AND b.company_id = NEW.company_id AND b.drawing_id = NEW.drawing_id AND c.company_id = NEW.company_id AND c.drawing_id = NEW.drawing_id AND c.branch_id = NEW.branch_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.owner_user_id AND u.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_OWNER_COMPANY_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'part_change_works' THEN
    IF NOT EXISTS (SELECT 1 FROM part_numbers p WHERE p.id = NEW.part_id AND p.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.owner_user_id AND u.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_OWNER_COMPANY_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'relation_change_works' THEN
    IF NOT EXISTS (SELECT 1 FROM part_roots r WHERE r.id = NEW.root_id AND r.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.owner_user_id AND u.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_OWNER_COMPANY_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'canonical_workbench_states' THEN
    IF (NEW.entity_type = 'drawing' AND NOT EXISTS (SELECT 1 FROM drawings d WHERE d.id = NEW.canonical_entity_id AND d.company_id = NEW.company_id))
      OR (NEW.entity_type = 'part' AND NOT EXISTS (SELECT 1 FROM part_numbers p WHERE p.id = NEW.canonical_entity_id AND p.company_id = NEW.company_id))
      OR (NEW.entity_type = 'relation' AND NOT EXISTS (SELECT 1 FROM part_roots r WHERE r.id = NEW.canonical_entity_id AND r.company_id = NEW.company_id))
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NEW.entity_type = 'drawing' AND (NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.canonical_entity_id) OR (NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_rd_branches b WHERE b.id = NEW.branch_id AND b.company_id = NEW.company_id AND b.drawing_id = NEW.canonical_entity_id)))
    THEN RAISE EXCEPTION 'DEV087_DRAWING_REFERENCE_MISMATCH'; END IF;
    IF NEW.work_id IS NOT NULL AND ((NEW.data_layer = 'drawing_rd' AND NOT EXISTS (SELECT 1 FROM drawing_revision_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.drawing_id = NEW.canonical_entity_id)) OR (NEW.data_layer = 'part_work' AND NOT EXISTS (SELECT 1 FROM part_change_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.part_id = NEW.canonical_entity_id)) OR (NEW.data_layer = 'relation_work' AND NOT EXISTS (SELECT 1 FROM relation_change_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.root_id = NEW.canonical_entity_id)))
    THEN RAISE EXCEPTION 'DEV087_WORK_REFERENCE_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'pdm_work_review_requests' THEN
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.reviewer_user_id AND u.company_id = NEW.company_id)
      OR (NEW.entity_type = 'drawing' AND NOT EXISTS (SELECT 1 FROM drawings d WHERE d.id = NEW.canonical_entity_id AND d.company_id = NEW.company_id))
      OR (NEW.entity_type = 'part' AND NOT EXISTS (SELECT 1 FROM part_numbers p WHERE p.id = NEW.canonical_entity_id AND p.company_id = NEW.company_id))
      OR (NEW.entity_type = 'relation' AND NOT EXISTS (SELECT 1 FROM part_roots r WHERE r.id = NEW.canonical_entity_id AND r.company_id = NEW.company_id))
    THEN RAISE EXCEPTION 'DEV087_REVIEW_REFERENCE_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev087_branch_company_guard ON drawing_rd_branches;
CREATE TRIGGER trg_dev087_branch_company_guard BEFORE INSERT OR UPDATE ON drawing_rd_branches
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();
DROP TRIGGER IF EXISTS trg_dev087_claim_company_guard ON drawing_revision_claims;
CREATE TRIGGER trg_dev087_claim_company_guard BEFORE INSERT OR UPDATE ON drawing_revision_claims
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();
DROP TRIGGER IF EXISTS trg_dev087_drawing_work_company_guard ON drawing_revision_works;
CREATE TRIGGER trg_dev087_drawing_work_company_guard BEFORE INSERT OR UPDATE ON drawing_revision_works
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();
DROP TRIGGER IF EXISTS trg_dev087_part_work_company_guard ON part_change_works;
CREATE TRIGGER trg_dev087_part_work_company_guard BEFORE INSERT OR UPDATE ON part_change_works
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();
DROP TRIGGER IF EXISTS trg_dev087_relation_work_company_guard ON relation_change_works;
CREATE TRIGGER trg_dev087_relation_work_company_guard BEFORE INSERT OR UPDATE ON relation_change_works
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();
DROP TRIGGER IF EXISTS trg_dev087_canonical_state_company_guard ON canonical_workbench_states;
CREATE TRIGGER trg_dev087_canonical_state_company_guard BEFORE INSERT OR UPDATE ON canonical_workbench_states
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();
DROP TRIGGER IF EXISTS trg_dev087_review_request_company_guard ON pdm_work_review_requests;
CREATE TRIGGER trg_dev087_review_request_company_guard BEFORE INSERT ON pdm_work_review_requests
FOR EACH ROW EXECUTE FUNCTION dev087_guard_company_reference();

CREATE OR REPLACE FUNCTION dev087_protect_review_request_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.company_id, OLD.request_kind, OLD.entity_type, OLD.canonical_entity_id, OLD.work_id, OLD.branch_id, OLD.reviewer_user_id, OLD.review_cycle_id, OLD.snapshot_payload, OLD.snapshot_hash)
    IS DISTINCT FROM ROW(NEW.company_id, NEW.request_kind, NEW.entity_type, NEW.canonical_entity_id, NEW.work_id, NEW.branch_id, NEW.reviewer_user_id, NEW.review_cycle_id, NEW.snapshot_payload, NEW.snapshot_hash)
  THEN RAISE EXCEPTION 'DEV087_REVIEW_REQUEST_IDENTITY_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dev087_review_request_identity ON pdm_work_review_requests;
CREATE TRIGGER trg_dev087_review_request_identity BEFORE UPDATE ON pdm_work_review_requests
FOR EACH ROW EXECUTE FUNCTION dev087_protect_review_request_identity();

CREATE OR REPLACE FUNCTION dev087_forbid_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DEV087_IMMUTABLE_EVIDENCE';
END;
$$;

DROP TRIGGER IF EXISTS trg_pdm_review_traces_immutable ON pdm_review_traces;
CREATE TRIGGER trg_pdm_review_traces_immutable BEFORE UPDATE OR DELETE ON pdm_review_traces
FOR EACH ROW EXECUTE FUNCTION dev087_forbid_immutable_mutation();
DROP TRIGGER IF EXISTS trg_pdm_work_review_terminal_receipts_immutable ON pdm_work_review_terminal_receipts;
CREATE TRIGGER trg_pdm_work_review_terminal_receipts_immutable BEFORE UPDATE OR DELETE ON pdm_work_review_terminal_receipts
FOR EACH ROW EXECUTE FUNCTION dev087_forbid_immutable_mutation();
DROP TRIGGER IF EXISTS trg_part_approved_snapshots_immutable ON part_approved_change_snapshots;
CREATE TRIGGER trg_part_approved_snapshots_immutable BEFORE UPDATE OR DELETE ON part_approved_change_snapshots
FOR EACH ROW EXECUTE FUNCTION dev087_forbid_immutable_mutation();
DROP TRIGGER IF EXISTS trg_relation_approved_snapshots_immutable ON relation_approved_change_snapshots;
CREATE TRIGGER trg_relation_approved_snapshots_immutable BEFORE UPDATE OR DELETE ON relation_approved_change_snapshots
FOR EACH ROW EXECUTE FUNCTION dev087_forbid_immutable_mutation();

CREATE OR REPLACE FUNCTION dev087_protect_approved_claim() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.claim_state = 'approved' THEN RAISE EXCEPTION 'DEV087_APPROVED_CLAIM_IMMUTABLE'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_drawing_revision_claims_approved_immutable ON drawing_revision_claims;
CREATE TRIGGER trg_drawing_revision_claims_approved_immutable BEFORE UPDATE OR DELETE ON drawing_revision_claims
FOR EACH ROW EXECUTE FUNCTION dev087_protect_approved_claim();

INSERT INTO pdm_workbench_state_authority_control (id, mode, expected_commit, schema_hash)
VALUES (1, 'legacy_only', '', 'dev087-v1')
ON CONFLICT (id) DO NOTHING;
