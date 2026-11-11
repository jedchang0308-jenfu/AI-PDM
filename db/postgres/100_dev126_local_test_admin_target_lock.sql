-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: additive
-- migration-note: local-only test-admin target lock; never a formal migration profile
-- governance-review: AIPDM/DEV-126
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $local_target$
DECLARE
  target ai_pdm_core.local_sandbox_target_metadata%ROWTYPE;
BEGIN
  SELECT * INTO STRICT target
  FROM ai_pdm_core.local_sandbox_target_metadata
  WHERE application_id='ai-pdm' AND database_name=current_database() AND status='ready';
  PERFORM ai_pdm_core.assert_local_test_admin_target_v1(
    target.sandbox_id, target.generation, target.fixture_hash, target.target_fingerprint);
END
$local_target$;

GRANT EXECUTE ON FUNCTION ai_pdm_core.assert_local_test_admin_target_v1(text,uuid,text,text)
  TO jenfu_ai_pdm_runtime;
COMMIT;
