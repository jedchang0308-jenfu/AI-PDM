-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: additive policy writes using an issuer-bound PDM session
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Only the two login readers below can record manager authority. The runtime
-- can register a session JSON document, so that document alone cannot admit a
-- call to a privileged native policy writer.
CREATE TABLE ai_pdm_core.role_policy_session_authority (
  principal_id text NOT NULL,
  session_id_hash char(64) NOT NULL CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  source_boundary timestamptz,
  PRIMARY KEY (principal_id, session_id_hash),
  FOREIGN KEY (principal_id, session_id_hash)
    REFERENCES ai_pdm_core.principal_session_records(principal_id, session_id_hash)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
REVOKE ALL ON ai_pdm_core.role_policy_session_authority FROM PUBLIC, jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.record_role_policy_session_authority_v1(
  p_source jsonb, p_principal text, p_employee text, p_issuer text, p_subject text, p_hash text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
  INSERT INTO ai_pdm_core.role_policy_session_authority
    (principal_id,session_id_hash,identity_issuer,identity_subject,source_boundary)
  SELECT p_principal,p_hash,p_issuer,p_subject,(p_source->>'next_boundary')::timestamptz
  WHERE p_source->>'contract_version' = 'orgmaster.ai-pdm-session-authority.v1'
    AND p_source->>'source_version' IS NOT NULL
    AND (p_source->>'evaluated_at')::timestamptz = transaction_timestamp()
    AND jsonb_array_length(p_source->'accounts') BETWEEN 1 AND 2
    AND jsonb_array_length(p_source->'grants') BETWEEN 1 AND 32
    AND p_hash ~ '^[0-9a-f]{64}$'
    AND NOT EXISTS (SELECT 1 FROM ai_pdm_core.principal_session_records WHERE session_id_hash=p_hash)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_source->'accounts') AS account(value)
      JOIN ai_pdm_core.principal_accounts local_account ON local_account.principal_id=p_principal
        AND local_account.employee_id=p_employee AND local_account.account_type=account.value->>'account_type'
      CROSS JOIN jsonb_array_elements(p_source->'grants') AS grant_row(value)
      WHERE account.value->>'contract_version'='organization.active-principal.v1'
        AND account.value->>'principal_id'=p_principal AND account.value->>'employee_id'=p_employee
        AND account.value->>'principal_issuer'=p_issuer AND account.value->>'principal_subject'=p_subject
        AND account.value->>'employee_status'='active'
        AND local_account.account_status='active' AND local_account.system_role_enabled
        AND local_account.account_type IN ('human_personal','human_privileged')
        AND grant_row.value->>'contract_version'='jenfu.orgmaster.ai-pdm-principal-grants.v6'
        AND grant_row.value->>'application_id'='ai-pdm'
        AND grant_row.value->>'principal_id'=p_principal AND grant_row.value->>'employee_id'=p_employee
        AND grant_row.value->>'grant_kind'='direct' AND grant_row.value->>'delegation_id' IS NULL
        AND grant_row.value->>'subject_kind'='principal' AND grant_row.value->>'target_principal_id'=p_principal
        AND grant_row.value->>'scope_kind'='global' AND grant_row.value->>'scope_key' IS NULL
        AND (grant_row.value->>'valid_from')::timestamptz <= transaction_timestamp()
        AND ((grant_row.value->>'valid_until') IS NULL OR
             (grant_row.value->>'valid_until')::timestamptz > transaction_timestamp())
        AND ((grant_row.value->>'stable_role_id'='role-application-system-admin'
              AND grant_row.value->>'role_code'='application_system_admin' AND grant_row.value->>'source_grant_id' IS NOT NULL)
          OR (grant_row.value->>'stable_role_id'='role-system-admin'
              AND grant_row.value->>'role_code'='system_admin' AND local_account.account_type='human_privileged'))
    );
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.record_role_policy_session_authority_v1(jsonb,text,text,text,text,text)
  FROM PUBLIC, jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.read_principal_session_authority_v2(
  p_principal text,p_employee text,p_issuer text,p_subject text,p_hash text
) RETURNS TABLE(contract_version text,source_version text,evaluated_at text,next_boundary text,accounts jsonb,grants jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  source record;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'DEV121_SERIALIZABLE_LOGIN_REQUIRED' USING ERRCODE='25001';
  END IF;
  SELECT * INTO source FROM orgmaster_contract.read_ai_pdm_session_authority_v1(p_principal,p_employee);
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM ai_pdm_core.record_role_policy_session_authority_v1(
    to_jsonb(source),p_principal,p_employee,p_issuer,p_subject,p_hash);
  RETURN QUERY SELECT source.contract_version,source.source_version,source.evaluated_at::text,
    source.next_boundary::text,source.accounts,source.grants;
END;
$function$;

CREATE FUNCTION ai_pdm_core.ensure_principal_session_account_v3(
  p_issuer text,p_subject text,p_principal text,p_employee text,p_account_type text,
  p_mapping_version bigint,p_published_at timestamptz,p_verified_email text,p_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  receipt jsonb;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'DEV121_SERIALIZABLE_LOGIN_REQUIRED' USING ERRCODE='25001';
  END IF;
  receipt := ai_pdm_core.ensure_principal_session_account_v2(
    p_issuer,p_subject,p_principal,p_employee,p_account_type,p_mapping_version,p_published_at,p_verified_email);
  PERFORM ai_pdm_core.record_role_policy_session_authority_v1(
    receipt->'authority',p_principal,p_employee,p_issuer,p_subject,p_hash);
  RETURN receipt;
END;
$function$;

CREATE FUNCTION ai_pdm_core.lock_role_policy_catalog_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'DEV127_READ_COMMITTED_REQUIRED' USING ERRCODE='25001';
  END IF;
  PERFORM 1 FROM ai_pdm_core.active_role_catalog active
    JOIN ai_pdm_core.role_catalog_publications publication ON publication.catalog_version=active.catalog_version
    WHERE active.application_id='ai-pdm' FOR UPDATE OF active,publication;
END;
$function$;

CREATE FUNCTION ai_pdm_core.require_role_policy_session_manager_v1(
  p_principal text,p_hash text,p_issuer text,p_subject text
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  deadline timestamptz;
BEGIN
  -- Catalog first, then the local account and the session row used by revocation.
  PERFORM ai_pdm_core.lock_role_policy_catalog_v1();
  PERFORM 1 FROM ai_pdm_core.principal_accounts WHERE principal_id=p_principal FOR SHARE;
  PERFORM 1 FROM ai_pdm_core.principal_session_records
    WHERE principal_id=p_principal AND session_id_hash=p_hash FOR SHARE;
  SELECT least(session.expires_at,authority.source_boundary) INTO deadline
  FROM ai_pdm_core.principal_session_records session
  JOIN ai_pdm_core.role_policy_session_authority authority USING (principal_id,session_id_hash)
  JOIN ai_pdm_core.principal_accounts account USING (principal_id)
  JOIN ai_pdm_core.users profile ON profile.id=account.pdm_user_id AND profile.company_id=account.company_id
  JOIN ai_pdm_core.active_role_catalog catalog ON catalog.application_id='ai-pdm'
    AND catalog.catalog_version=session.permission_snapshot->>'catalogVersion'
  WHERE session.principal_id=p_principal AND session.session_id_hash=p_hash
    AND authority.identity_issuer=p_issuer AND authority.identity_subject=p_subject
    AND account.account_status='active' AND account.system_role_enabled
    AND account.account_type IN ('human_personal','human_privileged')
    AND session.revoked_at IS NULL AND session.assurance_level IN ('aal1','aal2')
    AND session.permission_snapshot->'version'='1'::jsonb
    AND session.permission_snapshot->'canManageRolePolicy'='true'::jsonb
    AND session.issued_at<=clock_timestamp()
    AND session.lifecycle_version=account.lifecycle_version AND session.profile_version=account.profile_version
    AND (account.session_invalid_before IS NULL OR session.issued_at>account.session_invalid_before);
  IF deadline IS NULL OR deadline<=clock_timestamp() THEN
    RAISE EXCEPTION 'DEV123_MANAGER_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN deadline;
END;
$function$;

CREATE FUNCTION ai_pdm_core.role_policy_lock_apply_snapshot_v1(
  p_request_id uuid,p_draft_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM ai_pdm_core.lock_role_policy_catalog_v1();
  PERFORM 1 FROM ai_pdm_core.role_policy_commands WHERE request_id=p_request_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  PERFORM 1 FROM ai_pdm_core.role_policy_drafts WHERE draft_id=p_draft_id FOR UPDATE;
END;
$function$;

-- Preserve the installed 096 native policy validation and mutation body.
-- The substitutions are limited to admission and the final expiry recheck.
DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'ai_pdm_core.role_policy_apply_v2(uuid,text,text,text,text,uuid,integer,text,character,text)'::regprocedure);
  start_at integer;
  end_at integer;
BEGIN
  start_at := strpos(definition,'  PERFORM ai_pdm_core.role_policy_lock_apply_v2(');
  end_at := strpos(definition,'  IF p_reason IS NULL');
  IF start_at=0 OR end_at<=start_at OR strpos(definition,'actor_employee_id text;')=0
      OR strpos(definition,'  RETURN result;')=0 THEN
    RAISE EXCEPTION 'DEV121_ROLE_POLICY_NATIVE_SOURCE_DRIFT';
  END IF;
  definition := overlay(definition PLACING (
    E'  PERFORM ai_pdm_core.role_policy_lock_apply_snapshot_v1(p_request_id,p_draft_id);\n' ||
    E'  manager_deadline := ai_pdm_core.require_role_policy_session_manager_v1(p_actor_principal_id,p_session_id_hash,p_identity_issuer,p_identity_subject);\n'
    ) FROM start_at FOR end_at-start_at);
  definition := replace(definition,'ai_pdm_core.role_policy_apply_v2(','ai_pdm_core.role_policy_apply_snapshot_v1(');
  definition := replace(definition,'''ai_pdm_core'', ''orgmaster_contract'', ''pg_catalog''','''pg_catalog''');
  definition := replace(definition,'actor_employee_id text;','manager_deadline timestamptz;');
  definition := replace(definition,'  RETURN result;',
    E'  IF manager_deadline<=clock_timestamp() THEN\n' ||
    E'    RAISE EXCEPTION ''DEV123_MANAGER_REQUIRED'' USING ERRCODE=''42501'';\n' ||
    E'  END IF;\n  RETURN result;');
  IF definition ~ '(orgmaster_contract|platform_contract)' THEN
    RAISE EXCEPTION 'DEV121_ROLE_POLICY_NATIVE_SOURCE_DRIFT';
  END IF;
  EXECUTE definition;
END;
$migration$;

REVOKE ALL ON FUNCTION ai_pdm_core.read_principal_session_authority_v2(text,text,text,text,text),
  ai_pdm_core.ensure_principal_session_account_v3(text,text,text,text,text,bigint,timestamptz,text,text),
  ai_pdm_core.lock_role_policy_catalog_v1(),
  ai_pdm_core.require_role_policy_session_manager_v1(text,text,text,text),
  ai_pdm_core.role_policy_lock_apply_snapshot_v1(uuid,uuid),
  ai_pdm_core.role_policy_apply_snapshot_v1(uuid,text,text,text,text,uuid,integer,text,char,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.read_principal_session_authority_v2(text,text,text,text,text),
  ai_pdm_core.ensure_principal_session_account_v3(text,text,text,text,text,bigint,timestamptz,text,text),
  ai_pdm_core.lock_role_policy_catalog_v1(),
  ai_pdm_core.require_role_policy_session_manager_v1(text,text,text,text),
  ai_pdm_core.role_policy_lock_apply_snapshot_v1(uuid,uuid),
  ai_pdm_core.role_policy_apply_snapshot_v1(uuid,text,text,text,text,uuid,integer,text,char,text) TO jenfu_ai_pdm_runtime;
COMMIT;
