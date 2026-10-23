-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: internal durable initiator only; versioned contracts unchanged
-- compatibility: additive
-- governance-review: AIPDM/DEV-123
-- DEV-123: preserve the verified initiator for asynchronous recognition.
BEGIN;
SET LOCAL search_path = pg_catalog, ai_pdm_core;
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Old jobs retain NULL. A human can retry through the verified request path;
-- never fabricate identity, lifecycle or epoch evidence for historical jobs.
ALTER TABLE ai_pdm_core.drawing_recognition_sessions
  ADD COLUMN initiator_authority_json jsonb
  CHECK (initiator_authority_json IS NULL OR jsonb_typeof(initiator_authority_json)='object');

COMMIT;
