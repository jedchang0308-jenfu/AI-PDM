BEGIN;

CREATE TABLE IF NOT EXISTS numbering_draft_workspaces (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  draft_mode TEXT NOT NULL CHECK (draft_mode IN ('new_bundle', 'append_drawing', 'append_part', 'append_drawing_part')),
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'cancelled', 'published')),
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  source_root_id TEXT REFERENCES part_roots(id) ON DELETE RESTRICT,
  append_reason TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  published_at TIMESTAMPTZ,
  published_by TEXT REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT REFERENCES users(id),
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (draft_mode = 'new_bundle' AND source_root_id IS NULL)
    OR (draft_mode <> 'new_bundle' AND source_root_id IS NOT NULL)
  ),
  CHECK (
    (lifecycle_status = 'active'
      AND published_at IS NULL AND published_by IS NULL
      AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
    OR (lifecycle_status = 'cancelled'
      AND published_at IS NULL AND published_by IS NULL
      AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)
    OR (lifecycle_status = 'published'
      AND published_at IS NOT NULL AND published_by IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS number_candidate_reservations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  workspace_id TEXT NOT NULL REFERENCES numbering_draft_workspaces(id) ON DELETE RESTRICT,
  draft_item_type TEXT NOT NULL CHECK (draft_item_type IN ('root', 'part', 'drawing')),
  draft_item_id TEXT NOT NULL,
  candidate_code TEXT NOT NULL,
  sequence_scope_key TEXT NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 1),
  reservation_state TEXT NOT NULL DEFAULT 'active'
    CHECK (reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted', 'recycled')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  approval_request_id TEXT,
  promoted_master_type TEXT CHECK (promoted_master_type IS NULL OR promoted_master_type IN ('part_root', 'part_number', 'drawing_number')),
  promoted_master_id TEXT,
  promoted_at TIMESTAMPTZ,
  recycled_at TIMESTAMPTZ,
  recycled_by TEXT REFERENCES users(id),
  recycle_reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (reservation_state IN ('review_locked', 'approved_locked') AND approval_request_id IS NOT NULL)
    OR (reservation_state IN ('active', 'recycled') AND approval_request_id IS NULL)
    OR reservation_state = 'promoted'
  ),
  CHECK (
    (reservation_state = 'promoted'
      AND promoted_master_type IS NOT NULL AND promoted_master_id IS NOT NULL AND promoted_at IS NOT NULL)
    OR (reservation_state <> 'promoted'
      AND promoted_master_type IS NULL AND promoted_master_id IS NULL AND promoted_at IS NULL)
  ),
  CHECK (
    (reservation_state = 'recycled'
      AND recycled_at IS NOT NULL AND recycled_by IS NOT NULL AND recycle_reason IS NOT NULL)
    OR (reservation_state <> 'recycled'
      AND recycled_at IS NULL AND recycled_by IS NULL AND recycle_reason IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_number_candidate_reservations_code_exclusive
ON number_candidate_reservations(company_id, draft_item_type, candidate_code)
WHERE reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted');

CREATE UNIQUE INDEX IF NOT EXISTS idx_number_candidate_reservations_item_exclusive
ON number_candidate_reservations(workspace_id, draft_item_type, draft_item_id)
WHERE reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted');

CREATE INDEX IF NOT EXISTS idx_number_candidate_reservations_scope
ON number_candidate_reservations(company_id, sequence_scope_key, reservation_state, sequence_no);

CREATE TABLE IF NOT EXISTS numbering_draft_roots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  workspace_id TEXT NOT NULL UNIQUE REFERENCES numbering_draft_workspaces(id) ON DELETE CASCADE,
  core_name TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'shared', 'custom')),
  rule_version_id TEXT NOT NULL REFERENCES numbering_rule_versions(id),
  candidate_reservation_id TEXT UNIQUE REFERENCES number_candidate_reservations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS numbering_draft_parts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  workspace_id TEXT NOT NULL REFERENCES numbering_draft_workspaces(id) ON DELETE CASCADE,
  root_draft_id TEXT REFERENCES numbering_draft_roots(id) ON DELETE RESTRICT,
  source_root_id TEXT REFERENCES part_roots(id) ON DELETE RESTRICT,
  part_name TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'shared', 'custom')),
  is_universal INTEGER NOT NULL DEFAULT 0 CHECK (is_universal IN (0, 1)),
  universal_reason TEXT,
  custom_specification TEXT,
  series_code TEXT,
  candidate_reservation_id TEXT UNIQUE REFERENCES number_candidate_reservations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((root_draft_id IS NOT NULL AND source_root_id IS NULL) OR (root_draft_id IS NULL AND source_root_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS numbering_draft_drawings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  workspace_id TEXT NOT NULL REFERENCES numbering_draft_workspaces(id) ON DELETE CASCADE,
  root_draft_id TEXT REFERENCES numbering_draft_roots(id) ON DELETE RESTRICT,
  source_root_id TEXT REFERENCES part_roots(id) ON DELETE RESTRICT,
  purpose_code TEXT NOT NULL CHECK (purpose_code IN ('MA', 'OT', 'M', 'R')),
  purpose_description TEXT NOT NULL DEFAULT '',
  is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
  candidate_reservation_id TEXT UNIQUE REFERENCES number_candidate_reservations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((root_draft_id IS NOT NULL AND source_root_id IS NULL) OR (root_draft_id IS NULL AND source_root_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS numbering_draft_relations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  workspace_id TEXT NOT NULL REFERENCES numbering_draft_workspaces(id) ON DELETE CASCADE,
  drawing_draft_id TEXT NOT NULL REFERENCES numbering_draft_drawings(id) ON DELETE CASCADE,
  part_draft_id TEXT NOT NULL REFERENCES numbering_draft_parts(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('primary_manufacturing', 'reference')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, drawing_draft_id, part_draft_id, link_type)
);

CREATE TABLE IF NOT EXISTS number_candidate_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  workspace_id TEXT NOT NULL REFERENCES numbering_draft_workspaces(id) ON DELETE RESTRICT,
  reservation_id TEXT REFERENCES number_candidate_reservations(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'workspace_created', 'candidate_reserved', 'review_locked', 'review_unlocked',
      'approval_locked', 'candidate_recycled', 'candidate_promoted', 'publication_failed'
    )
  ),
  actor_id TEXT REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_numbering_draft_workspaces_company_owner
ON numbering_draft_workspaces(company_id, lifecycle_status, owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_numbering_draft_workspaces_source_root
ON numbering_draft_workspaces(company_id, source_root_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_numbering_draft_parts_workspace
ON numbering_draft_parts(company_id, workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_numbering_draft_drawings_workspace
ON numbering_draft_drawings(company_id, workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_numbering_draft_relations_workspace
ON numbering_draft_relations(company_id, workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_number_candidate_events_workspace
ON number_candidate_events(company_id, workspace_id, occurred_at);

CREATE OR REPLACE FUNCTION reject_number_candidate_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'NUMBER_CANDIDATE_EVENT_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS trg_number_candidate_events_no_update ON number_candidate_events;
CREATE TRIGGER trg_number_candidate_events_no_update
BEFORE UPDATE ON number_candidate_events
FOR EACH ROW EXECUTE FUNCTION reject_number_candidate_event_mutation();

DROP TRIGGER IF EXISTS trg_number_candidate_events_no_delete ON number_candidate_events;
CREATE TRIGGER trg_number_candidate_events_no_delete
BEFORE DELETE ON number_candidate_events
FOR EACH ROW EXECUTE FUNCTION reject_number_candidate_event_mutation();

WITH number_state_flow_permissions(role_code, permission_code) AS (
  VALUES
    ('system_admin', 'numbering.workspace.view'),
    ('system_admin', 'numbering.workspace.create'),
    ('system_admin', 'numbering.workspace.update'),
    ('system_admin', 'numbering.workspace.cancel'),
    ('system_admin', 'numbering.candidate.acquire'),
    ('system_admin', 'numbering.candidate.recycle'),
    ('pdm_admin', 'numbering.workspace.view'),
    ('pdm_admin', 'numbering.workspace.create'),
    ('pdm_admin', 'numbering.workspace.update'),
    ('pdm_admin', 'numbering.workspace.cancel'),
    ('pdm_admin', 'numbering.candidate.acquire'),
    ('pdm_admin', 'numbering.candidate.recycle'),
    ('rd_manager', 'numbering.workspace.view'),
    ('rd_manager', 'numbering.workspace.create'),
    ('rd_manager', 'numbering.workspace.update'),
    ('rd_manager', 'numbering.workspace.cancel'),
    ('rd_manager', 'numbering.candidate.acquire'),
    ('rd_manager', 'numbering.candidate.recycle'),
    ('rd', 'numbering.workspace.view'),
    ('rd', 'numbering.workspace.create'),
    ('rd', 'numbering.workspace.update'),
    ('rd', 'numbering.workspace.cancel'),
    ('rd', 'numbering.candidate.acquire'),
    ('rd', 'numbering.candidate.recycle')
)
INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
SELECT
  'default-perm-' || n.role_code || '-action-' || replace(n.permission_code, '.', '-'),
  r.id,
  'action',
  n.permission_code,
  1,
  now(),
  now()
FROM number_state_flow_permissions n
JOIN roles r ON r.role_code = n.role_code
ON CONFLICT (role_id, permission_kind, permission_code) DO NOTHING;

ALTER TABLE numbering_draft_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE number_candidate_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_candidate_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_roots FORCE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_parts FORCE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_drawings FORCE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_draft_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE number_candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_candidate_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON
  numbering_draft_workspaces,
  number_candidate_reservations,
  numbering_draft_roots,
  numbering_draft_parts,
  numbering_draft_drawings,
  numbering_draft_relations,
  number_candidate_events
FROM anon, authenticated;

COMMIT;
