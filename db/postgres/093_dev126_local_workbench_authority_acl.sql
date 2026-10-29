-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: local-only runtime authority control is SELECT-only
-- compatibility: runtime business commands retain their existing data privileges
-- governance-review: AIPDM/DEV-126
BEGIN;
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
    OR COALESCE(host(inet_server_addr()),'') NOT IN ('127.0.0.1','::1')
    OR to_regclass('ai_pdm_core.local_sandbox_target_metadata') IS NULL
    OR to_regclass('ai_pdm_core.pdm_workbench_state_authority_control') IS NULL THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;
END $local_target$;
SET LOCAL ROLE jenfu_ai_pdm_migrator;
LOCK TABLE ai_pdm_core.pdm_workbench_state_authority_control IN SHARE ROW EXCLUSIVE MODE;
REVOKE ALL ON ai_pdm_core.pdm_workbench_state_authority_control FROM PUBLIC,jenfu_ai_pdm_runtime;
REVOKE ALL (id,mode,expected_commit,schema_hash,row_version,switched_at)
  ON ai_pdm_core.pdm_workbench_state_authority_control FROM PUBLIC,jenfu_ai_pdm_runtime;
GRANT SELECT ON ai_pdm_core.pdm_workbench_state_authority_control TO jenfu_ai_pdm_runtime;
COMMIT;

