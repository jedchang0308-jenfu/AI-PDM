-- DEV-068 pre-submit recognition source context.
-- Additive compatibility change: recognition may inspect selected master drawing
-- attachments before a revision package exists. It does not create a revision,
-- submission, approval request or formal PDM value.

BEGIN;

ALTER TABLE drawing_recognition_sessions
  DROP CONSTRAINT IF EXISTS drawing_recognition_sessions_source_context_type_check;

ALTER TABLE drawing_recognition_sessions
  ADD CONSTRAINT drawing_recognition_sessions_source_context_type_check
  CHECK (source_context_type IN ('candidate_revision', 'revision_package', 'drawing_revision', 'drawing_number'));

COMMIT;
