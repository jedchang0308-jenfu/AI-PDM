-- DEV-046 Cloud SQL candidate generated from db/postgres/018_part_number_series_code.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:1

ALTER TABLE part_numbers
  ADD COLUMN IF NOT EXISTS series_code TEXT;

ALTER TABLE numbering_draft_parts
  ADD COLUMN IF NOT EXISTS series_code TEXT;

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:9
