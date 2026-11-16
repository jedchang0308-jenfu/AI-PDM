-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: permits unassigned PDM work reviews and preserves requester and outcome metadata
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.pdm_work_review_requests
  ALTER COLUMN reviewer_user_id DROP NOT NULL,
  ADD COLUMN submitted_by text,
  ADD COLUMN requires_model_review boolean,
  ADD COLUMN requires_publish boolean,
  ADD CONSTRAINT pdm_work_review_shared_request_check CHECK (
    reviewer_user_id IS NOT NULL
    OR (submitted_by IS NOT NULL AND requires_model_review IS NOT NULL AND requires_publish IS NOT NULL
      AND request_kind IN ('drawing_revision', 'drawing_rd_void', 'part_change'))
  );

CREATE INDEX idx_pdm_work_review_submitter
  ON ai_pdm_core.pdm_work_review_requests (company_id, submitted_by, created_at DESC, id)
  WHERE submitted_by IS NOT NULL;

ALTER TABLE ai_pdm_core.pdm_work_review_terminal_receipts
  ADD COLUMN submitted_by text,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN request_kind text,
  ADD COLUMN canonical_entity_id text,
  ADD COLUMN decided_by text,
  ADD COLUMN decision text,
  ADD COLUMN apply_failed boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT pdm_work_review_terminal_tracking_check CHECK (
    submitted_by IS NULL
    OR (
      submitted_at IS NOT NULL
      AND request_kind IS NOT NULL
      AND request_kind IN ('drawing_revision', 'drawing_rd_void', 'part_change')
      AND canonical_entity_id IS NOT NULL
      AND decided_by IS NOT NULL
      AND decision IS NOT NULL
      AND decision IN ('approve', 'return_for_correction')
    )
  );

CREATE INDEX idx_pdm_work_review_terminal_submitter
  ON ai_pdm_core.pdm_work_review_terminal_receipts (company_id, submitted_by, decided_at DESC, request_id)
  WHERE submitted_by IS NOT NULL;

COMMIT;
