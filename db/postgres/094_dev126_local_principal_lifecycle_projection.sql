-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: consumes orgmaster.local-principal-lifecycle-state.v1
-- compatibility: additive
-- migration-note: local-only native account version projection before normal Principal v2 issuance
-- governance-review: AIPDM/DEV-126, ORGMASTER/DEV-060
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
     OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1', '::1') THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;
END
$local_target$;
SET LOCAL ROLE jenfu_ai_pdm_migrator;
CREATE FUNCTION ai_pdm_core.project_local_principal_lifecycle_v1(
  p_sandbox_id text, p_generation uuid, p_fixture_version text, p_fixture_hash text,
  p_principal_id text, p_employee_id text, p_lifecycle_version bigint, p_profile_version bigint
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $body$
DECLARE
  target ai_pdm_core.local_sandbox_target_metadata%ROWTYPE;
  account ai_pdm_core.principal_accounts%ROWTYPE;
  owner_state record;
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
     OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1', '::1')
     OR p_principal_id !~ '^local-[a-z0-9-]{1,100}$'
     OR p_lifecycle_version < 1 OR p_profile_version < 1
     OR p_lifecycle_version IS NULL OR p_profile_version IS NULL THEN
    RAISE EXCEPTION 'LOCAL_LIFECYCLE_TARGET_INVALID';
  END IF;
  SELECT * INTO STRICT target FROM ai_pdm_core.local_sandbox_target_metadata
   WHERE application_id='ai-pdm' AND sandbox_id=p_sandbox_id
     AND status='ready' AND generation=p_generation
     AND fixture_version=p_fixture_version AND fixture_hash=p_fixture_hash
     AND database_name=current_database()
   FOR SHARE;
  IF pg_catalog.shobj_description((SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()),'pg_database')
     IS DISTINCT FROM 'jenfu.local-principal-bootstrap.v1:' || p_sandbox_id || ':' || p_generation::text THEN
    RAISE EXCEPTION 'LOCAL_LIFECYCLE_TARGET_INVALID';
  END IF;
  SELECT * INTO STRICT account FROM ai_pdm_core.principal_accounts
   WHERE principal_id=p_principal_id AND employee_id=p_employee_id
     AND company_id='company-jenfu' AND account_status='active' AND system_role_enabled
   FOR UPDATE;
  SELECT * INTO owner_state FROM orgmaster_contract.v_local_principal_lifecycle_state_v1
   WHERE sandbox_id=p_sandbox_id AND generation=p_generation::text
     AND principal_id=p_principal_id;
  IF FOUND THEN
    IF owner_state.contract_version <> 'orgmaster.local-principal-lifecycle-state.v1'
       OR owner_state.fixture_version IS DISTINCT FROM p_fixture_version
       OR owner_state.fixture_hash IS DISTINCT FROM p_fixture_hash
       OR owner_state.principal_status IS DISTINCT FROM 'active'
       OR owner_state.employee_status IS DISTINCT FROM 'active'
       OR owner_state.account_lifecycle_version IS DISTINCT FROM p_lifecycle_version
       OR owner_state.profile_version IS DISTINCT FROM p_profile_version THEN
      RAISE EXCEPTION 'LOCAL_LIFECYCLE_OWNER_MISMATCH';
    END IF;
  ELSIF p_lifecycle_version <> 1 OR p_profile_version <> 1 THEN
    RAISE EXCEPTION 'LOCAL_LIFECYCLE_OWNER_MISMATCH';
  END IF;
  IF account.lifecycle_version > p_lifecycle_version OR account.profile_version > p_profile_version THEN
    RAISE EXCEPTION 'LOCAL_LIFECYCLE_REGRESSION';
  END IF;
  IF account.lifecycle_version=p_lifecycle_version AND account.profile_version=p_profile_version THEN
    RETURN false;
  END IF;
  UPDATE ai_pdm_core.principal_accounts
     SET lifecycle_version=p_lifecycle_version, profile_version=p_profile_version
   WHERE principal_id=p_principal_id;
  RETURN true;
END
$body$;
REVOKE ALL ON FUNCTION ai_pdm_core.project_local_principal_lifecycle_v1(text,uuid,text,text,text,text,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.project_local_principal_lifecycle_v1(text,uuid,text,text,text,text,bigint,bigint)
  TO jenfu_ai_pdm_runtime;
COMMIT;
