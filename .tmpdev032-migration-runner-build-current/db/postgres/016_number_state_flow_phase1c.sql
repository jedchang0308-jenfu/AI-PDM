-- Add DEV-048 Phase 1C approval registration, immutable targets, publication evidence, and permissions.

BEGIN;

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
  'numbering.candidate_publication_review',
  'numbering',
  'Candidate publication review',
  'Review a locked numbering candidate snapshot without publishing master records.',
  'numbering.candidate-publication',
  'high',
  1,
  1,
  1,
  '{}'
)
ON CONFLICT (action_code) DO UPDATE SET
  domain_code = EXCLUDED.domain_code,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  handler_key = EXCLUDED.handler_key,
  risk_level = EXCLUDED.risk_level,
  allow_batch = EXCLUDED.allow_batch,
  requires_impact_snapshot = EXCLUDED.requires_impact_snapshot,
  enabled = EXCLUDED.enabled,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.reject_approval_platform_target_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'APPROVAL_PLATFORM_TARGET_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_platform_targets_no_update ON public.approval_platform_targets;
CREATE TRIGGER trg_approval_platform_targets_no_update
BEFORE UPDATE ON public.approval_platform_targets
FOR EACH ROW EXECUTE FUNCTION public.reject_approval_platform_target_mutation();

DROP TRIGGER IF EXISTS trg_approval_platform_targets_no_delete ON public.approval_platform_targets;
CREATE TRIGGER trg_approval_platform_targets_no_delete
BEFORE DELETE ON public.approval_platform_targets
FOR EACH ROW EXECUTE FUNCTION public.reject_approval_platform_target_mutation();

CREATE OR REPLACE FUNCTION public.reject_approval_platform_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'APPROVAL_PLATFORM_IMPACT_SNAPSHOT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_platform_impact_snapshots_no_update ON public.approval_platform_impact_snapshots;
CREATE TRIGGER trg_approval_platform_impact_snapshots_no_update
BEFORE UPDATE ON public.approval_platform_impact_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_approval_platform_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_approval_platform_impact_snapshots_no_delete ON public.approval_platform_impact_snapshots;
CREATE TRIGGER trg_approval_platform_impact_snapshots_no_delete
BEFORE DELETE ON public.approval_platform_impact_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_approval_platform_snapshot_mutation();

CREATE TABLE IF NOT EXISTS public.numbering_publication_evidence (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  drawing_draft_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_cloud_storage' CHECK (provider = 'google_cloud_storage'),
  bucket TEXT NOT NULL CHECK (length(btrim(bucket)) > 0),
  object_key TEXT NOT NULL CHECK (length(btrim(object_key)) > 0),
  generation TEXT NOT NULL CHECK (length(btrim(generation)) > 0),
  content_hash TEXT NOT NULL CHECK (length(btrim(content_hash)) > 0),
  media_type TEXT NOT NULL CHECK (length(btrim(media_type)) > 0),
  finalized_at TIMESTAMPTZ NOT NULL,
  rule_version TEXT NOT NULL CHECK (length(btrim(rule_version)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id) REFERENCES public.companies(id),
  FOREIGN KEY (workspace_id) REFERENCES public.numbering_draft_workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (drawing_draft_id) REFERENCES public.numbering_draft_drawings(id) ON DELETE RESTRICT,
  UNIQUE (company_id, workspace_id, drawing_draft_id, provider, bucket, object_key, generation)
);

CREATE INDEX IF NOT EXISTS idx_numbering_publication_evidence_workspace
  ON public.numbering_publication_evidence(company_id, workspace_id, drawing_draft_id, finalized_at);

DROP TRIGGER IF EXISTS trg_numbering_publication_evidence_updated_at ON public.numbering_publication_evidence;
CREATE TRIGGER trg_numbering_publication_evidence_updated_at
BEFORE UPDATE ON public.numbering_publication_evidence
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

WITH number_state_flow_phase1c_permissions(role_code, permission_code) AS (
  VALUES
    ('system_admin', 'numbering.candidate.review.submit'),
    ('system_admin', 'numbering.candidate.review.withdraw'),
    ('system_admin', 'numbering.candidate.review.decide'),
    ('system_admin', 'numbering.publish'),
    ('pdm_admin', 'numbering.candidate.review.submit'),
    ('pdm_admin', 'numbering.candidate.review.withdraw'),
    ('pdm_admin', 'numbering.candidate.review.decide'),
    ('pdm_admin', 'numbering.publish'),
    ('rd_manager', 'numbering.candidate.review.submit'),
    ('rd_manager', 'numbering.candidate.review.withdraw'),
    ('rd_manager', 'numbering.candidate.review.decide'),
    ('rd', 'numbering.candidate.review.submit'),
    ('rd', 'numbering.candidate.review.withdraw')
)
INSERT INTO public.role_permissions (
  id,
  role_id,
  permission_kind,
  permission_code,
  allowed,
  created_at,
  updated_at
)
SELECT
  'default-perm-' || permission.role_code || '-action-' || replace(permission.permission_code, '.', '-'),
  role.id,
  'action',
  permission.permission_code,
  1,
  now(),
  now()
FROM number_state_flow_phase1c_permissions permission
JOIN public.roles role ON role.role_code = permission.role_code
ON CONFLICT (role_id, permission_kind, permission_code) DO NOTHING;

ALTER TABLE public.numbering_publication_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numbering_publication_evidence FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.numbering_publication_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_approval_platform_target_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_approval_platform_snapshot_mutation() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.numbering_publication_evidence IS
  'Server-only finalized stable GCS pointers used to authorize explicit numbering publication; never stores signed URLs or raw file content.';

COMMIT;
