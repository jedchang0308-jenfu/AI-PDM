-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: consumes orgmaster.ai-pdm-principal-effective-grants.v4
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-121#principal-account-command-v4
-- Correct only the existing account command guard. No account, session, grant
-- or historical migration is rewritten; AAL1 and existing scope/deny remain.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

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
  v_typed_count bigint;
  v_publication_count bigint;
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
       AND session.lifecycle_version = account.lifecycle_version
       AND session.profile_version = account.profile_version
       AND (account.session_invalid_before IS NULL
            OR session.issued_at > account.session_invalid_before)
  ) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;

  WITH grants AS (
    SELECT grant_row.*
      FROM ai_pdm_core.principal_accounts account
      JOIN orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 grant_row
        ON grant_row.principal_id = account.principal_id
       AND grant_row.employee_id = account.employee_id
     WHERE account.principal_id = p_actor_principal_id
       AND grant_row.contract_version = 'jenfu.orgmaster.ai-pdm-principal-grants.v4'
       AND grant_row.application_id = 'ai-pdm'
       AND grant_row.assignment_version_id IS NOT NULL
       AND grant_row.assignment_version IS NOT NULL
       AND grant_row.published_at IS NOT NULL
       AND grant_row.catalog_version IS NOT NULL
       AND char_length(grant_row.catalog_version) BETWEEN 1 AND 255
       AND grant_row.valid_from <= pg_catalog.transaction_timestamp()
       AND (grant_row.valid_until IS NULL
            OR grant_row.valid_until > pg_catalog.transaction_timestamp())
  ), publication AS (
    SELECT count(DISTINCT (assignment_version_id, assignment_version, published_at)) AS version_count
      FROM grants
  ), applicable AS (
    SELECT role.permissions
      FROM grants grant_row
      JOIN ai_pdm_contract.v_application_role_catalog_v1 role
        ON role.stable_role_id = grant_row.stable_role_id
       AND role.role_code = grant_row.role_code
       -- Assignment catalog_version is provenance; stable role identity resolves
       -- capabilities from the single current owner catalog, as in the API consumer.
     WHERE role.contract_version = 'jenfu.platform-entitlement.v1'
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
  SELECT (SELECT version_count FROM publication),
         count(*) FILTER (WHERE allowed), count(*) FILTER (WHERE NOT allowed)
    INTO v_publication_count, v_allowed_count, v_denied_count FROM decisions;
  IF v_publication_count <> 1 OR v_allowed_count < 1 OR v_denied_count > 0 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
END;
$function$;

ALTER FUNCTION ai_pdm_core.assert_principal_account_manager_v1(text,text,text,text,text,text)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.assert_principal_account_manager_v1(text,text,text,text,text,text)
  FROM PUBLIC, jenfu_ai_pdm_runtime;

COMMIT;
