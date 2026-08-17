-- DEV-046 Cloud SQL candidate generated from db/postgres/021_number_lifecycle_simplification.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Add DEV-052 candidate first-revision authority and immutable review-approval evidence.
-- This migration is additive-only. It must not rewrite existing business rows.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:4

CREATE TABLE IF NOT EXISTS public.numbering_candidate_revision_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL REFERENCES public.numbering_draft_workspaces(id) ON DELETE RESTRICT,
  drawing_draft_id TEXT NOT NULL UNIQUE REFERENCES public.numbering_draft_drawings(id) ON DELETE RESTRICT,
  candidate_reservation_id TEXT NOT NULL UNIQUE REFERENCES public.number_candidate_reservations(id) ON DELETE RESTRICT,
  revision TEXT NOT NULL CHECK (length(btrim(revision)) > 0),
  workflow_intent TEXT NOT NULL DEFAULT 'rd_workspace' CHECK (workflow_intent = 'rd_workspace'),
  policy_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  override_reason TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'review_locked', 'promoted', 'cancelled')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  approval_request_id TEXT REFERENCES public.approval_platform_requests(id) ON DELETE RESTRICT,
  review_snapshot_hash TEXT,
  legacy_baseline_request_id TEXT REFERENCES public.approval_platform_requests(id) ON DELETE RESTRICT,
  legacy_baseline_snapshot_hash TEXT,
  formal_drawing_number_id TEXT REFERENCES public.drawing_numbers(id) ON DELETE RESTRICT,
  formal_revision_package_id TEXT REFERENCES public.drawing_revision_packages(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT REFERENCES public.users(id) ON DELETE RESTRICT,
  CHECK (
    (lifecycle_status = 'draft'
      AND formal_drawing_number_id IS NULL AND formal_revision_package_id IS NULL
      AND promoted_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL)
    OR (lifecycle_status = 'review_locked'
      AND approval_request_id IS NOT NULL AND review_snapshot_hash IS NOT NULL
      AND formal_drawing_number_id IS NULL AND formal_revision_package_id IS NULL
      AND promoted_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL)
    OR (lifecycle_status = 'promoted'
      AND approval_request_id IS NOT NULL AND review_snapshot_hash IS NOT NULL
      AND formal_drawing_number_id IS NOT NULL AND formal_revision_package_id IS NOT NULL
      AND promoted_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by IS NULL)
    OR (lifecycle_status = 'cancelled'
      AND formal_drawing_number_id IS NULL AND formal_revision_package_id IS NULL
      AND promoted_at IS NULL AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_numbering_candidate_revision_drafts_workspace
  ON public.numbering_candidate_revision_drafts(company_id, workspace_id, lifecycle_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_numbering_candidate_revision_drafts_approval
  ON public.numbering_candidate_revision_drafts(company_id, approval_request_id)
  WHERE approval_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.numbering_candidate_revision_files (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  candidate_revision_id TEXT NOT NULL REFERENCES public.numbering_candidate_revision_drafts(id) ON DELETE RESTRICT,
  source_file_asset_id TEXT NOT NULL REFERENCES public.file_assets(id) ON DELETE RESTRICT,
  publication_evidence_id TEXT REFERENCES public.numbering_publication_evidence(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('cad_3d', 'drawing_2d', 'intermediate', 'pdf', 'dwg_dxf', 'other')),
  role_source TEXT NOT NULL CHECK (role_source IN ('extension', 'user', 'migration', 'system')),
  display_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  removed_at TIMESTAMPTZ,
  removed_by TEXT REFERENCES public.users(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_revision_id, source_file_asset_id),
  CHECK (
    (removed_at IS NULL AND removed_by IS NULL)
    OR (removed_at IS NOT NULL AND removed_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_numbering_candidate_revision_files_candidate
  ON public.numbering_candidate_revision_files(company_id, candidate_revision_id, removed_at, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_numbering_candidate_revision_files_active_primary_role
  ON public.numbering_candidate_revision_files(candidate_revision_id, role)
  WHERE is_primary = 1 AND removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.drawing_revision_package_review_approvals (
  package_id TEXT PRIMARY KEY REFERENCES public.drawing_revision_packages(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  candidate_revision_id TEXT NOT NULL UNIQUE REFERENCES public.numbering_candidate_revision_drafts(id) ON DELETE RESTRICT,
  approval_request_id TEXT NOT NULL UNIQUE REFERENCES public.approval_platform_requests(id) ON DELETE RESTRICT,
  snapshot_hash TEXT NOT NULL CHECK (length(btrim(snapshot_hash)) > 0),
  approved_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawing_revision_package_review_approvals_scope
  ON public.drawing_revision_package_review_approvals(company_id, approved_at DESC);

DROP TRIGGER IF EXISTS trg_numbering_candidate_revision_drafts_updated_at
  ON public.numbering_candidate_revision_drafts;
CREATE TRIGGER trg_numbering_candidate_revision_drafts_updated_at
BEFORE UPDATE ON public.numbering_candidate_revision_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_numbering_candidate_revision_files_updated_at
  ON public.numbering_candidate_revision_files;
CREATE TRIGGER trg_numbering_candidate_revision_files_updated_at
BEFORE UPDATE ON public.numbering_candidate_revision_files
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.reject_drawing_revision_package_review_approval_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_revision_package_review_approvals_no_update
  ON public.drawing_revision_package_review_approvals;
CREATE TRIGGER trg_drawing_revision_package_review_approvals_no_update
BEFORE UPDATE ON public.drawing_revision_package_review_approvals
FOR EACH ROW EXECUTE FUNCTION public.reject_drawing_revision_package_review_approval_mutation();

DROP TRIGGER IF EXISTS trg_drawing_revision_package_review_approvals_no_delete
  ON public.drawing_revision_package_review_approvals;
CREATE TRIGGER trg_drawing_revision_package_review_approvals_no_delete
BEFORE DELETE ON public.drawing_revision_package_review_approvals
FOR EACH ROW EXECUTE FUNCTION public.reject_drawing_revision_package_review_approval_mutation();

INSERT INTO public.approval_platform_actions (
  action_code,
  domain_code,
  title,
  description,
  handler_key,
  risk_level,
  allow_batch,
  requires_impact_snapshot,
  enabled,
  metadata_json
)
VALUES (
  'numbering.candidate_bundle_review',
  'numbering',
  'Candidate drawing bundle review',
  'Review candidate numbers, drawing relationships, first revisions, and finalized file evidence as one immutable bundle.',
  'numbering.candidate-bundle',
  'high',
  0,
  1,
  1,
  '{}'::jsonb
)
ON CONFLICT (action_code) DO NOTHING;

-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:162
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:163
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:164
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:165
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:166
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:167

REVOKE ALL ON TABLE
  public.numbering_candidate_revision_drafts,
  public.numbering_candidate_revision_files,
  public.drawing_revision_package_review_approvals
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:173
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.reject_drawing_revision_package_review_approval_mutation()
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:176
FROM PUBLIC;

COMMENT ON TABLE public.numbering_candidate_revision_drafts IS
  'Server-owned candidate first-revision authority for DEV-052; never a formal released revision.';
COMMENT ON TABLE public.numbering_candidate_revision_files IS
  'Soft-removable candidate revision file links; finalized evidence is required before bundle review.';
COMMENT ON TABLE public.drawing_revision_package_review_approvals IS
  'Immutable companion that projects a physical Pending revision package as effective ReviewApproved.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:185
