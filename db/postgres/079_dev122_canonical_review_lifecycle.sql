-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: owner-private canonical review lifecycle provenance
-- compatibility: additive
-- Existing works/requests remain ordinary edit.
-- governance-review: AIPDM/DEV-122#canonical-review-lifecycle
-- No master-status backfill, historical evidence rewrite, or new authority.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;
ALTER TABLE ai_pdm_core.part_change_works
  ADD COLUMN IF NOT EXISTS lifecycle_intent TEXT NOT NULL DEFAULT 'edit'
  CHECK (lifecycle_intent IN ('edit', 'first_release'));
ALTER TABLE ai_pdm_core.part_approved_change_snapshots
  ADD COLUMN IF NOT EXISTS approval_context JSONB
  CHECK (approval_context IS NULL OR
    ((jsonb_typeof(approval_context) = 'object' AND approval_context->>'version' = '1') IS TRUE));
-- Existing whole-row immutable triggers protect the additive evidence column.
COMMIT;
