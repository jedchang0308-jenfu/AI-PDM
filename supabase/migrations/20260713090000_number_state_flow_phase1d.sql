-- Add DEV-048 Phase 1D transfer review, batch publication, and published handoff authority
-- Source: db/postgres/017_number_state_flow_phase1d.sql
-- Source SHA-256: e50c173e748664490d3fef1de0a6f08db9bef5f908867ec00aeca527e9b0eec9
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

ALTER TABLE transfer_packages
  ADD COLUMN IF NOT EXISTS review_request_id TEXT,
  ADD COLUMN IF NOT EXISTS review_snapshot_hash TEXT,
  ADD COLUMN IF NOT EXISTS review_snapshot_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_failure_correlation_id TEXT;

ALTER TABLE transfer_packages
  ADD CONSTRAINT transfer_packages_phase1d_status_check
  CHECK (package_status IN (
    'Draft', 'InReview', 'NeedsInfo', 'ApprovedPendingPublish',
    'Publishing', 'Published', 'ReleaseFailed', 'Cancelled'
  )) NOT VALID;
ALTER TABLE transfer_packages VALIDATE CONSTRAINT transfer_packages_phase1d_status_check;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'transfer_packages'::regclass
      AND contype = 'c'
      AND conname <> 'transfer_packages_phase1d_status_check'
      AND pg_get_constraintdef(oid) ILIKE '%package_status%'
  LOOP
    EXECUTE format('ALTER TABLE transfer_packages DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.reject_transfer_package_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'TRANSFER_PACKAGE_EVENT_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_package_events_no_update ON public.transfer_package_events;
CREATE TRIGGER trg_transfer_package_events_no_update
BEFORE UPDATE ON public.transfer_package_events
FOR EACH ROW EXECUTE FUNCTION public.reject_transfer_package_event_mutation();

DROP TRIGGER IF EXISTS trg_transfer_package_events_no_delete ON public.transfer_package_events;
CREATE TRIGGER trg_transfer_package_events_no_delete
BEFORE DELETE ON public.transfer_package_events
FOR EACH ROW EXECUTE FUNCTION public.reject_transfer_package_event_mutation();

ALTER TABLE transfer_packages
  ADD CONSTRAINT transfer_packages_phase1d_cancel_check
  CHECK (
    (package_status = 'Cancelled' AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR package_status <> 'Cancelled'
  ) NOT VALID;
ALTER TABLE transfer_packages VALIDATE CONSTRAINT transfer_packages_phase1d_cancel_check;

CREATE TABLE IF NOT EXISTS transfer_package_draft_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  package_id TEXT NOT NULL REFERENCES transfer_packages(id),
  workspace_id TEXT NOT NULL REFERENCES numbering_draft_workspaces(id),
  requiredness TEXT NOT NULL DEFAULT 'required' CHECK (requiredness IN ('required', 'optional')),
  inclusion_reason TEXT NOT NULL,
  captured_workspace_version INTEGER NOT NULL CHECK (captured_workspace_version >= 1),
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (package_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_transfer_package_draft_items_package
  ON transfer_package_draft_items(company_id, package_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transfer_package_draft_items_workspace
  ON transfer_package_draft_items(company_id, workspace_id, package_id);

ALTER TABLE transfer_package_events
  ADD CONSTRAINT transfer_package_events_phase1d_type_check
  CHECK (event_type IN (
    'DraftCreated', 'HeaderUpdated', 'ScopeItemAdded', 'ScopeItemRemoved',
    'DraftWorkspaceAdded', 'DraftWorkspaceRemoved', 'ReviewSubmitted', 'ReviewWithdrawn',
    'ReviewDecided', 'SnapshotInvalidated', 'PackagePublished', 'ReleaseFailed', 'PackageCancelled'
  )) NOT VALID;
ALTER TABLE transfer_package_events VALIDATE CONSTRAINT transfer_package_events_phase1d_type_check;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'transfer_package_events'::regclass
      AND contype = 'c'
      AND conname <> 'transfer_package_events_phase1d_type_check'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE transfer_package_events DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

INSERT INTO approval_platform_actions (
  action_code, domain_code, title, description, handler_key, risk_level,
  allow_batch, requires_impact_snapshot, enabled, metadata_json
) VALUES (
  'transfer.package_review', 'transfer', '技術移轉包審核',
  'Review an immutable aggregate transfer snapshot without publishing master records.',
  'transfer.package-review', 'high', 1, 1, 1, '{}'
)
ON CONFLICT (action_code) DO UPDATE SET
  handler_key = EXCLUDED.handler_key,
  enabled = 1,
  updated_at = CURRENT_TIMESTAMP;

WITH transfer_phase1d_permissions(role_code, permission_code) AS (
  VALUES
    ('system_admin', 'transfer.package.view'),
    ('system_admin', 'transfer.package.create'),
    ('system_admin', 'transfer.package.update'),
    ('system_admin', 'transfer.package.review.submit'),
    ('system_admin', 'transfer.package.review.withdraw'),
    ('system_admin', 'transfer.package.review.decide'),
    ('system_admin', 'transfer.package.publish'),
    ('system_admin', 'handoff.published.view'),
    ('pdm_admin', 'transfer.package.view'),
    ('pdm_admin', 'transfer.package.create'),
    ('pdm_admin', 'transfer.package.update'),
    ('pdm_admin', 'transfer.package.review.submit'),
    ('pdm_admin', 'transfer.package.review.withdraw'),
    ('pdm_admin', 'transfer.package.review.decide'),
    ('pdm_admin', 'transfer.package.publish'),
    ('pdm_admin', 'handoff.published.view'),
    ('rd_manager', 'transfer.package.view'),
    ('rd_manager', 'transfer.package.create'),
    ('rd_manager', 'transfer.package.update'),
    ('rd_manager', 'transfer.package.review.submit'),
    ('rd_manager', 'transfer.package.review.withdraw'),
    ('rd_manager', 'transfer.package.review.decide'),
    ('rd_manager', 'transfer.package.publish'),
    ('rd_manager', 'handoff.published.view'),
    ('rd', 'transfer.package.view'),
    ('rd', 'transfer.package.create'),
    ('rd', 'transfer.package.update'),
    ('rd', 'transfer.package.review.submit'),
    ('rd', 'transfer.package.review.withdraw'),
    ('rd', 'handoff.published.view'),
    ('manufacturing', 'handoff.published.view'),
    ('procurement', 'handoff.published.view')
)
INSERT INTO role_permissions (
  id, role_id, permission_kind, permission_code, allowed, created_at, updated_at
)
SELECT
  'default-perm-' || t.role_code || '-action-' || replace(t.permission_code, '.', '-'),
  r.id, 'action', t.permission_code, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM transfer_phase1d_permissions t
JOIN roles r ON r.role_code = t.role_code
ON CONFLICT (role_id, permission_kind, permission_code) DO UPDATE SET
  allowed = 1,
  updated_at = CURRENT_TIMESTAMP;

ALTER TABLE transfer_package_draft_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_package_draft_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON transfer_package_draft_items FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_transfer_package_event_mutation() FROM PUBLIC, anon, authenticated;

COMMIT;
