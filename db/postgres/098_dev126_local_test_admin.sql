-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: additive
-- migration-note: local-only fixed PDM test administrator; never a formal migration profile
-- governance-review: AIPDM/DEV-126
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Installation itself requires positive local metadata and the bootstrap owner marker.
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
    OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1','::1')
    OR NOT EXISTS (SELECT 1 FROM ai_pdm_core.local_sandbox_target_metadata target
      WHERE target.application_id='ai-pdm' AND target.status='ready'
        AND target.database_name=current_database()
        AND current_database()='jenfu_local_' || replace(target.sandbox_id,'-','_')
        AND pg_catalog.shobj_description((SELECT oid FROM pg_catalog.pg_database
          WHERE datname=current_database()),'pg_database')=
          'jenfu.local-principal-bootstrap.v1:' || target.sandbox_id || ':' || target.generation::text)
  THEN RAISE EXCEPTION 'LOCAL_TEST_ADMIN_TARGET_REQUIRED'; END IF;
END
$local_target$;
-- The existing NOLOGIN migrator owns the narrow fixed-actor function, never runtime.
GRANT SELECT, INSERT ON ai_pdm_core.users TO jenfu_ai_pdm_migrator;
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE FUNCTION ai_pdm_core.assert_local_test_admin_target_v1(
  p_sandbox_id text, p_generation uuid, p_fixture_hash text, p_target_fingerprint text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE target ai_pdm_core.local_sandbox_target_metadata%ROWTYPE;
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
    OR COALESCE(host(inet_server_addr()),'') NOT IN ('127.0.0.1','::1')
    OR current_database() IS DISTINCT FROM 'jenfu_local_' || replace(p_sandbox_id,'-','_')
    OR p_sandbox_id IS NULL OR p_generation IS NULL
    OR p_fixture_hash IS NULL OR p_target_fingerprint IS NULL
  THEN RAISE EXCEPTION 'LOCAL_TEST_ADMIN_TARGET_REQUIRED'; END IF;
  SELECT * INTO STRICT target FROM ai_pdm_core.local_sandbox_target_metadata
    WHERE application_id='ai-pdm' AND sandbox_id=p_sandbox_id AND status='ready'
      AND generation=p_generation AND fixture_hash=p_fixture_hash
      AND target_fingerprint=p_target_fingerprint AND database_name=current_database()
    FOR SHARE;
  IF pg_catalog.shobj_description((SELECT oid FROM pg_catalog.pg_database
    WHERE datname=current_database()),'pg_database') IS DISTINCT FROM
    'jenfu.local-principal-bootstrap.v1:' || p_sandbox_id || ':' || p_generation::text
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='jenfu_ai_pdm_runtime'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR pg_catalog.pg_has_role('jenfu_ai_pdm_runtime','jenfu_ai_pdm_migrator','MEMBER')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_database db JOIN pg_catalog.pg_roles role
      ON role.oid=db.datdba WHERE db.datname=current_database() AND role.rolname='jenfu_ai_pdm_runtime')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace ns JOIN pg_catalog.pg_roles role
      ON role.oid=ns.nspowner WHERE ns.nspname IN ('ai_pdm_core','ai_pdm_contract')
      AND role.rolname='jenfu_ai_pdm_runtime')
  THEN RAISE EXCEPTION 'LOCAL_TEST_ADMIN_TARGET_REQUIRED'; END IF;
END
$body$;
REVOKE ALL ON FUNCTION ai_pdm_core.assert_local_test_admin_target_v1(text,uuid,text,text)
  FROM PUBLIC, jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.ensure_local_test_admin_v1(
  p_sandbox_id text, p_generation uuid, p_fixture_hash text, p_target_fingerprint text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE account ai_pdm_core.principal_accounts%ROWTYPE; profile ai_pdm_core.users%ROWTYPE;
BEGIN
  PERFORM ai_pdm_core.assert_local_test_admin_target_v1(p_sandbox_id,p_generation,p_fixture_hash,p_target_fingerprint);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ai-pdm-local-test-admin'),1);
  INSERT INTO ai_pdm_core.users(id,display_name,email,password_hash,role,company_id,
    account_status,system_role_enabled)
    VALUES('pdm-local-test-admin-user','PDM 本機測試超級管理員','pdm-local-test-admin@local.invalid',
      NULL,'Admin','company-jenfu','active',1) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO STRICT profile FROM ai_pdm_core.users WHERE id='pdm-local-test-admin-user' FOR SHARE;
  IF profile.company_id<>'company-jenfu' OR profile.role<>'Admin' OR profile.account_status<>'active'
    OR profile.system_role_enabled<>1 OR profile.email IS DISTINCT FROM 'pdm-local-test-admin@local.invalid'
    OR profile.password_hash IS NOT NULL
  THEN RAISE EXCEPTION 'LOCAL_TEST_ADMIN_PROFILE_CONFLICT'; END IF;
  INSERT INTO ai_pdm_core.principal_accounts(principal_id,pdm_user_id,company_id,employee_id,
    account_type,account_status,lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
    VALUES('pdm-local-test-admin','pdm-local-test-admin-user','company-jenfu','pdm-local-test-employee',
      'human_personal','active',1,1,true,'aal1') ON CONFLICT(principal_id) DO NOTHING;
  SELECT * INTO STRICT account FROM ai_pdm_core.principal_accounts WHERE principal_id='pdm-local-test-admin' FOR SHARE;
  IF account.pdm_user_id<>'pdm-local-test-admin-user' OR account.company_id<>'company-jenfu'
    OR account.employee_id<>'pdm-local-test-employee' OR account.account_type<>'human_personal'
    OR account.account_status<>'active' OR NOT account.system_role_enabled OR account.minimum_assurance<>'aal1'
  THEN RAISE EXCEPTION 'LOCAL_TEST_ADMIN_ACCOUNT_CONFLICT'; END IF;
END
$body$;
REVOKE ALL ON FUNCTION ai_pdm_core.ensure_local_test_admin_v1(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.ensure_local_test_admin_v1(text,uuid,text,text) TO jenfu_ai_pdm_runtime;
COMMIT;
