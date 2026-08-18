-- DEV-046 Cloud SQL candidate generated from db/postgres/039_allow_recycled_candidate_drawing_codes.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-069: a cancelled candidate projection is immutable history, not an
-- active number claim. Release its provisional code from the active unique
-- namespace while preserving the cancelled drawing row and its audit links.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:5

ALTER TABLE drawings
  DROP CONSTRAINT IF EXISTS drawings_company_id_drawing_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drawings_active_company_number
  ON drawings(company_id, drawing_number)
  WHERE drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:14
