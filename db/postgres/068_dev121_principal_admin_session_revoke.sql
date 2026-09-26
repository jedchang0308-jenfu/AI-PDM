-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: consumes orgmaster.ai-pdm-principal-effective-grants.v2
-- compatibility: additive
-- governance-review: DEV-121

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Session revocation has its own catalog capability. The existing assertion
-- keeps its actor session, typed principal, authority and AAL2 proof.
CREATE OR REPLACE FUNCTION ai_pdm_core.assert_principal_account_manager_v1(
  p_actor_principal_id text,
  p_actor_identity_issuer text,
  p_actor_identity_subject text,
  p_actor_session_hash text,
  p_company_id text,
  p_permission_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_allowed_count bigint;
  v_denied_count bigint;
  v_authority_count bigint;
  v_typed_count bigint;
BEGIN
  IF p_actor_principal_id IS NULL OR char_length(p_actor_principal_id) NOT BETWEEN 1 AND 255
     OR p_actor_identity_issuer IS NULL OR char_length(p_actor_identity_issuer) NOT BETWEEN 1 AND 255
     OR p_actor_identity_subject IS NULL OR char_length(p_actor_identity_subject) NOT BETWEEN 1 AND 255
     OR p_actor_session_hash IS NULL OR p_actor_session_hash !~ '^[0-9a-f]{64}$'
     OR p_company_id <> 'company-jenfu'
     OR p_permission_code IS NULL
     OR p_permission_code NOT IN ('accounts.invitation.manage',
                                  'accounts.lifecycle.manage',
                                  'accounts.session.revoke') THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_typed_count
    FROM orgmaster_contract.v_active_principal_accounts_v1 typed
   WHERE typed.principal_id = p_actor_principal_id
     AND typed.principal_issuer = p_actor_identity_issuer
     AND typed.principal_subject = p_actor_identity_subject
     AND typed.contract_version = 'organization.active-principal.v1'
     AND typed.employee_status = 'active';
  IF v_typed_count <> 1 OR NOT EXISTS (
    SELECT 1
      FROM ai_pdm_core.principal_accounts account
      JOIN ai_pdm_core.principal_identity_cutovers cutover
        ON cutover.pdm_user_id = account.pdm_user_id
       AND cutover.principal_id = account.principal_id
       AND cutover.status = 'principal_active'
      JOIN ai_pdm_core.users profile ON profile.id = account.pdm_user_id
      JOIN ai_pdm_core.principal_session_records session
        ON session.principal_id = account.principal_id
       AND session.session_id_hash = p_actor_session_hash
      JOIN orgmaster_contract.v_active_principal_accounts_v1 typed
        ON typed.principal_id = account.principal_id
       AND typed.employee_id = account.employee_id
       AND typed.account_type = account.account_type
       AND typed.principal_issuer = p_actor_identity_issuer
       AND typed.principal_subject = p_actor_identity_subject
     WHERE account.principal_id = p_actor_principal_id
       AND account.account_status = 'active' AND account.system_role_enabled
       AND account.company_id = p_company_id
       AND profile.company_id = account.company_id
       AND typed.contract_version = 'organization.active-principal.v1'
       AND typed.employee_status = 'active'
       AND session.revoked_at IS NULL
       AND session.issued_at <= pg_catalog.transaction_timestamp()
       AND session.expires_at > pg_catalog.transaction_timestamp()
       AND session.assurance_level = 'aal2'
       AND session.lifecycle_version = account.lifecycle_version
       AND session.profile_version = account.profile_version
       AND (account.session_invalid_before IS NULL
            OR session.issued_at > account.session_invalid_before)
  ) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_authority_count
    FROM ai_pdm_core.principal_accounts account
    JOIN orgmaster_contract.v_ai_pdm_entitlement_authority_v1 source
      ON source.employee_id = account.employee_id
   WHERE account.principal_id = p_actor_principal_id
     AND source.application_id = 'ai-pdm'
     AND source.contract_version = 'jenfu.platform-entitlement.v1';
  IF v_authority_count <> 1 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  WITH authority AS (
    SELECT source.authority_version, account.employee_id
      FROM ai_pdm_core.principal_accounts account
      JOIN orgmaster_contract.v_ai_pdm_entitlement_authority_v1 source
        ON source.employee_id = account.employee_id
     WHERE account.principal_id = p_actor_principal_id
       AND source.contract_version = 'jenfu.platform-entitlement.v1'
       AND source.application_id = 'ai-pdm'
       AND source.authority_source = 'orgmaster_authority'
  ), applicable AS (
    SELECT role.permissions
      FROM authority
      JOIN orgmaster_contract.v_ai_pdm_principal_effective_grants_v2 grant_row
        ON grant_row.authority_version = authority.authority_version
       AND grant_row.employee_id = authority.employee_id
      JOIN ai_pdm_contract.v_application_role_catalog_v1 role
        ON role.stable_role_id = grant_row.stable_role_id
       AND role.role_code = grant_row.role_code
     WHERE grant_row.contract_version = 'jenfu.orgmaster.ai-pdm-principal-grants.v2'
       AND grant_row.application_id = 'ai-pdm'
       AND grant_row.principal_id = p_actor_principal_id
       AND grant_row.valid_from <= pg_catalog.transaction_timestamp()
       AND (grant_row.valid_until IS NULL
            OR grant_row.valid_until > pg_catalog.transaction_timestamp())
       AND role.contract_version = 'jenfu.platform-entitlement.v1'
       AND role.application_id = 'ai-pdm'
       AND role.assignable
       AND role.subject_kind = grant_row.subject_kind
       AND role.allowed_scope_kinds ? grant_row.scope_kind
       AND (
         (grant_row.role_code = 'pdm_admin'
          AND grant_row.scope_kind = 'workspace'
          AND grant_row.scope_key IN ('current', p_company_id)
          AND grant_row.subject_kind = 'employee')
         OR
         (grant_row.role_code = 'system_admin'
          AND grant_row.scope_kind = 'global'
          AND grant_row.scope_key IS NULL
          AND grant_row.subject_kind = 'principal'
          AND grant_row.target_principal_id = p_actor_principal_id
          AND grant_row.grant_kind = 'direct'
          AND grant_row.delegation_id IS NULL)
       )
  ), decisions AS (
    SELECT (permission.value->>'allowed')::boolean AS allowed
      FROM applicable role
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(role.permissions) permission(value)
     WHERE permission.value->>'kind' = 'action'
       AND permission.value->>'code' = p_permission_code
  )
  SELECT count(*) FILTER (WHERE allowed), count(*) FILTER (WHERE NOT allowed)
    INTO v_allowed_count, v_denied_count FROM decisions;
  IF v_allowed_count < 1 OR v_denied_count > 0 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
END;
$function$;

ALTER FUNCTION ai_pdm_core.assert_principal_account_manager_v1(text,text,text,text,text,text)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.assert_principal_account_manager_v1(text,text,text,text,text,text)
  FROM PUBLIC, jenfu_ai_pdm_runtime;

ALTER TABLE ai_pdm_core.principal_identity_operations
  DROP CONSTRAINT principal_identity_operations_operation_kind_check;
ALTER TABLE ai_pdm_core.principal_identity_operations
  ADD CONSTRAINT principal_identity_operations_operation_kind_check
  CHECK (operation_kind IN ('cutover', 'provision', 'lifecycle', 'session_revoke'));

-- A version barrier and registry revocation commit together. A concurrent
-- registration cannot escape the barrier: the caller runs SERIALIZABLE and
-- the target account row is locked before either write.
CREATE FUNCTION ai_pdm_core.revoke_principal_account_sessions_v1(
  p_operation_id text,
  p_target_pdm_user_id text,
  p_reason text,
  p_company_id text,
  p_actor_principal_id text,
  p_actor_identity_issuer text,
  p_actor_identity_subject text,
  p_actor_session_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_hash text;
  v_receipt ai_pdm_core.principal_identity_operations%ROWTYPE;
  v_account ai_pdm_core.principal_accounts%ROWTYPE;
  v_now timestamptz;
  v_result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
     OR p_target_pdm_user_id IS NULL OR char_length(p_target_pdm_user_id) NOT BETWEEN 1 AND 255
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = '' OR p_reason <> btrim(p_reason)
     OR p_reason ~ '[[:cntrl:]]'
     OR p_company_id IS NULL OR char_length(p_company_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOKE_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  PERFORM ai_pdm_core.assert_principal_account_manager_v1(
    p_actor_principal_id,p_actor_identity_issuer,p_actor_identity_subject,
    p_actor_session_hash,p_company_id,'accounts.session.revoke');
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationKind','session_revoke',
      'actorPrincipalId',p_actor_principal_id,'companyId',p_company_id,
      'pdmUserId',p_target_pdm_user_id,'reason',p_reason)::text,
    'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aipdm-dev121-session-revoke'),pg_catalog.hashtext(p_operation_id));
  SELECT * INTO v_receipt FROM ai_pdm_core.principal_identity_operations
   WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_receipt.operation_kind <> 'session_revoke' OR v_receipt.input_hash <> v_hash THEN
      RAISE EXCEPTION 'AIPDM_SESSION_REVOKE_OPERATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_account FROM ai_pdm_core.principal_accounts
     WHERE principal_id = v_receipt.result_json->>'principalId'
       AND pdm_user_id = p_target_pdm_user_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AIPDM_SESSION_REVOKE_RECEIPT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_receipt.result_json || pg_catalog.jsonb_build_object('replayed',true,
      'current',pg_catalog.jsonb_build_object('accountStatus',v_account.account_status,
        'lifecycleVersion',v_account.lifecycle_version));
  END IF;

  SELECT account.* INTO v_account FROM ai_pdm_core.principal_accounts account
    JOIN ai_pdm_core.principal_identity_cutovers cutover
      ON cutover.pdm_user_id = account.pdm_user_id
     AND cutover.principal_id = account.principal_id
     AND cutover.status = 'principal_active'
   WHERE account.pdm_user_id = p_target_pdm_user_id
     AND account.company_id = p_company_id
   FOR UPDATE OF account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOKE_TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_account.principal_id = p_actor_principal_id THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOKE_SELF_CHANGE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF v_account.lifecycle_version >= 9007199254740991 THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOKE_VERSION_EXHAUSTED' USING ERRCODE = '22003';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  UPDATE ai_pdm_core.principal_accounts SET
    lifecycle_version = lifecycle_version + 1,
    session_invalid_before = v_now, updated_at = v_now
   WHERE principal_id = v_account.principal_id
   RETURNING * INTO v_account;
  UPDATE ai_pdm_core.principal_session_records SET
    revoked_at = v_now, revoke_reason = 'admin_session_revoke'
   WHERE principal_id = v_account.principal_id AND revoked_at IS NULL;
  v_result := pg_catalog.jsonb_build_object('operationId',p_operation_id,
    'principalId',v_account.principal_id,'pdmUserId',v_account.pdm_user_id,
    'accountStatus',v_account.account_status,
    'lifecycleVersion',v_account.lifecycle_version,
    'reason',p_reason,'committedAt',v_now);
  INSERT INTO ai_pdm_core.principal_identity_operations
    (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
  VALUES (p_operation_id,'session_revoke',v_hash,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.jsonb_build_array(v_account.principal_id,v_account.pdm_user_id)::text,
            'UTF8')), 'hex'),v_result,v_now);
  RETURN v_result || pg_catalog.jsonb_build_object('replayed',false,
    'current',pg_catalog.jsonb_build_object('accountStatus',v_account.account_status,
      'lifecycleVersion',v_account.lifecycle_version));
END;
$function$;
ALTER FUNCTION ai_pdm_core.revoke_principal_account_sessions_v1(
  text,text,text,text,text,text,text,text) OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.revoke_principal_account_sessions_v1(
  text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.revoke_principal_account_sessions_v1(
  text,text,text,text,text,text,text,text) TO jenfu_ai_pdm_runtime;

COMMIT;
