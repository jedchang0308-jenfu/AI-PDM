-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: additive
-- governance-review: DEV-126
-- LOCAL ONLY: never include in the production migration manifest.
-- These separate entrypoints share the exact 096 publication mutation body.
-- They replace only upstream authority with the PDM-owned local target and
-- fixed administrator account/session authority. No foreign auth is consulted.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $local_target$
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
      OR COALESCE(host(inet_server_addr()),'') NOT IN ('127.0.0.1','::1') THEN
    RAISE EXCEPTION 'LOCAL_TEST_ADMIN_TARGET_REQUIRED';
  END IF;
END;
$local_target$;
SET LOCAL ROLE jenfu_ai_pdm_migrator;
CREATE FUNCTION ai_pdm_core.role_policy_lock_apply_local_test_admin_v1(
  p_request_id uuid, p_draft_id uuid, p_actor_principal_id text, p_session_id_hash text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $lock_apply$
DECLARE
  target ai_pdm_core.local_sandbox_target_metadata%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'DEV127_READ_COMMITTED_REQUIRED' USING ERRCODE='25001';
  END IF;
  SELECT * INTO STRICT target FROM ai_pdm_core.local_sandbox_target_metadata
    WHERE application_id='ai-pdm' AND status='ready' AND database_name=current_database() FOR SHARE;
  PERFORM ai_pdm_core.assert_local_test_admin_target_v1(
    target.sandbox_id,target.generation,target.fixture_hash,target.target_fingerprint);
  IF p_actor_principal_id IS DISTINCT FROM 'pdm-local-test-admin'
      OR p_session_id_hash IS NULL OR p_session_id_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'DEV123_MANAGER_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM ai_pdm_core.principal_accounts
    WHERE principal_id=p_actor_principal_id FOR SHARE;
  PERFORM 1 FROM ai_pdm_core.principal_session_records
    WHERE principal_id=p_actor_principal_id AND session_id_hash=p_session_id_hash FOR SHARE;
  PERFORM 1 FROM ai_pdm_core.role_policy_commands WHERE request_id=p_request_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  PERFORM 1 FROM ai_pdm_core.active_role_catalog active
    JOIN ai_pdm_core.role_catalog_publications publication ON publication.catalog_version=active.catalog_version
    WHERE active.application_id='ai-pdm' FOR UPDATE OF active, publication;
  PERFORM 1 FROM ai_pdm_core.role_policy_drafts WHERE draft_id=p_draft_id FOR UPDATE;
END;
$lock_apply$;
REVOKE ALL ON FUNCTION ai_pdm_core.role_policy_lock_apply_local_test_admin_v1(uuid,uuid,text,text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT EXECUTE ON FUNCTION ai_pdm_core.role_policy_lock_apply_local_test_admin_v1(uuid,uuid,text,text)
  TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.role_policy_apply_local_test_admin_v1(
  p_request_id uuid,
  p_actor_principal_id text,
  p_session_id_hash text,
  p_identity_issuer text,
  p_identity_subject text,
  p_draft_id uuid,
  p_expected_revision integer,
  p_expected_catalog_version text,
  p_expected_catalog_sha256 char(64),
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  existing ai_pdm_core.role_policy_commands%ROWTYPE;
  policy record;
  draft ai_pdm_core.role_policy_drafts%ROWTYPE;
  active_version text;
  active_hash text;
  role_value jsonb;
  role_order bigint;
  result jsonb;
  published_hash text;
  request_hash text;
  actual_diff jsonb;
  role_changes jsonb := '[]'::jsonb;
  capability_changes jsonb := '[]'::jsonb;
  previous_role ai_pdm_core.role_catalog_entries%ROWTYPE;
  action record;
  previous_allowed jsonb;
  next_allowed jsonb;
  previous_format text;
  actor_employee_id text;
BEGIN
  -- The runtime cannot bypass manager/session fencing by invoking this entry
  -- directly. The signed HTTP identity is still verified by the app; this entry
  -- enforces the current owner rows as well as the publication transaction.
  IF p_session_id_hash IS NULL OR p_session_id_hash !~ '^[a-f0-9]{64}$'
     OR p_actor_principal_id IS NULL OR p_identity_issuer IS NULL OR p_identity_subject IS NULL THEN
    RAISE EXCEPTION 'DEV123_MANAGER_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM ai_pdm_core.role_policy_lock_apply_local_test_admin_v1(p_request_id,p_draft_id,p_actor_principal_id,p_session_id_hash);
  SELECT account.employee_id INTO actor_employee_id
  FROM ai_pdm_core.principal_accounts account
  JOIN ai_pdm_core.users profile ON profile.id=account.pdm_user_id AND profile.company_id=account.company_id
  JOIN ai_pdm_core.principal_session_records session ON session.principal_id=account.principal_id
    AND session.session_id_hash=p_session_id_hash
  WHERE account.principal_id=p_actor_principal_id AND account.principal_id='pdm-local-test-admin'
    AND account.employee_id='pdm-local-test-employee' AND account.pdm_user_id='pdm-local-test-admin-user'
    AND account.company_id='company-jenfu' AND account.account_status='active'
    AND profile.role='Admin' AND profile.account_status='active' AND profile.system_role_enabled=1
    AND session.principal_auth_epoch=0
    AND account.system_role_enabled AND account.account_type='human_personal' AND account.minimum_assurance='aal1'
    AND session.revoked_at IS NULL AND session.assurance_level IN ('aal1','aal2')
    AND session.issued_at <= clock_timestamp() AND session.expires_at > clock_timestamp()
    AND session.lifecycle_version=account.lifecycle_version AND session.profile_version=account.profile_version
    AND (account.session_invalid_before IS NULL OR session.issued_at>account.session_invalid_before);
  IF actor_employee_id IS NULL
      OR p_identity_issuer IS DISTINCT FROM 'urn:ai-pdm:local-test-admin'
      OR p_identity_subject IS DISTINCT FROM 'pdm-local-test-admin' THEN
    RAISE EXCEPTION 'DEV123_MANAGER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR p_reason<>normalize(btrim(p_reason),NFC)
     OR char_length(p_reason) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'DEV123_APPLY_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  request_hash := ai_pdm_core.dev123_json_sha256_v1(jsonb_build_object(
    'contractVersion','ai-pdm.role-policy-command.v3','operation','apply','resource','ai-pdm:role-policy',
    'actorPrincipalId',p_actor_principal_id,'payload',jsonb_build_object('reason',p_reason,
      'confirmation',jsonb_build_object('draftId',p_draft_id::text,'draftRevision',p_expected_revision,
        'expectedActive',jsonb_build_object('catalogVersion',p_expected_catalog_version,'catalogSha256',p_expected_catalog_sha256::text)))));
  SELECT * INTO existing FROM ai_pdm_core.role_policy_commands WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.actor_principal_id <> p_actor_principal_id OR existing.request_hash <> request_hash THEN
      RAISE EXCEPTION 'DEV123_REQUEST_ID_REUSE' USING ERRCODE = '23505';
    END IF;
    RETURN existing.result_json;
  END IF;

  SELECT * INTO STRICT policy FROM jsonb_to_record(ai_pdm_core.dev127_policy_definition_v2()) AS source(
    baseline_catalog_version text, baseline_catalog_sha256 text, baseline_role_identity_hash text,
    protected_policy_hash text, role_schema_id text, role_profile_schema_id text, registry_hash text, registry_payload jsonb, application_administrator_role jsonb);

  SELECT publication.catalog_version, publication.catalog_sha256
    INTO active_version, active_hash
  FROM ai_pdm_core.active_role_catalog active
  JOIN ai_pdm_core.role_catalog_publications publication ON publication.catalog_version = active.catalog_version
  WHERE active.application_id = 'ai-pdm' FOR UPDATE OF active, publication;
  IF active_version IS DISTINCT FROM p_expected_catalog_version
     OR active_hash IS DISTINCT FROM p_expected_catalog_sha256 THEN
    RAISE EXCEPTION 'DEV123_ACTIVE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO draft FROM ai_pdm_core.role_policy_drafts WHERE draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR draft.status <> 'OPEN' OR draft.revision <> p_expected_revision
     OR draft.registry_hash <> policy.registry_hash
     OR draft.base_catalog_version <> active_version OR draft.base_catalog_sha256 <> active_hash
     OR draft.candidate_json->>'candidateCatalogVersion' <> draft.candidate_catalog_version
     OR draft.candidate_json->>'registryHash' <> policy.registry_hash
     OR draft.candidate_json->>'baselineRoleIdentityHash' <> policy.baseline_role_identity_hash
     OR draft.candidate_json->>'protectedPolicyHash' <> policy.protected_policy_hash THEN
    RAISE EXCEPTION 'DEV123_DRAFT_CONFLICT' USING ERRCODE = '40001';
  END IF;
  PERFORM ai_pdm_core.dev127_assert_candidate_v2(draft.candidate_json);

  -- Audit content is derived from the locked source and saved candidate. No
  -- caller can supply a fabricated diff or request fingerprint.
  SELECT coalesce(publication_format,'legacy-static-v1') INTO previous_format
    FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=active_version;
  FOR role_value IN SELECT value FROM jsonb_array_elements(draft.candidate_json->'roles') LOOP
    SELECT * INTO previous_role FROM ai_pdm_core.role_catalog_entries
      WHERE catalog_version=active_version AND stable_role_id=role_value->>'stableRoleId';
    IF NOT FOUND THEN
      role_changes := role_changes || jsonb_build_array(jsonb_build_object('type','create',
        'stableRoleId',role_value->>'stableRoleId','displayName',role_value->>'displayName'));
    ELSIF previous_role.role_status IS DISTINCT FROM role_value->>'roleStatus' THEN
      role_changes := role_changes || jsonb_build_array(jsonb_build_object(
        'type',CASE WHEN role_value->>'roleStatus'='active' THEN 'reactivate' ELSE 'deactivate' END,
        'stableRoleId',role_value->>'stableRoleId'));
    END IF;
    FOR action IN SELECT group_id,action_id FROM unnest(ARRAY['drawing','part','model','transfer']) WITH ORDINALITY groups(group_id,group_order)
      CROSS JOIN unnest(ARRAY['view','download','edit','review','publish']) WITH ORDINALITY actions(action_id,action_order)
      ORDER BY group_order,action_order LOOP
      SELECT value->'allowed' INTO previous_allowed FROM jsonb_array_elements(coalesce(previous_role.permissions,'[]'::jsonb))
        WHERE value->>'kind'='action' AND value->>'code'='pdm.'||action.group_id||'.'||action.action_id;
      SELECT value->'allowed' INTO next_allowed FROM jsonb_array_elements(role_value->'permissions')
        WHERE value->>'kind'='action' AND value->>'code'='pdm.'||action.group_id||'.'||action.action_id;
      IF previous_allowed IS DISTINCT FROM next_allowed THEN
        capability_changes := capability_changes || jsonb_build_array(jsonb_build_object(
          'stableRoleId',role_value->>'stableRoleId','groupId',action.group_id,'actionId',action.action_id,
          'before',coalesce(previous_allowed='true'::jsonb,false),'after',coalesce(next_allowed='true'::jsonb,false)));
      END IF;
    END LOOP;
  END LOOP;
  actual_diff := jsonb_build_object('roleChanges',role_changes,'capabilityChanges',capability_changes,
    'profileChanges','[]'::jsonb,'policyTransition',CASE WHEN previous_format='dynamic-policy-v2' THEN 'dynamic-update' ELSE 'legacy-to-dynamic' END,
    'scopeImpact','application-global');
  IF previous_format='dynamic-policy-v2' AND role_changes='[]'::jsonb AND capability_changes='[]'::jsonb THEN
    RAISE EXCEPTION 'DEV123_NO_CHANGE' USING ERRCODE='22023';
  END IF;

  published_hash := ai_pdm_core.dev123_json_sha256_v1(draft.candidate_json - 'identityHashes');
  UPDATE ai_pdm_core.role_catalog_publications SET status = 'retired', retired_at = clock_timestamp()
   WHERE application_id = 'ai-pdm' AND catalog_version = active_version AND status = 'active';

  INSERT INTO ai_pdm_core.role_catalog_publications (
    catalog_version, contract_version, application_id, published_at, catalog_sha256, status, published_by,
    publication_format, canonicalization_version, role_schema_id, role_profile_schema_id,
    baseline_role_identity_hash, role_identity_hash, role_profile_hash, protected_policy_hash,
    registry_hash, role_profiles, policy_draft_id, base_catalog_version, base_catalog_sha256,
    command_id, publish_reason
  ) VALUES (
    draft.candidate_catalog_version, 'jenfu.platform-entitlement.v1', 'ai-pdm', clock_timestamp(),
    published_hash, 'active', p_actor_principal_id, 'dynamic-policy-v2', 'jenfu.canonical-json.v1',
    policy.role_schema_id, policy.role_profile_schema_id, policy.baseline_role_identity_hash,
    draft.candidate_json->>'roleIdentityHash', draft.candidate_json->>'roleProfileHash',
    policy.protected_policy_hash, policy.registry_hash, draft.candidate_json->'roleProfiles',
    draft.draft_id, active_version, active_hash, p_request_id, btrim(p_reason)
  );

  FOR role_value, role_order IN
    SELECT value, ordinality FROM jsonb_array_elements(draft.candidate_json->'roles') WITH ORDINALITY
  LOOP
    INSERT INTO ai_pdm_core.role_catalog_entries (
      catalog_version, display_order, stable_role_id, role_code, display_name, assignable, risk,
      subject_kind, recommendation_allowed, delegation_allowed, allowed_scope_kinds,
      assignment_tier, permissions, metadata, role_definition_hash, role_status
    ) VALUES (
      draft.candidate_catalog_version, (role_order - 1)::integer, role_value->>'stableRoleId',
      role_value->>'roleCode', role_value->>'displayName', (role_value->>'assignable')::boolean,
      role_value->>'risk', role_value->>'subjectKind', (role_value->>'recommendationAllowed')::boolean,
      (role_value->>'delegationAllowed')::boolean, role_value->'allowedScopeKinds',
      role_value->>'assignmentTier', role_value->'permissions', role_value->'metadata',
      role_value->>'roleDefinitionHash', role_value->>'roleStatus'
    );
    INSERT INTO ai_pdm_core.role_policy_role_identities (
      stable_role_id, role_code, display_name, origin, identity_json, identity_hash, first_catalog_version
    ) VALUES (
      role_value->>'stableRoleId', role_value->>'roleCode', role_value->>'displayName',
      CASE WHEN role_value->>'stableRoleId' LIKE 'role-custom-%' THEN 'custom' ELSE 'builtin' END,
      role_value - 'permissions' - 'roleStatus' - 'roleDefinitionHash',
      draft.candidate_json->'identityHashes'->>(role_value->>'stableRoleId'),
      draft.candidate_catalog_version
    ) ON CONFLICT (stable_role_id) DO NOTHING;
  END LOOP;

  UPDATE ai_pdm_core.active_role_catalog
     SET catalog_version = draft.candidate_catalog_version, activated_at = clock_timestamp(),
         activated_by = p_actor_principal_id, activation_reason = btrim(p_reason)
   WHERE application_id = 'ai-pdm' AND catalog_version = active_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEV123_ACTIVE_POINTER_CONFLICT' USING ERRCODE = '40001'; END IF;

  UPDATE ai_pdm_core.role_policy_drafts
     SET status = 'APPLIED', updated_by = p_actor_principal_id, updated_at = clock_timestamp(),
         applied_catalog_version = candidate_catalog_version, applied_command_id = p_request_id
   WHERE draft_id = draft.draft_id;

  result := jsonb_build_object(
    'status', 'ACTIVE', 'catalogVersion', draft.candidate_catalog_version,
    'catalogSha256', published_hash,
    'previousActive', jsonb_build_object('catalogVersion', active_version, 'catalogSha256', active_hash),
    'applyCommandId', p_request_id::text
  );
  INSERT INTO ai_pdm_core.role_policy_commands (
    request_id, actor_principal_id, request_hash,
    result_json, draft_id, catalog_version, before_tuple, after_tuple, diff_json, reason
  ) VALUES (
    p_request_id, p_actor_principal_id, request_hash, result,
    draft.draft_id, draft.candidate_catalog_version,
    jsonb_build_object('catalogVersion', active_version, 'catalogSha256', active_hash),
    jsonb_build_object('catalogVersion', draft.candidate_catalog_version, 'catalogSha256', published_hash),
    actual_diff, p_reason
  );
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.role_policy_apply_local_test_admin_v1(uuid,text,text,text,text,uuid,integer,text,char,text)
  FROM PUBLIC,jenfu_platform_runtime,jenfu_orgmaster_runtime,jenfu_ai_pdm_runtime,jenfu_r1_verifier;
GRANT EXECUTE ON FUNCTION ai_pdm_core.role_policy_apply_local_test_admin_v1(uuid,text,text,text,text,uuid,integer,text,char,text)
  TO jenfu_ai_pdm_runtime;
COMMIT;
