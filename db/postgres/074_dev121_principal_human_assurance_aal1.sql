-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: consumes orgmaster.ai-pdm-principal-effective-grants.v3
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-121#human-assurance-aal1

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Human Principal accounts now have an AAL1 minimum regardless of role.
-- The metadata transition preserves account status, role, profile link and scope.
-- Incrementing profile_version and setting the barrier invalidates old tokens;
-- revoking registered sessions also makes the invalidation visible to session reads.
LOCK TABLE ai_pdm_core.principal_accounts,
  ai_pdm_core.principal_session_records IN ACCESS EXCLUSIVE MODE;

ALTER TABLE ai_pdm_core.principal_accounts
  DROP CONSTRAINT principal_privileged_assurance;

UPDATE ai_pdm_core.principal_accounts
   SET minimum_assurance = 'aal1',
       profile_version = profile_version + 1,
       session_invalid_before = pg_catalog.transaction_timestamp(),
       updated_at = pg_catalog.transaction_timestamp();

UPDATE ai_pdm_core.principal_session_records
   SET revoked_at = pg_catalog.transaction_timestamp(),
       revoke_reason = 'assurance_policy_changed'
 WHERE revoked_at IS NULL;

ALTER TABLE ai_pdm_core.principal_accounts
  ADD CONSTRAINT principal_accounts_minimum_assurance_aal1
  CHECK (minimum_assurance = 'aal1');

-- Keep typed Principal, active account, company, live session, lifecycle/profile,
-- revocation, published v3 grant/catalog, scope and exact command-permission checks.
-- The session assurance enum remains fact-derived by the application session issuer.
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
      JOIN orgmaster_contract.v_ai_pdm_principal_effective_grants_v3 grant_row
        ON grant_row.principal_id = account.principal_id
       AND grant_row.employee_id = account.employee_id
     WHERE account.principal_id = p_actor_principal_id
       AND grant_row.contract_version = 'jenfu.orgmaster.ai-pdm-principal-grants.v3'
       AND grant_row.application_id = 'ai-pdm'
       AND grant_row.assignment_version_id IS NOT NULL
       AND grant_row.assignment_version IS NOT NULL
       AND grant_row.published_at IS NOT NULL
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
       AND role.catalog_version = grant_row.catalog_version
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


CREATE OR REPLACE FUNCTION ai_pdm_core.provision_principal_account_v1(
  p_request jsonb,
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
  v_ref jsonb;
  v_operation_id text;
  v_principal_id text;
  v_company_id text;
  v_display_name text;
  v_contact_email text;
  v_enabled boolean;
  v_input_hash text;
  v_user_id text;
  v_receipt ai_pdm_core.principal_identity_operations%ROWTYPE;
  v_account ai_pdm_core.principal_accounts%ROWTYPE;
  v_source_count bigint;
  v_source_match bigint;
  v_source_employees bigint;
  v_source_types bigint;
  v_committed_at timestamptz;
  v_result jsonb;
BEGIN
  IF p_request IS NULL OR pg_catalog.jsonb_typeof(p_request) <> 'object'
     OR pg_catalog.jsonb_typeof(p_request->'principalRef') <> 'object'
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request) AS key
                WHERE key NOT IN ('contractVersion','operationId','principalRef',
                                  'displayName','contactEmail','accountEnabled','companyId'))
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request->'principalRef') AS key
                WHERE key NOT IN ('principalId','identityIssuer','identitySubject',
                                  'employeeId','accountType','mappingVersion','publishedAt'))
     OR p_request->>'contractVersion' IS DISTINCT FROM 'ai-pdm.principal-provision.v1'
     OR (p_request ? 'accountEnabled'
         AND pg_catalog.jsonb_typeof(p_request->'accountEnabled') <> 'boolean')
  THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  v_ref := p_request->'principalRef';
  v_operation_id := p_request->>'operationId';
  v_principal_id := v_ref->>'principalId';
  v_company_id := p_request->>'companyId';
  v_display_name := p_request->>'displayName';
  v_contact_email := p_request->>'contactEmail';
  v_enabled := COALESCE((p_request->>'accountEnabled')::boolean, false);
  IF p_actor_principal_id IS NULL OR char_length(p_actor_principal_id) NOT BETWEEN 1 AND 255
     OR v_operation_id IS NULL OR v_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
     OR v_principal_id IS NULL OR char_length(v_principal_id) NOT BETWEEN 1 AND 255
     OR v_company_id IS NULL OR char_length(v_company_id) NOT BETWEEN 1 AND 255
     OR v_display_name IS NULL OR char_length(v_display_name) NOT BETWEEN 1 AND 255
     OR btrim(v_display_name) = '' OR v_display_name <> btrim(v_display_name)
     OR (v_contact_email IS NOT NULL AND
         (char_length(v_contact_email) NOT BETWEEN 3 AND 254 OR
          v_contact_email <> btrim(v_contact_email) OR
          v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
     OR v_ref->>'identityIssuer' IS NULL OR char_length(v_ref->>'identityIssuer') NOT BETWEEN 1 AND 255
     OR v_ref->>'identitySubject' IS NULL OR char_length(v_ref->>'identitySubject') NOT BETWEEN 1 AND 255
     OR v_ref->>'employeeId' IS NULL OR char_length(v_ref->>'employeeId') NOT BETWEEN 1 AND 255
     OR v_ref->>'accountType' NOT IN ('human_personal','human_privileged')
     OR pg_catalog.jsonb_typeof(v_ref->'mappingVersion') <> 'number'
     OR (v_ref->>'mappingVersion') !~ '^[1-9][0-9]{0,15}$'
     OR pg_catalog.jsonb_typeof(v_ref->'publishedAt') <> 'string'
     OR (v_ref->>'publishedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;

  PERFORM ai_pdm_core.assert_principal_account_manager_v1(
    p_actor_principal_id,p_actor_identity_issuer,p_actor_identity_subject,
    p_actor_session_hash,v_company_id,'accounts.invitation.manage');
  IF NOT EXISTS (SELECT 1 FROM ai_pdm_core.companies WHERE id = v_company_id) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_COMPANY_MISSING' USING ERRCODE = '23503';
  END IF;
  v_input_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationKind','provision',
      'actorPrincipalId',p_actor_principal_id,'request',p_request)::text,'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aipdm-dev121-provision'),pg_catalog.hashtext(v_operation_id));
  SELECT * INTO v_receipt FROM ai_pdm_core.principal_identity_operations
   WHERE operation_id = v_operation_id;
  IF FOUND THEN
    IF v_receipt.operation_kind <> 'provision' OR v_receipt.input_hash <> v_input_hash THEN
      RAISE EXCEPTION 'AIPDM_PROVISION_OPERATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_account FROM ai_pdm_core.principal_accounts
     WHERE principal_id = v_receipt.result_json->>'principalId'
       AND pdm_user_id = v_receipt.result_json->>'pdmUserId'
       AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AIPDM_PROVISION_RECEIPT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_receipt.result_json || pg_catalog.jsonb_build_object('replayed',true,
      'current',pg_catalog.jsonb_build_object(
        'accountStatus',v_account.account_status,
        'lifecycleVersion',v_account.lifecycle_version,
        'profileVersion',v_account.profile_version));
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE principal_issuer = v_ref->>'identityIssuer'
           AND principal_subject = v_ref->>'identitySubject'
           AND employee_id = v_ref->>'employeeId'
           AND account_type = v_ref->>'accountType'
           AND mapping_version = (v_ref->>'mappingVersion')::bigint
           AND published_at = (v_ref->>'publishedAt')::timestamptz
           AND employee_status = 'active'
           AND contract_version = 'organization.active-principal.v1'),
         count(DISTINCT employee_id),count(DISTINCT account_type)
    INTO v_source_count,v_source_match,v_source_employees,v_source_types
    FROM orgmaster_contract.v_active_principal_accounts_v1
   WHERE principal_id = v_principal_id;
  IF v_source_count < 1 OR v_source_count > 32 OR v_source_match <> 1
     OR v_source_employees <> 1 OR v_source_types <> 1 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_SOURCE_DRIFT' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM ai_pdm_core.principal_accounts WHERE principal_id = v_principal_id)
     OR EXISTS (SELECT 1 FROM ai_pdm_core.principal_identity_cutovers WHERE principal_id = v_principal_id) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PRINCIPAL_LINKED' USING ERRCODE = '23505';
  END IF;
  IF v_contact_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM ai_pdm_core.users WHERE pg_catalog.lower(email) = pg_catalog.lower(v_contact_email)
  ) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_CONTACT_CONFLICT' USING ERRCODE = '23505';
  END IF;

  v_user_id := 'user-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  INSERT INTO ai_pdm_core.users
    (id,display_name,email,password_hash,role,company_id,account_status,
     system_role_enabled,account_status_changed_at,account_status_reason)
  VALUES (v_user_id,v_display_name,v_contact_email,NULL,'Engineer',v_company_id,
          'suspended',0,pg_catalog.clock_timestamp(),'principal_only_provision');
  INSERT INTO ai_pdm_core.principal_accounts
    (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
     lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
  VALUES (v_principal_id,v_user_id,v_company_id,v_ref->>'employeeId',
          v_ref->>'accountType',CASE WHEN v_enabled THEN 'active' ELSE 'suspended' END,
          1,1,v_enabled,
          'aal1');
  v_committed_at := pg_catalog.clock_timestamp();
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,
    'principalId',v_principal_id,'pdmUserId',v_user_id,'committedAt',v_committed_at);
  INSERT INTO ai_pdm_core.principal_identity_operations
    (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
  VALUES (v_operation_id,'provision',v_input_hash,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.jsonb_build_array(v_principal_id,v_user_id)::text,'UTF8')), 'hex'),
          v_result,v_committed_at);
  INSERT INTO ai_pdm_core.principal_identity_cutovers
    (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at)
  VALUES (v_user_id,v_principal_id,'principal_active',v_input_hash,v_operation_id,v_committed_at);
  RETURN v_result || pg_catalog.jsonb_build_object('replayed',false,
    'current',pg_catalog.jsonb_build_object(
      'accountStatus',CASE WHEN v_enabled THEN 'active' ELSE 'suspended' END,
      'lifecycleVersion',1,'profileVersion',1));
END;
$function$;
ALTER FUNCTION ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)
  TO jenfu_ai_pdm_runtime;


COMMIT;
