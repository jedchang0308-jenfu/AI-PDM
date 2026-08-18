-- DEV-046 Cloud SQL candidate generated from db/postgres/037_drawing_recognition_pre_submit_source.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-068 pre-submit recognition source context.
-- Additive compatibility change: recognition may inspect selected master drawing
-- attachments before a revision package exists. It does not create a revision,
-- submission, approval request or formal PDM value.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:6

ALTER TABLE drawing_recognition_sessions
  DROP CONSTRAINT IF EXISTS drawing_recognition_sessions_source_context_type_check;

ALTER TABLE drawing_recognition_sessions
  ADD CONSTRAINT drawing_recognition_sessions_source_context_type_check
  CHECK (source_context_type IN ('candidate_revision', 'revision_package', 'drawing_revision', 'drawing_number'));

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:15
