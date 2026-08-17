-- DEV-064: one canonical Drawing / DrawingRevision / DrawingRevisionFile
-- authority across preparation, review, controlled and released states.
-- Existing candidate/formal tables remain compatibility projections.

CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_number TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'building'
    CHECK (lifecycle_state IN (
      'building', 'drawing_preparation', 'bundle_ready', 'in_review',
      'auto_finalizing', 'recovery_required', 'rd_controlled', 'released',
      'obsolete', 'merged', 'cancelled'
    )),
  workspace_id TEXT REFERENCES numbering_draft_workspaces(id) ON DELETE RESTRICT,
  drawing_draft_id TEXT UNIQUE REFERENCES numbering_draft_drawings(id) ON DELETE RESTRICT,
  candidate_reservation_id TEXT UNIQUE REFERENCES number_candidate_reservations(id) ON DELETE RESTRICT,
  formal_drawing_number_id TEXT UNIQUE REFERENCES drawing_numbers(id) ON DELETE RESTRICT,
  part_root_id TEXT REFERENCES part_roots(id) ON DELETE RESTRICT,
  purpose_code TEXT CHECK (purpose_code IS NULL OR purpose_code IN ('MA', 'OT', 'M', 'R')),
  purpose_description TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER CHECK (sequence_no IS NULL OR sequence_no > 0),
  is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
  owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  rule_version_id TEXT REFERENCES numbering_rule_versions(id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  controlled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  UNIQUE (company_id, drawing_number)
);

CREATE INDEX IF NOT EXISTS idx_drawings_company_lifecycle
  ON drawings(company_id, lifecycle_state, drawing_number, id);
CREATE INDEX IF NOT EXISTS idx_drawings_workspace
  ON drawings(company_id, workspace_id, drawing_draft_id);

CREATE TABLE IF NOT EXISTS drawing_revisions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE RESTRICT,
  revision TEXT NOT NULL CHECK (length(trim(revision)) > 0),
  lifecycle_state TEXT NOT NULL DEFAULT 'preparing'
    CHECK (lifecycle_state IN (
      'preparing', 'in_review', 'correction_required', 'rd_controlled',
      'released', 'superseded', 'cancelled'
    )),
  policy_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  override_reason TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  approval_request_id TEXT REFERENCES approval_platform_requests(id) ON DELETE RESTRICT,
  review_snapshot_hash TEXT,
  source_candidate_revision_id TEXT UNIQUE REFERENCES numbering_candidate_revision_drafts(id) ON DELETE RESTRICT,
  source_revision_package_id TEXT UNIQUE REFERENCES drawing_revision_packages(id) ON DELETE RESTRICT,
  created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  controlled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drawing_revisions_current
  ON drawing_revisions(company_id, drawing_id, lifecycle_state, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS drawing_revision_files (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_revision_id TEXT NOT NULL REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  source_file_asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT,
  source_candidate_file_id TEXT UNIQUE REFERENCES numbering_candidate_revision_files(id) ON DELETE RESTRICT,
  source_package_file_id TEXT UNIQUE REFERENCES drawing_revision_package_files(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('cad_3d', 'drawing_2d', 'intermediate', 'pdf', 'dwg_dxf', 'other')),
  role_source TEXT NOT NULL CHECK (role_source IN ('extension', 'user', 'migration', 'system')),
  display_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  removed_at TIMESTAMPTZ,
  removed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (drawing_revision_id, source_file_asset_id),
  CHECK (
    (removed_at IS NULL AND removed_by IS NULL)
    OR (removed_at IS NOT NULL AND removed_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_drawing_revision_files_revision
  ON drawing_revision_files(company_id, drawing_revision_id, removed_at, sort_order, id);

-- Backfill draft-origin identities first. A promoted drawing keeps this ID.
INSERT INTO drawings (
  id, company_id, drawing_number, lifecycle_state, workspace_id, drawing_draft_id,
  candidate_reservation_id, formal_drawing_number_id, part_root_id, purpose_code,
  purpose_description, sequence_no, is_primary_manufacturing, owner_id,
  rule_version_id, row_version, created_by, created_at, updated_at
)
SELECT
  'drawing-' || draft.id,
  draft.company_id,
  reservation.candidate_code,
  'building',
  draft.workspace_id,
  draft.id,
  reservation.id,
  COALESCE(candidate.formal_drawing_number_id,
    CASE WHEN reservation.promoted_master_type = 'drawing_number' THEN reservation.promoted_master_id END),
  formal.part_root_id,
  draft.purpose_code,
  draft.purpose_description,
  reservation.sequence_no,
  draft.is_primary_manufacturing,
  workspace.owner_id,
  formal.rule_version_id,
  1,
  workspace.created_by,
  workspace.created_at,
  GREATEST(workspace.updated_at, draft.updated_at, COALESCE(reservation.updated_at, draft.updated_at))
FROM numbering_draft_drawings draft
JOIN numbering_draft_workspaces workspace
  ON workspace.id = draft.workspace_id AND workspace.company_id = draft.company_id
LEFT JOIN number_candidate_reservations reservation
  ON reservation.id = draft.candidate_reservation_id AND reservation.company_id = draft.company_id
LEFT JOIN numbering_candidate_revision_drafts candidate
  ON candidate.drawing_draft_id = draft.id AND candidate.company_id = draft.company_id
LEFT JOIN drawing_numbers formal
  ON formal.id = COALESCE(candidate.formal_drawing_number_id,
    CASE WHEN reservation.promoted_master_type = 'drawing_number' THEN reservation.promoted_master_id END)
ON CONFLICT (id) DO NOTHING;

-- Formal-only identities, plus the formal pointer for promoted draft identities.
INSERT INTO drawings (
  id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id,
  part_root_id, purpose_code, purpose_description, sequence_no,
  is_primary_manufacturing, rule_version_id, row_version, created_by, created_at, updated_at
)
SELECT
  COALESCE('drawing-' || reservation.draft_item_id, 'drawing-formal-' || formal.id),
  formal.company_id,
  formal.drawing_number,
  'building',
  formal.id,
  formal.part_root_id,
  formal.purpose_code,
  formal.purpose_description,
  formal.sequence_no,
  formal.is_primary_manufacturing,
  formal.rule_version_id,
  1,
  formal.created_by,
  formal.created_at,
  formal.updated_at
FROM drawing_numbers formal
LEFT JOIN number_candidate_reservations reservation
  ON reservation.company_id = formal.company_id
 AND reservation.promoted_master_type = 'drawing_number'
 AND reservation.promoted_master_id = formal.id
ON CONFLICT (company_id, drawing_number) DO UPDATE SET
  formal_drawing_number_id = EXCLUDED.formal_drawing_number_id,
  part_root_id = EXCLUDED.part_root_id,
  purpose_code = EXCLUDED.purpose_code,
  purpose_description = EXCLUDED.purpose_description,
  sequence_no = EXCLUDED.sequence_no,
  is_primary_manufacturing = EXCLUDED.is_primary_manufacturing,
  rule_version_id = EXCLUDED.rule_version_id,
  updated_at = GREATEST(drawings.updated_at, EXCLUDED.updated_at);

-- Insert revisions as preparing so immutable-file guards can be installed after
-- the file relationship backfill.
INSERT INTO drawing_revisions (
  id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
  override_reason, row_version, approval_request_id, review_snapshot_hash,
  source_candidate_revision_id, source_revision_package_id, created_by,
  created_at, updated_by, updated_at, submitted_at, controlled_at, released_at, cancelled_at
)
SELECT
  'drawing-revision-' || candidate.id,
  candidate.company_id,
  drawing.id,
  candidate.revision,
  'preparing',
  candidate.policy_snapshot_json::jsonb,
  candidate.override_reason,
  candidate.row_version,
  candidate.approval_request_id,
  candidate.review_snapshot_hash,
  candidate.id,
  candidate.formal_revision_package_id,
  candidate.created_by,
  candidate.created_at,
  candidate.updated_by,
  candidate.updated_at,
  CASE WHEN candidate.lifecycle_status = 'review_locked' THEN candidate.updated_at END,
  candidate.promoted_at,
  package.released_at,
  candidate.cancelled_at
FROM numbering_candidate_revision_drafts candidate
JOIN drawings drawing
  ON drawing.company_id = candidate.company_id AND drawing.drawing_draft_id = candidate.drawing_draft_id
LEFT JOIN drawing_revision_packages package ON package.id = candidate.formal_revision_package_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO drawing_revisions (
  id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
  row_version, source_revision_package_id, created_by, created_at, updated_by,
  updated_at, submitted_at, controlled_at, released_at, cancelled_at
)
SELECT
  COALESCE('drawing-revision-' || candidate.id, 'drawing-revision-package-' || package.id),
  package.company_id,
  drawing.id,
  package.revision,
  'preparing',
  COALESCE(package.snapshot_json::jsonb, '{}'::jsonb),
  1,
  package.id,
  package.created_by,
  package.created_at,
  package.created_by,
  package.updated_at,
  package.submitted_at,
  CASE WHEN package.lifecycle_state = 'rd_controlled' THEN package.updated_at END,
  package.released_at,
  package.cancelled_at
FROM drawing_revision_packages package
JOIN drawings drawing
  ON drawing.company_id = package.company_id AND drawing.formal_drawing_number_id = package.drawing_number_id
LEFT JOIN numbering_candidate_revision_drafts candidate
  ON candidate.formal_revision_package_id = package.id AND candidate.company_id = package.company_id
ON CONFLICT (id) DO UPDATE SET
  source_revision_package_id = EXCLUDED.source_revision_package_id,
  updated_at = GREATEST(drawing_revisions.updated_at, EXCLUDED.updated_at);

INSERT INTO drawing_revision_files (
  id, company_id, drawing_revision_id, source_file_asset_id, source_candidate_file_id,
  role, role_source, display_name, description, sort_order, is_primary,
  removed_at, removed_by, created_by, created_at, updated_at
)
SELECT
  'drawing-revision-file-' || file.id,
  file.company_id,
  revision.id,
  file.source_file_asset_id,
  file.id,
  file.role,
  file.role_source,
  file.display_name,
  file.description,
  file.sort_order,
  file.is_primary,
  file.removed_at,
  file.removed_by,
  file.created_by,
  file.created_at,
  file.updated_at
FROM numbering_candidate_revision_files file
JOIN drawing_revisions revision ON revision.source_candidate_revision_id = file.candidate_revision_id
ON CONFLICT (drawing_revision_id, source_file_asset_id) DO NOTHING;

INSERT INTO drawing_revision_files (
  id, company_id, drawing_revision_id, source_file_asset_id, source_package_file_id,
  role, role_source, display_name, description, sort_order, is_primary,
  created_by, created_at, updated_at
)
SELECT
  'drawing-revision-package-file-' || file.id,
  revision.company_id,
  revision.id,
  file.source_file_asset_id,
  file.id,
  file.role,
  file.role_source,
  file.display_name,
  file.description,
  file.sort_order,
  file.is_primary,
  file.created_by,
  file.created_at,
  file.created_at
FROM drawing_revision_package_files file
JOIN drawing_revisions revision ON revision.source_revision_package_id = file.package_id
ON CONFLICT (drawing_revision_id, source_file_asset_id) DO UPDATE SET
  source_package_file_id = EXCLUDED.source_package_file_id;

UPDATE drawing_revisions revision
SET lifecycle_state = CASE
      WHEN candidate.lifecycle_status = 'review_locked' THEN 'in_review'
      WHEN candidate.lifecycle_status = 'cancelled' THEN 'cancelled'
      WHEN package.lifecycle_state = 'released' OR package.status = 'Released' THEN 'released'
      WHEN package.lifecycle_state = 'rd_controlled' OR candidate.lifecycle_status = 'promoted' THEN 'rd_controlled'
      WHEN package.lifecycle_state = 'correction_required' OR package.status = 'Rejected' THEN 'correction_required'
      WHEN package.lifecycle_state = 'in_review' OR package.status = 'Pending' THEN 'in_review'
      WHEN package.status = 'Cancelled' THEN 'cancelled'
      ELSE 'preparing'
    END
FROM drawings drawing
LEFT JOIN numbering_candidate_revision_drafts candidate
  ON candidate.id = revision.source_candidate_revision_id
LEFT JOIN drawing_revision_packages package
  ON package.id = revision.source_revision_package_id
WHERE drawing.id = revision.drawing_id;

WITH latest_revision AS (
  SELECT DISTINCT ON (item.drawing_id)
    item.drawing_id,
    item.id,
    item.lifecycle_state,
    item.controlled_at,
    item.released_at
  FROM drawing_revisions item
  ORDER BY item.drawing_id, item.updated_at DESC, item.id DESC
), projection AS (
  SELECT
    drawing.id,
    drawing.candidate_reservation_id,
    drawing.updated_at,
    workspace.lifecycle_status AS workspace_lifecycle_status,
    formal.id AS formal_id,
    formal.record_status AS formal_record_status,
    revision.id AS revision_id,
    revision.lifecycle_state AS revision_lifecycle_state,
    revision.controlled_at AS revision_controlled_at,
    revision.released_at AS revision_released_at
  FROM drawings drawing
  LEFT JOIN numbering_draft_workspaces workspace ON workspace.id = drawing.workspace_id
  LEFT JOIN drawing_numbers formal ON formal.id = drawing.formal_drawing_number_id
  LEFT JOIN latest_revision revision ON revision.drawing_id = drawing.id
)
UPDATE drawings target
SET lifecycle_state = CASE
      WHEN projection.formal_record_status = 'Obsolete' THEN 'obsolete'
      WHEN projection.formal_record_status = 'Merged' THEN 'merged'
      WHEN projection.formal_record_status = 'Released' OR projection.revision_lifecycle_state = 'released' THEN 'released'
      WHEN projection.revision_lifecycle_state = 'rd_controlled' OR projection.formal_id IS NOT NULL THEN 'rd_controlled'
      WHEN projection.workspace_lifecycle_status = 'cancelled' THEN 'cancelled'
      WHEN projection.revision_lifecycle_state = 'in_review' THEN 'in_review'
      WHEN projection.revision_lifecycle_state = 'correction_required' THEN 'drawing_preparation'
      WHEN projection.revision_id IS NOT NULL OR projection.candidate_reservation_id IS NOT NULL THEN 'drawing_preparation'
      ELSE 'building'
    END,
    controlled_at = COALESCE(target.controlled_at, projection.revision_controlled_at),
    released_at = COALESCE(target.released_at, projection.revision_released_at),
    terminal_at = CASE
      WHEN projection.formal_record_status IN ('Obsolete', 'Merged') OR projection.workspace_lifecycle_status = 'cancelled'
      THEN COALESCE(target.terminal_at, projection.updated_at)
      ELSE target.terminal_at
    END
FROM projection
WHERE projection.id = target.id;

CREATE OR REPLACE FUNCTION pdm_guard_drawing_terminal_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifecycle_state IN ('obsolete', 'merged', 'cancelled') AND NEW.lifecycle_state <> OLD.lifecycle_state THEN
    RAISE EXCEPTION 'DRAWING_TERMINAL_STATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawings_terminal_state_guard ON drawings;
CREATE TRIGGER trg_drawings_terminal_state_guard
BEFORE UPDATE OF lifecycle_state ON drawings
FOR EACH ROW EXECUTE FUNCTION pdm_guard_drawing_terminal_state();

CREATE OR REPLACE FUNCTION pdm_guard_drawing_number_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.drawing_number IS NOT NULL AND NEW.drawing_number IS DISTINCT FROM OLD.drawing_number THEN
    RAISE EXCEPTION 'DRAWING_NUMBER_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawings_number_immutable_guard ON drawings;
CREATE TRIGGER trg_drawings_number_immutable_guard
BEFORE UPDATE OF drawing_number ON drawings
FOR EACH ROW EXECUTE FUNCTION pdm_guard_drawing_number_immutable();

CREATE OR REPLACE FUNCTION pdm_guard_controlled_drawing_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.lifecycle_state IN ('rd_controlled', 'released', 'superseded') THEN
      RAISE EXCEPTION 'DRAWING_REVISION_CONTROLLED_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.lifecycle_state IN ('rd_controlled', 'released', 'superseded') AND (
    NEW.revision IS DISTINCT FROM OLD.revision OR
    NEW.policy_snapshot_json IS DISTINCT FROM OLD.policy_snapshot_json OR
    NEW.override_reason IS DISTINCT FROM OLD.override_reason OR
    NEW.drawing_id IS DISTINCT FROM OLD.drawing_id
  ) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_CONTROLLED_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_revisions_controlled_content_guard ON drawing_revisions;
CREATE TRIGGER trg_drawing_revisions_controlled_content_guard
BEFORE UPDATE OF revision, policy_snapshot_json, override_reason, drawing_id ON drawing_revisions
FOR EACH ROW EXECUTE FUNCTION pdm_guard_controlled_drawing_revision();

DROP TRIGGER IF EXISTS trg_drawing_revisions_controlled_delete_guard ON drawing_revisions;
CREATE TRIGGER trg_drawing_revisions_controlled_delete_guard
BEFORE DELETE ON drawing_revisions
FOR EACH ROW EXECUTE FUNCTION pdm_guard_controlled_drawing_revision();

CREATE OR REPLACE FUNCTION pdm_guard_drawing_revision_state_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle_state <> OLD.lifecycle_state AND NOT (
    (OLD.lifecycle_state = 'preparing' AND NEW.lifecycle_state IN ('in_review', 'correction_required', 'rd_controlled', 'released', 'cancelled')) OR
    (OLD.lifecycle_state = 'in_review' AND NEW.lifecycle_state IN ('preparing', 'correction_required', 'rd_controlled', 'released', 'cancelled')) OR
    (OLD.lifecycle_state = 'correction_required' AND NEW.lifecycle_state IN ('preparing', 'in_review', 'rd_controlled', 'cancelled')) OR
    (OLD.lifecycle_state = 'rd_controlled' AND NEW.lifecycle_state IN ('released', 'superseded')) OR
    (OLD.lifecycle_state = 'released' AND NEW.lifecycle_state = 'superseded')
  ) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STATE_TRANSITION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_revisions_state_transition_guard ON drawing_revisions;
CREATE TRIGGER trg_drawing_revisions_state_transition_guard
BEFORE UPDATE OF lifecycle_state ON drawing_revisions
FOR EACH ROW EXECUTE FUNCTION pdm_guard_drawing_revision_state_transition();

CREATE OR REPLACE FUNCTION pdm_guard_controlled_drawing_revision_file()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_revision_id TEXT;
BEGIN
  target_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.drawing_revision_id ELSE NEW.drawing_revision_id END;
  IF EXISTS (
    SELECT 1 FROM drawing_revisions revision
    WHERE revision.id IN (target_revision_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.drawing_revision_id ELSE target_revision_id END)
      AND revision.lifecycle_state IN ('rd_controlled', 'released', 'superseded')
  ) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_FILES_CONTROLLED_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_revision_files_controlled_insert_guard ON drawing_revision_files;
CREATE TRIGGER trg_drawing_revision_files_controlled_insert_guard
BEFORE INSERT ON drawing_revision_files
FOR EACH ROW EXECUTE FUNCTION pdm_guard_controlled_drawing_revision_file();

DROP TRIGGER IF EXISTS trg_drawing_revision_files_controlled_update_guard ON drawing_revision_files;
CREATE TRIGGER trg_drawing_revision_files_controlled_update_guard
BEFORE UPDATE OF drawing_revision_id, source_file_asset_id, role, role_source,
  display_name, description, sort_order, is_primary, removed_at, removed_by
ON drawing_revision_files
FOR EACH ROW EXECUTE FUNCTION pdm_guard_controlled_drawing_revision_file();

DROP TRIGGER IF EXISTS trg_drawing_revision_files_controlled_delete_guard ON drawing_revision_files;
CREATE TRIGGER trg_drawing_revision_files_controlled_delete_guard
BEFORE DELETE ON drawing_revision_files
FOR EACH ROW EXECUTE FUNCTION pdm_guard_controlled_drawing_revision_file();
