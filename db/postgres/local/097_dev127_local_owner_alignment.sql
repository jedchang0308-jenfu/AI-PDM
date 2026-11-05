-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: local prerequisite for the existing versioned DEV-127 consumer
-- compatibility: additive
-- governance-review: AIPDM/DEV-127 section 8.6
-- LOCAL ONLY. No formal profile entry. The source-owned wrapper supplies one
-- atomic transaction, exact inventory CAS, ledger append and unknown readback.
GRANT USAGE,CREATE ON SCHEMA ai_pdm_core,ai_pdm_contract TO jenfu_ai_pdm_migrator;
-- 096 itself grants contract USAGE to its exact OrgMaster migrator reader.
-- Keep schema ownership and every CREATE grant option with postgres.
GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_ai_pdm_migrator WITH GRANT OPTION;
ALTER FUNCTION ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text) OWNER TO jenfu_ai_pdm_migrator;
ALTER FUNCTION ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text) OWNER TO jenfu_ai_pdm_migrator;
ALTER VIEW ai_pdm_contract.v_role_policy_publications_v1 OWNER TO jenfu_ai_pdm_migrator;
GRANT SELECT,INSERT ON ai_pdm_core.schema_migrations TO jenfu_ai_pdm_migrator;
GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.role_catalog_publications,
  ai_pdm_core.active_role_catalog,ai_pdm_core.role_policy_drafts,
  ai_pdm_core.role_policy_commands TO jenfu_ai_pdm_migrator;
GRANT SELECT,INSERT ON ai_pdm_core.role_catalog_entries,
  ai_pdm_core.role_policy_role_identities TO jenfu_ai_pdm_migrator;
-- PostgreSQL row locking requires UPDATE as well as SELECT.
GRANT SELECT,UPDATE ON ai_pdm_core.principal_accounts,
  ai_pdm_core.principal_session_records TO jenfu_ai_pdm_migrator;
GRANT SELECT ON ai_pdm_core.users TO jenfu_ai_pdm_migrator;
GRANT EXECUTE ON FUNCTION ai_pdm_core.dev123_canonical_json_v1(jsonb),
  ai_pdm_core.dev123_json_sha256_v1(jsonb) TO jenfu_ai_pdm_migrator;
