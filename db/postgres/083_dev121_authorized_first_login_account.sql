-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: consumes orgmaster.ai-pdm-principal-effective-grants.v4
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-121#authorized-first-login
-- A published, effective AI-PDM grant is the account-opening authority. This
-- owner-private command creates only the local application profile/link; it
-- never writes or mirrors an OrgMaster role assignment.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE FUNCTION ai_pdm_core.ensure_authorized_first_login_account_v1(
  p_identity_issuer text,
  p_identity_subject text,
  p_principal_id text,
  p_employee_id text,
  p_account_type text,
  p_mapping_version bigint,
  p_published_at timestamptz,
  p_verified_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_company_id constant text := 'company-jenfu';
  v_source_count bigint;
  v_source_match bigint;
  v_source_employees bigint;
  v_source_types bigint;
  v_grant_count bigint;
  v_applicable_count bigint;
  v_publication_count bigint;
  v_existing ai_pdm_core.principal_accounts%ROWTYPE;
  v_user_id text;
  v_operation_id text;
  v_input_hash text;
  v_committed_at timestamptz;
BEGIN
  IF p_identity_issuer IS NULL OR char_length(p_identity_issuer) NOT BETWEEN 1 AND 2048
     OR p_identity_subject IS NULL OR char_length(p_identity_subject) NOT BETWEEN 1 AND 255
     OR p_principal_id IS NULL OR char_length(p_principal_id) NOT BETWEEN 1 AND 255
     OR p_employee_id IS NULL OR char_length(p_employee_id) NOT BETWEEN 1 AND 255
     OR p_account_type NOT IN ('human_personal','human_privileged')
     OR p_mapping_version IS NULL OR p_mapping_version NOT BETWEEN 1 AND 9007199254740991
     OR p_published_at IS NULL
     OR p_verified_email IS NULL OR char_length(p_verified_email) NOT BETWEEN 3 AND 320
     OR p_verified_email <> btrim(p_verified_email)
     OR p_verified_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Serialize creation by the canonical Principal. A SERIALIZABLE caller may
  -- still hold an older snapshot; the unique-violation handler below converts
  -- that race to SQLSTATE 40001 so the existing transaction wrapper retries.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aipdm-dev121-first-login'),
    pg_catalog.hashtext(p_principal_id));

  SELECT * INTO v_existing
    FROM ai_pdm_core.principal_accounts
   WHERE principal_id = p_principal_id;
  IF FOUND THEN
    IF v_existing.employee_id <> p_employee_id
       OR v_existing.account_type <> p_account_type
       OR v_existing.company_id <> v_company_id
       OR NOT EXISTS (
         SELECT 1 FROM ai_pdm_core.users profile
          WHERE profile.id = v_existing.pdm_user_id
            AND profile.company_id = v_existing.company_id
       )
    THEN
      RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'created',false,
      'principalId',v_existing.principal_id,
      'pdmUserId',v_existing.pdm_user_id,
      'companyId',v_existing.company_id,
      'accountStatus',v_existing.account_status,
      'lifecycleVersion',v_existing.lifecycle_version,
      'profileVersion',v_existing.profile_version
    );
  END IF;

  -- A historical one-way marker is evidence of an unresolved ownership
  -- conflict. Never attach a new profile or repair it by email similarity.
  IF EXISTS (
    SELECT 1 FROM ai_pdm_core.principal_identity_cutovers
     WHERE principal_id = p_principal_id
  ) THEN
    RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT' USING ERRCODE = '23514';
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE principal_issuer = p_identity_issuer
             AND principal_subject = p_identity_subject
             AND employee_id = p_employee_id
             AND account_type = p_account_type
             AND mapping_version = p_mapping_version
             AND published_at = p_published_at
             AND employee_status = 'active'
             AND contract_version = 'organization.active-principal.v1'
         ),
         count(DISTINCT employee_id),count(DISTINCT account_type)
    INTO v_source_count,v_source_match,v_source_employees,v_source_types
    FROM orgmaster_contract.v_active_principal_accounts_v1
   WHERE principal_id = p_principal_id;
  IF v_source_count < 1 OR v_source_count > 32 OR v_source_match <> 1
     OR v_source_employees <> 1 OR v_source_types <> 1 THEN
    RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT' USING ERRCODE = '23514';
  END IF;

  WITH grants AS (
    SELECT grant_row.*
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 grant_row
     WHERE grant_row.contract_version = 'jenfu.orgmaster.ai-pdm-principal-grants.v4'
       AND grant_row.application_id = 'ai-pdm'
       AND grant_row.principal_id = p_principal_id
       AND grant_row.employee_id = p_employee_id
       AND grant_row.assignment_version_id IS NOT NULL
       AND grant_row.assignment_version IS NOT NULL
       AND grant_row.assignment_id IS NOT NULL
       AND grant_row.published_at IS NOT NULL
       AND grant_row.catalog_version IS NOT NULL
       AND char_length(grant_row.catalog_version) BETWEEN 1 AND 255
       AND grant_row.valid_from <= pg_catalog.transaction_timestamp()
       AND (grant_row.valid_until IS NULL
            OR grant_row.valid_until > pg_catalog.transaction_timestamp())
  ), applicable AS (
    SELECT grant_row.assignment_id
      FROM grants grant_row
      JOIN ai_pdm_contract.v_application_role_catalog_v1 role
        ON role.stable_role_id = grant_row.stable_role_id
       AND role.role_code = grant_row.role_code
     WHERE role.contract_version = 'jenfu.platform-entitlement.v1'
       AND role.application_id = 'ai-pdm'
       AND role.assignable
       AND role.subject_kind = grant_row.subject_kind
       AND role.allowed_scope_kinds ? grant_row.scope_kind
       AND (
         (grant_row.subject_kind = 'employee'
          AND grant_row.target_principal_id IS NULL)
         OR
         (grant_row.subject_kind = 'principal'
          AND grant_row.target_principal_id = p_principal_id)
       )
       AND (
         (grant_row.scope_kind = 'workspace'
          AND grant_row.scope_key IN ('current',v_company_id))
         OR
         (grant_row.scope_kind = 'project'
          AND grant_row.scope_key IS NOT NULL
          AND btrim(grant_row.scope_key) <> '')
         OR
         (grant_row.scope_kind = 'global'
          AND grant_row.scope_key IS NULL)
       )
       AND (
         grant_row.stable_role_id <> 'role-system-admin'
         OR (grant_row.role_code = 'system_admin'
             AND grant_row.subject_kind = 'principal'
             AND grant_row.target_principal_id = p_principal_id
             AND grant_row.scope_kind = 'global'
             AND grant_row.grant_kind = 'direct'
             AND grant_row.delegation_id IS NULL)
       )
  )
  SELECT (SELECT count(*) FROM grants),
         (SELECT count(*) FROM applicable),
         (SELECT count(DISTINCT (assignment_version_id,assignment_version,published_at))
            FROM grants)
    INTO v_grant_count,v_applicable_count,v_publication_count;
  IF v_grant_count < 1 OR v_grant_count > 32
     OR v_applicable_count <> v_grant_count
     OR v_publication_count <> 1 THEN
    RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_pdm_core.companies WHERE id = v_company_id) THEN
    RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_COMPANY_MISSING' USING ERRCODE = '23503';
  END IF;

  v_input_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'contractVersion','ai-pdm.authorized-first-login.v1',
      'identityIssuer',p_identity_issuer,
      'identitySubject',p_identity_subject,
      'principalId',p_principal_id,
      'employeeId',p_employee_id,
      'accountType',p_account_type,
      'mappingVersion',p_mapping_version,
      'publishedAt',p_published_at,
      'companyId',v_company_id
    )::text,'UTF8')), 'hex');
  v_operation_id := 'first-login-' || pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p_principal_id,'UTF8')), 'hex');
  v_user_id := 'user-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  v_committed_at := pg_catalog.clock_timestamp();

  INSERT INTO ai_pdm_core.users
    (id,display_name,email,password_hash,role,company_id,account_status,
     system_role_enabled,account_status_changed_at,account_status_reason)
  VALUES (v_user_id,p_verified_email,NULL,NULL,'Engineer',v_company_id,
          'active',1,v_committed_at,'authorized_first_login');
  INSERT INTO ai_pdm_core.principal_accounts
    (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
     lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
  VALUES (p_principal_id,v_user_id,v_company_id,p_employee_id,p_account_type,
          'active',1,1,true,'aal1');
  INSERT INTO ai_pdm_core.principal_identity_operations
    (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
  VALUES (v_operation_id,'provision',v_input_hash,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.jsonb_build_array(p_principal_id,v_user_id)::text,'UTF8')), 'hex'),
          pg_catalog.jsonb_build_object(
            'contractVersion','ai-pdm.authorized-first-login.v1',
            'principalId',p_principal_id,
            'pdmUserId',v_user_id,
            'companyId',v_company_id,
            'committedAt',v_committed_at
          ),v_committed_at);
  INSERT INTO ai_pdm_core.principal_identity_cutovers
    (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at)
  VALUES (v_user_id,p_principal_id,'principal_active',v_input_hash,
          v_operation_id,v_committed_at);

  RETURN pg_catalog.jsonb_build_object(
    'created',true,
    'principalId',p_principal_id,
    'pdmUserId',v_user_id,
    'companyId',v_company_id,
    'accountStatus','active',
    'lifecycleVersion',1,
    'profileVersion',1
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'AIPDM_FIRST_LOGIN_RACE_RETRY' USING ERRCODE = '40001';
END;
$function$;

ALTER FUNCTION ai_pdm_core.ensure_authorized_first_login_account_v1(
  text,text,text,text,text,bigint,timestamptz,text
) OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.ensure_authorized_first_login_account_v1(
  text,text,text,text,text,bigint,timestamptz,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.ensure_authorized_first_login_account_v1(
  text,text,text,text,text,bigint,timestamptz,text
) TO jenfu_ai_pdm_runtime;

COMMIT;
