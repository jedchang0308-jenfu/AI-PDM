-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: consumes orgmaster.ai-pdm-principal-effective-grants.v2
-- compatibility: new-version
-- governance-review: DEV-121

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- The actor's provider alias proves the current session, but the permission
-- subject is the canonical principal. This replaces the v1 alias-grant reader
-- without changing the function's callers or its session/assurance fence.
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
                                  'accounts.lifecycle.manage') THEN
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

COMMIT;
