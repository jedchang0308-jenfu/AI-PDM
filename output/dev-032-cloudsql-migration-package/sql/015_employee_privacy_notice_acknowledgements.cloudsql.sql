-- DEV-046 Cloud SQL candidate generated from db/postgres/015_employee_privacy_notice_acknowledgements.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Add immutable employee privacy notice versions and per-user acknowledgement evidence.
-- The application session remains fail closed until the current published version is acknowledged.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:4

CREATE TABLE IF NOT EXISTS public.privacy_notice_versions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'superseded')),
  title TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  content_json JSONB NOT NULL,
  effective_at TIMESTAMPTZ,
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, version)
);

CREATE TABLE IF NOT EXISTS public.privacy_notice_acknowledgements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notice_version_id TEXT NOT NULL REFERENCES public.privacy_notice_versions(id),
  notice_version TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  acknowledged_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('firebase_bff_session', 'firebase_email_invitation', 'employee_alias_login', 'privacy_acknowledgement_page')),
  request_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notice_version_id)
);

CREATE INDEX IF NOT EXISTS idx_privacy_notice_versions_company_status
  ON public.privacy_notice_versions(company_id, status, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_privacy_notice_versions_one_published
  ON public.privacy_notice_versions(company_id)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_privacy_notice_acknowledgements_user
  ON public.privacy_notice_acknowledgements(user_id, acknowledged_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_published_privacy_notice_content_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR
    NEW.content_json IS DISTINCT FROM OLD.content_json OR
    NEW.published_by IS DISTINCT FROM OLD.published_by OR
    NEW.published_at IS DISTINCT FROM OLD.published_at OR
    (OLD.effective_at IS NOT NULL AND NEW.effective_at IS DISTINCT FROM OLD.effective_at)
  ) THEN
    RAISE EXCEPTION 'published privacy notice content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_privacy_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'privacy acknowledgement evidence is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_privacy_notice_published_content_immutable ON public.privacy_notice_versions;
CREATE TRIGGER trg_privacy_notice_published_content_immutable
BEFORE UPDATE ON public.privacy_notice_versions
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_privacy_notice_content_change();

DROP TRIGGER IF EXISTS trg_privacy_notice_published_no_delete ON public.privacy_notice_versions;
CREATE TRIGGER trg_privacy_notice_published_no_delete
BEFORE DELETE ON public.privacy_notice_versions
FOR EACH ROW
WHEN (OLD.status IN ('published', 'superseded'))
EXECUTE FUNCTION public.prevent_privacy_evidence_change();

DROP TRIGGER IF EXISTS trg_privacy_notice_acknowledgements_no_update ON public.privacy_notice_acknowledgements;
CREATE TRIGGER trg_privacy_notice_acknowledgements_no_update
BEFORE UPDATE ON public.privacy_notice_acknowledgements
FOR EACH ROW EXECUTE FUNCTION public.prevent_privacy_evidence_change();

DROP TRIGGER IF EXISTS trg_privacy_notice_acknowledgements_no_delete ON public.privacy_notice_acknowledgements;
CREATE TRIGGER trg_privacy_notice_acknowledgements_no_delete
BEFORE DELETE ON public.privacy_notice_acknowledgements
FOR EACH ROW EXECUTE FUNCTION public.prevent_privacy_evidence_change();

-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:95
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:96
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:97
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:98

-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:100
REVOKE ALL ON TABLE public.privacy_notice_versions FROM PUBLIC;
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:101
REVOKE ALL ON TABLE public.privacy_notice_acknowledgements FROM PUBLIC;
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:102
REVOKE ALL ON FUNCTION public.prevent_published_privacy_notice_content_change() FROM PUBLIC;
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:103
REVOKE ALL ON FUNCTION public.prevent_privacy_evidence_change() FROM PUBLIC;

COMMENT ON TABLE public.privacy_notice_versions IS
  'Server-only immutable snapshots of company-approved employee privacy notices.';
COMMENT ON TABLE public.privacy_notice_acknowledgements IS
  'Server-only immutable evidence that a stable PDM user acknowledged an exact notice version and hash.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:110
