-- DEV-046 Cloud SQL candidate generated from db/postgres/025_submission_part_scope.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Add an immutable multi-part scope to one controlled drawing revision submission.
-- Existing submissions remain valid without scope rows and continue to use item_id / submission_snapshots.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:4

CREATE TABLE IF NOT EXISTS public.submission_part_scopes (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES public.companies(id),
  item_id TEXT NOT NULL REFERENCES public.items(id),
  part_number_id TEXT NOT NULL REFERENCES public.part_numbers(id),
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL DEFAULT '',
  link_type TEXT NOT NULL CHECK (link_type IN ('primary_manufacturing', 'reference')),
  form_state TEXT NOT NULL CHECK (form_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  fit_state TEXT NOT NULL CHECK (fit_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  function_state TEXT NOT NULL CHECK (function_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  fff_outcome TEXT NOT NULL CHECK (fff_outcome IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, part_number_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_part_scopes_part
  ON public.submission_part_scopes(company_id, part_number_id, submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_part_scopes_submission
  ON public.submission_part_scopes(submission_id, part_number);

-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:29
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:30
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:31
REVOKE ALL ON TABLE public.submission_part_scopes FROM PUBLIC;

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:33
