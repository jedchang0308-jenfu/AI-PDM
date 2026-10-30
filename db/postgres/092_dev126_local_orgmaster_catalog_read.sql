-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_contract
-- contract-impact: local-only read ACL for the OrgMaster publication owner
-- compatibility: additive
-- governance-review: AIPDM/DEV-126 / ORGMASTER/DEV-060
-- Local-only owner publication dependency. Excluded from production profiles.
BEGIN;
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
    OR COALESCE(host(inet_server_addr()),'') NOT IN ('127.0.0.1','::1')
    OR to_regclass('ai_pdm_core.local_sandbox_target_metadata') IS NULL THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;
END $local_target$;
SET LOCAL ROLE jenfu_ai_pdm_migrator;
-- OrgMaster's security-barrier local wrapper reads the published PDM contract
-- as its owner. It receives no access to PDM core rows or runtime credentials.
GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator;
GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v2 TO jenfu_orgmaster_migrator;
COMMIT;
