-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.principal_session_records
  DROP CONSTRAINT principal_session_time_order,
  ADD CONSTRAINT principal_session_time_order CHECK (
    expires_at > issued_at AND expires_at <= issued_at + interval '16 hours'
  );

COMMIT;
