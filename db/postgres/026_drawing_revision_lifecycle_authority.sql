-- Add DEV-053 Phase 1H drawing-revision lifecycle authority and guarded lifecycle-only cleanup.
-- Schema-only: this migration does not adopt, rewrite, or delete runtime workflows.

BEGIN;

ALTER TABLE public.drawing_revision_packages
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT,
  ADD COLUMN IF NOT EXISTS active_correction_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drawing_revision_packages'::regclass
      AND conname = 'drawing_revision_packages_lifecycle_state_check'
  ) THEN
    ALTER TABLE public.drawing_revision_packages
      ADD CONSTRAINT drawing_revision_packages_lifecycle_state_check
      CHECK (lifecycle_state IS NULL OR lifecycle_state IN ('preparing', 'in_review', 'correction_required', 'rd_controlled', 'released'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drawing_revision_packages'::regclass
      AND conname = 'drawing_revision_packages_correction_reason_check'
  ) THEN
    ALTER TABLE public.drawing_revision_packages
      ADD CONSTRAINT drawing_revision_packages_correction_reason_check
      CHECK (active_correction_reason IS NULL OR COALESCE(lifecycle_state, '') = 'correction_required');
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_revision_packages_lifecycle_unique
  ON public.drawing_revision_packages(company_id, drawing_number_id, revision)
  WHERE lifecycle_state IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.drawing_revision_package_part_scopes (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES public.drawing_revision_packages(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  part_number_id TEXT NOT NULL REFERENCES public.part_numbers(id) ON DELETE RESTRICT,
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL DEFAULT '',
  link_type TEXT NOT NULL CHECK (link_type IN ('primary_manufacturing', 'reference')),
  form_state TEXT NOT NULL CHECK (form_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  fit_state TEXT NOT NULL CHECK (fit_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  function_state TEXT NOT NULL CHECK (function_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  fff_outcome TEXT NOT NULL CHECK (fff_outcome IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (package_id, part_number_id)
);

CREATE INDEX IF NOT EXISTS idx_drawing_revision_package_part_scopes_part
  ON public.drawing_revision_package_part_scopes(company_id, part_number_id, package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_revision_package_part_scopes_package
  ON public.drawing_revision_package_part_scopes(package_id, part_number);

CREATE TABLE IF NOT EXISTS public.drawing_revision_lifecycle_workflows (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL UNIQUE REFERENCES public.drawing_revision_packages(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  approval_package_id TEXT REFERENCES public.approval_platform_packages(id) ON DELETE SET NULL,
  approval_request_id TEXT UNIQUE REFERENCES public.approval_platform_requests(id) ON DELETE SET NULL,
  legacy_submission_id TEXT UNIQUE REFERENCES public.submissions(id) ON DELETE SET NULL,
  legacy_fff_assessment_id TEXT UNIQUE REFERENCES public.drawing_revision_fff_assessments(id) ON DELETE SET NULL,
  origin TEXT NOT NULL CHECK (origin IN ('new', 'adopted_active')),
  state TEXT NOT NULL CHECK (state IN ('active', 'finalizing', 'cleanup_pending')),
  submitted_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  snapshot_hash TEXT NOT NULL CHECK (length(btrim(snapshot_hash)) > 0),
  cleanup_authorized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drawing_revision_lifecycle_workflows_active
  ON public.drawing_revision_lifecycle_workflows(company_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.drawing_revision_lifecycle_reviewers (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES public.drawing_revision_lifecycle_workflows(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewer_role TEXT NOT NULL,
  required_order INTEGER NOT NULL DEFAULT 1 CHECK (required_order > 0),
  quorum_group TEXT NOT NULL DEFAULT 'default',
  quorum_required INTEGER NOT NULL DEFAULT 1 CHECK (quorum_required > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workflow_id, reviewer_id, reviewer_role)
);

CREATE INDEX IF NOT EXISTS idx_drawing_revision_lifecycle_reviewers_assignment
  ON public.drawing_revision_lifecycle_reviewers(workflow_id, required_order, reviewer_role);

CREATE TABLE IF NOT EXISTS public.drawing_revision_lifecycle_command_tokens (
  key_hash TEXT PRIMARY KEY,
  scope_hash TEXT NOT NULL,
  result_fingerprint TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drawing_revision_lifecycle_command_tokens_expiry
  ON public.drawing_revision_lifecycle_command_tokens(expires_at);

INSERT INTO public.approval_platform_actions (
  action_code, domain_code, title, description, handler_key, risk_level,
  allow_batch, requires_impact_snapshot, enabled, metadata_json
)
VALUES (
  'numbering.drawing_revision_lifecycle_review',
  'drawing_revision',
  'Drawing revision lifecycle review',
  'Transient Phase 1H review authority; durable PDM revision state survives terminal cleanup.',
  'drawing_revision.lifecycle',
  'high',
  0,
  1,
  1,
  '{"retentionClass":"lifecycle_only"}'
)
ON CONFLICT (action_code) DO NOTHING;

ALTER TABLE public.drawing_revision_package_part_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_package_part_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_lifecycle_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_lifecycle_workflows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_lifecycle_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_lifecycle_reviewers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_lifecycle_command_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revision_lifecycle_command_tokens FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.drawing_revision_package_part_scopes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.drawing_revision_lifecycle_workflows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.drawing_revision_lifecycle_reviewers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.drawing_revision_lifecycle_command_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.phase1h_cleanup_authorized(
  checked_request_id TEXT,
  checked_package_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drawing_revision_lifecycle_workflows workflow
    WHERE workflow.cleanup_authorized_at IS NOT NULL
      AND (
        (checked_request_id IS NOT NULL AND workflow.approval_request_id = checked_request_id)
        OR (checked_package_id IS NOT NULL AND workflow.approval_package_id = checked_package_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.phase1h_cleanup_authorized(TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.guard_approval_platform_phase1h_cleanup_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  allowed BOOLEAN := FALSE;
  error_code TEXT := 'APPROVAL_PLATFORM_RECORD_IMMUTABLE';
BEGIN
  IF TG_TABLE_NAME = 'approval_platform_targets' THEN
    allowed := public.phase1h_cleanup_authorized(OLD.request_id, NULL);
    error_code := 'APPROVAL_PLATFORM_TARGET_IMMUTABLE';
  ELSIF TG_TABLE_NAME = 'approval_platform_impact_snapshots' THEN
    allowed := public.phase1h_cleanup_authorized(OLD.request_id, OLD.package_id);
    error_code := 'APPROVAL_PLATFORM_IMPACT_SNAPSHOT_IMMUTABLE';
  ELSIF TG_TABLE_NAME = 'approval_platform_decisions' THEN
    allowed := public.phase1h_cleanup_authorized(OLD.request_id, NULL);
    error_code := 'APPROVAL_PLATFORM_DECISION_APPEND_ONLY';
  ELSIF TG_TABLE_NAME = 'approval_platform_events' THEN
    allowed := public.phase1h_cleanup_authorized(OLD.request_id, OLD.package_id);
    error_code := 'APPROVAL_PLATFORM_EVENT_APPEND_ONLY';
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION '%', error_code;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_platform_targets_no_delete ON public.approval_platform_targets;
CREATE TRIGGER trg_approval_platform_targets_no_delete
  BEFORE DELETE ON public.approval_platform_targets
  FOR EACH ROW EXECUTE FUNCTION public.guard_approval_platform_phase1h_cleanup_delete();

DROP TRIGGER IF EXISTS trg_approval_platform_impact_snapshots_no_delete ON public.approval_platform_impact_snapshots;
CREATE TRIGGER trg_approval_platform_impact_snapshots_no_delete
  BEFORE DELETE ON public.approval_platform_impact_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_approval_platform_phase1h_cleanup_delete();

DROP TRIGGER IF EXISTS trg_approval_platform_decisions_no_delete ON public.approval_platform_decisions;
CREATE TRIGGER trg_approval_platform_decisions_no_delete
  BEFORE DELETE ON public.approval_platform_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_approval_platform_phase1h_cleanup_delete();

DROP TRIGGER IF EXISTS trg_approval_platform_events_no_delete ON public.approval_platform_events;
CREATE TRIGGER trg_approval_platform_events_no_delete
  BEFORE DELETE ON public.approval_platform_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_approval_platform_phase1h_cleanup_delete();

CREATE OR REPLACE FUNCTION public.guard_audit_log_phase1h_cleanup_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.drawing_revision_lifecycle_workflows workflow
    WHERE workflow.origin = 'adopted_active'
      AND workflow.cleanup_authorized_at IS NOT NULL
      AND workflow.legacy_submission_id = OLD.submission_id
  ) THEN
    RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_log_phase1h_cleanup_delete();

COMMIT;
