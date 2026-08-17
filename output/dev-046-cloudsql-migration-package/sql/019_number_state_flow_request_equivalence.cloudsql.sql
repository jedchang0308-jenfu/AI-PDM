-- DEV-046 Cloud SQL candidate generated from db/postgres/019_number_state_flow_request_equivalence.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:1

ALTER TABLE numbering_draft_workspaces
  ADD COLUMN IF NOT EXISTS append_reason TEXT;

ALTER TABLE numbering_draft_parts
  ADD COLUMN IF NOT EXISTS universal_reason TEXT;

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:9
