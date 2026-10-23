-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: validated atomic apply; published v2 shape remains versioned
-- compatibility: new-version
-- governance-review: AIPDM/DEV-123
-- Unreleased function installation; no role activation or share/grant rewrite.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE FUNCTION ai_pdm_core.dev123_policy_definition_v1() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $definition$
SELECT '{"baseline_catalog_version":"ai-pdm.role-catalog.2026-10-10.v7","baseline_catalog_sha256":"4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9","baseline_role_identity_hash":"265483921bbdadfdf8933f1d0cdcbebc1b4df42983c84784a7176fdd5f05d55c","protected_policy_hash":"604184ece311dabaf4cc7c0fec8ac802425f79363933d2d66ea67c82369803a6","role_schema_id":"ai-pdm.role-schema.flexible.v2","role_profile_schema_id":"ai-pdm.role-profile-schema.v1","registry_hash":"c2340c96a64004538b11fd59b1a1c4f03a88779c7db722f583037b4dc6c49869","registry_payload":{"roleProfiles":[{"stableRoleId":"role-rd","permissionRoleId":"role-rd","presentationName":"RD","presentationOrder":0,"assignmentDisposition":"selectable"},{"stableRoleId":"role-rd-manager","permissionRoleId":"role-rd-manager","presentationName":"RD主管","presentationOrder":1,"assignmentDisposition":"selectable"},{"stableRoleId":"role-qa","permissionRoleId":"role-qa","presentationName":"QA/QC","presentationOrder":2,"assignmentDisposition":"selectable"},{"stableRoleId":"role-manufacturing","permissionRoleId":"role-manufacturing","presentationName":"生產人員","presentationOrder":3,"assignmentDisposition":"selectable"},{"stableRoleId":"role-production-planning","permissionRoleId":"role-procurement","presentationName":"採購／生管（舊生管指派）","presentationOrder":4,"assignmentDisposition":"legacy-only"},{"stableRoleId":"role-procurement","permissionRoleId":"role-procurement","presentationName":"採購／生管","presentationOrder":4,"assignmentDisposition":"selectable"},{"stableRoleId":"role-external-specialist","permissionRoleId":"role-external-specialist","presentationName":"外部專員","presentationOrder":5,"assignmentDisposition":"selectable"},{"stableRoleId":"role-pdm-admin","permissionRoleId":"role-pdm-admin","presentationName":"PDM管理員","presentationOrder":6,"assignmentDisposition":"selectable"},{"stableRoleId":"role-system-admin","permissionRoleId":"role-system-admin","presentationName":"系統管理員","presentationOrder":8,"assignmentDisposition":"hidden-protected"}]}}'::jsonb
$definition$;
-- This bounded canonicalizer implements the already-versioned integer-only JSON
-- contract. It never trusts a client-supplied hash or JSONB key order.
CREATE FUNCTION ai_pdm_core.dev123_canonical_json_v1(p_value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $canonical$
DECLARE result text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT '{' || coalesce(string_agg(to_jsonb(key)::text || ':' ||
        ai_pdm_core.dev123_canonical_json_v1(value), ',' ORDER BY key COLLATE "C"), '') || '}'
        INTO result FROM jsonb_each(p_value);
    WHEN 'array' THEN
      SELECT '[' || coalesce(string_agg(ai_pdm_core.dev123_canonical_json_v1(value), ',' ORDER BY ordinal), '') || ']'
        INTO result FROM jsonb_array_elements(p_value) WITH ORDINALITY elements(value, ordinal);
    WHEN 'number' THEN
      IF p_value::text !~ '^-?(0|[1-9][0-9]*)$' THEN
        RAISE EXCEPTION 'DEV123_CANONICAL_NUMBER_INVALID' USING ERRCODE='22023';
      END IF;
      result := p_value::text;
    ELSE result := p_value::text;
  END CASE;
  RETURN result;
END;
$canonical$;

CREATE FUNCTION ai_pdm_core.dev123_json_sha256_v1(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog AS $hash$
  SELECT encode(sha256(convert_to(ai_pdm_core.dev123_canonical_json_v1(p_value),'UTF8')),'hex')
$hash$;

CREATE FUNCTION ai_pdm_core.dev123_assert_candidate_v1(p_candidate jsonb)
RETURNS void LANGUAGE plpgsql
SET search_path = ai_pdm_core, pg_catalog AS $validate$
DECLARE
  state record;
  role_value jsonb; profile jsonb; expected_profile jsonb; identity_value jsonb;
  permission_value jsonb; frozen_permissions jsonb; expected_permissions jsonb;
  normalized_permissions jsonb; prior_identity jsonb; builtin_role jsonb;
  identities jsonb := '[]'::jsonb; identity_hashes jsonb := '{}'::jsonb;
  ordinal bigint; role_count integer; is_builtin boolean; role_id text; name_value text;
  seen_ids text[] := '{}'; seen_codes text[] := '{}'; seen_names text[] := '{}';
  known_actions text[]; expected_identity jsonb;
BEGIN
  SELECT * INTO STRICT state FROM jsonb_to_record(ai_pdm_core.dev123_policy_definition_v1()) AS source(
    baseline_catalog_version text, baseline_catalog_sha256 text, baseline_role_identity_hash text,
    protected_policy_hash text, role_schema_id text, role_profile_schema_id text, registry_hash text, registry_payload jsonb);
  IF jsonb_typeof(p_candidate)='object' AND NOT p_candidate ? 'contentHash' THEN
    p_candidate := p_candidate || jsonb_build_object('contentHash',
      ai_pdm_core.dev123_json_sha256_v1(p_candidate - 'identityHashes'));
  END IF;
  SELECT array_agg('pdm.' || group_id || '.' || action_id ORDER BY group_id,action_id)
    INTO known_actions FROM unnest(ARRAY['drawing','part','model','transfer']) group_id
    CROSS JOIN unnest(ARRAY['view','download','edit','review','publish']) action_id;
  IF jsonb_typeof(p_candidate) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(p_candidate)) <> 14
      OR p_candidate - ARRAY['format','applicationId','candidateCatalogVersion',
        'roleSchemaId','roleProfileSchemaId','registryHash','baselineRoleIdentityHash',
        'roleIdentityHash','roleProfileHash','protectedPolicyHash','roles','roleProfiles',
        'identityHashes','contentHash'] <> '{}'::jsonb
      OR coalesce(p_candidate->>'candidateCatalogVersion','') !~
        '^ai-pdm\.role-policy\.[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
    RAISE EXCEPTION 'DEV123_CANDIDATE_SCHEMA_INVALID' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_candidate->'roles') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_candidate->'roleProfiles') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DEV123_CANDIDATE_INVALID' USING ERRCODE='22023';
  END IF;
  role_count := jsonb_array_length(p_candidate->'roles');
  IF role_count NOT BETWEEN 9 AND 64 OR jsonb_array_length(p_candidate->'roleProfiles') <> role_count
      OR p_candidate->>'format' IS DISTINCT FROM 'dynamic-policy-v1'
      OR p_candidate->>'applicationId' IS DISTINCT FROM 'ai-pdm'
      OR p_candidate->>'roleSchemaId' IS DISTINCT FROM state.role_schema_id
      OR p_candidate->>'roleProfileSchemaId' IS DISTINCT FROM state.role_profile_schema_id
      OR p_candidate->>'registryHash' IS DISTINCT FROM state.registry_hash::text
      OR p_candidate->>'baselineRoleIdentityHash' IS DISTINCT FROM state.baseline_role_identity_hash::text
      OR p_candidate->>'protectedPolicyHash' IS DISTINCT FROM state.protected_policy_hash::text
      OR p_candidate->>'contentHash' IS DISTINCT FROM
        ai_pdm_core.dev123_json_sha256_v1(p_candidate - ARRAY['contentHash','identityHashes']) THEN
    RAISE EXCEPTION 'DEV123_CANDIDATE_INVALID' USING ERRCODE='22023';
  END IF;
  FOR role_value, ordinal IN SELECT value, ordinality
      FROM jsonb_array_elements(p_candidate->'roles') WITH ORDINALITY LOOP
    role_id := role_value->>'stableRoleId'; name_value := role_value->>'displayName';
    identity_value := role_value - ARRAY['permissions','roleStatus','roleDefinitionHash'];
    profile := p_candidate->'roleProfiles'->((ordinal-1)::integer);
    is_builtin := ordinal <= 9;
    IF role_id IS NULL OR role_id=ANY(seen_ids) OR (role_value->>'roleCode')=ANY(seen_codes)
        OR name_value IS NULL OR name_value=ANY(seen_names)
        OR char_length(name_value) NOT BETWEEN 1 AND 80 OR name_value <> normalize(btrim(name_value),NFC)
        OR role_value->>'roleStatus' NOT IN ('active','inactive')
        OR role_value->>'roleStatus' IS NULL
        OR jsonb_typeof(role_value->'permissions') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'DEV123_CANDIDATE_IDENTITY_INVALID' USING ERRCODE='22023';
    END IF;
    SELECT identity_json INTO prior_identity FROM ai_pdm_core.role_policy_role_identities WHERE stable_role_id=role_id;
    IF prior_identity IS NOT NULL AND identity_value IS DISTINCT FROM prior_identity THEN
      RAISE EXCEPTION 'DEV123_IDENTITY_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    IF is_builtin THEN
      expected_profile := state.registry_payload->'roleProfiles'->((ordinal-1)::integer);
      IF profile IS DISTINCT FROM expected_profile OR role_id IS DISTINCT FROM expected_profile->>'stableRoleId'
          OR prior_identity IS NULL THEN
        RAISE EXCEPTION 'DEV123_BUILTIN_PROFILE_INVALID' USING ERRCODE='22023';
      END IF;
    ELSE
      expected_identity := jsonb_build_object('stableRoleId',role_id,'roleCode',role_value->>'roleCode',
        'displayName',name_value,'assignable',true,'risk','normal','subjectKind','employee',
        'recommendationAllowed',true,'delegationAllowed',true,'allowedScopeKinds',jsonb_build_array('workspace'),
        'assignmentTier','app_admin','metadata',NULL);
      expected_profile := jsonb_build_object('stableRoleId',role_id,'permissionRoleId',role_id,
        'presentationName',name_value,'presentationOrder',ordinal-3,'assignmentDisposition','selectable');
      IF role_id !~ '^role-custom-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
          OR role_value->>'roleCode' IS DISTINCT FROM 'custom_' || replace(substring(role_id FROM 13),'-','')
          OR identity_value IS DISTINCT FROM expected_identity OR profile IS DISTINCT FROM expected_profile
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(state.registry_payload->'roleProfiles') fixed
            WHERE fixed->>'presentationName'=name_value)
          OR EXISTS(SELECT 1 FROM ai_pdm_core.role_policy_role_identities claim
            WHERE claim.display_name_nfc=normalize(name_value,NFC) AND claim.stable_role_id<>role_id) THEN
        RAISE EXCEPTION 'DEV123_CUSTOM_ROLE_INVALID' USING ERRCODE='22023';
      END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(role_value->'permissions') permission
        WHERE jsonb_typeof(permission) IS DISTINCT FROM 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(permission))<>3
          OR permission->>'kind' IS NULL OR permission->>'kind' NOT IN ('page','action')
          OR jsonb_typeof(permission->'code') IS DISTINCT FROM 'string'
          OR jsonb_typeof(permission->'allowed') IS DISTINCT FROM 'boolean')
        OR (SELECT count(*) FROM jsonb_array_elements(role_value->'permissions')) <>
           (SELECT count(DISTINCT (permission->>'kind',permission->>'code'))
             FROM jsonb_array_elements(role_value->'permissions') permission) THEN
      RAISE EXCEPTION 'DEV123_PERMISSION_INVALID' USING ERRCODE='22023';
    END IF;
    SELECT coalesce(jsonb_agg(permission ORDER BY (permission->>'kind') COLLATE "C",(permission->>'code') COLLATE "C"),'[]')
      INTO normalized_permissions FROM jsonb_array_elements(role_value->'permissions') permission;
    IF is_builtin THEN
      SELECT entry.permissions INTO builtin_role FROM ai_pdm_core.role_catalog_entries entry
        WHERE entry.catalog_version=state.baseline_catalog_version AND entry.stable_role_id=role_id;
      IF role_id='role-system-admin' THEN
        IF role_value->>'roleStatus' <> 'active' THEN RAISE EXCEPTION 'DEV123_PROTECTED_ROLE_INVALID'; END IF;
        SELECT coalesce(jsonb_agg(permission ORDER BY (permission->>'kind') COLLATE "C",(permission->>'code') COLLATE "C"),'[]')
          INTO expected_permissions FROM (
            SELECT value permission FROM jsonb_array_elements(builtin_role)
            UNION ALL SELECT jsonb_build_object('kind','action','code',code,'allowed',true) FROM unnest(known_actions) code
          ) permissions;
        IF normalized_permissions IS DISTINCT FROM expected_permissions THEN
          RAISE EXCEPTION 'DEV123_PROTECTED_PERMISSION_INVALID' USING ERRCODE='22023';
        END IF;
      ELSE
        SELECT coalesce(jsonb_agg(permission ORDER BY (permission->>'kind') COLLATE "C",(permission->>'code') COLLATE "C"),'[]')
          INTO frozen_permissions FROM jsonb_array_elements(role_value->'permissions') permission
          WHERE permission->>'kind'<>'action' OR NOT (permission->>'code'=ANY(known_actions));
        SELECT coalesce(jsonb_agg(permission ORDER BY (permission->>'kind') COLLATE "C",(permission->>'code') COLLATE "C"),'[]')
          INTO expected_permissions FROM jsonb_array_elements(builtin_role) permission;
        IF frozen_permissions IS DISTINCT FROM expected_permissions
            OR (role_id='role-production-planning' AND normalized_permissions IS DISTINCT FROM frozen_permissions) THEN
          RAISE EXCEPTION 'DEV123_FROZEN_PERMISSION_INVALID' USING ERRCODE='22023';
        END IF;
      END IF;
    ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(role_value->'permissions') permission
        WHERE permission->>'kind'<>'action' OR NOT(permission->>'code'=ANY(known_actions))
          OR permission->>'allowed'<>'true') THEN
      RAISE EXCEPTION 'DEV123_CUSTOM_PERMISSION_INVALID' USING ERRCODE='22023';
    END IF;
    IF role_id='role-external-specialist' AND EXISTS(
        SELECT 1 FROM jsonb_array_elements(role_value->'permissions') permission
        WHERE permission->>'code'=ANY(known_actions) AND permission->>'code' !~ '^pdm\.(drawing|part|model|transfer)\.view$') THEN
      RAISE EXCEPTION 'DEV123_EXTERNAL_SCOPE_INVALID' USING ERRCODE='22023';
    END IF;
    IF role_value->>'roleDefinitionHash' IS DISTINCT FROM ai_pdm_core.dev123_json_sha256_v1(
        identity_value || jsonb_build_object('roleStatus',role_value->'roleStatus','permissions',normalized_permissions)) THEN
      RAISE EXCEPTION 'DEV123_ROLE_HASH_INVALID' USING ERRCODE='22023';
    END IF;
    identities := identities || jsonb_build_array(identity_value);
    identity_hashes := identity_hashes || jsonb_build_object(role_id,ai_pdm_core.dev123_json_sha256_v1(identity_value));
    seen_ids := array_append(seen_ids,role_id);
    seen_codes := array_append(seen_codes,role_value->>'roleCode');
    seen_names := array_append(seen_names,name_value);
  END LOOP;
  IF p_candidate->'roles'->4->>'roleStatus' IS DISTINCT FROM p_candidate->'roles'->5->>'roleStatus'
      OR p_candidate->>'roleIdentityHash' IS DISTINCT FROM ai_pdm_core.dev123_json_sha256_v1(identities)
      OR p_candidate->'identityHashes' IS DISTINCT FROM identity_hashes
      OR p_candidate->>'roleProfileHash' IS DISTINCT FROM ai_pdm_core.dev123_json_sha256_v1(p_candidate->'roleProfiles')
      OR EXISTS(SELECT 1 FROM ai_pdm_core.active_role_catalog active
        JOIN ai_pdm_core.role_catalog_entries entry ON entry.catalog_version=active.catalog_version
        WHERE active.application_id='ai-pdm' AND NOT(entry.stable_role_id=ANY(seen_ids))) THEN
    RAISE EXCEPTION 'DEV123_CANDIDATE_INCOMPLETE' USING ERRCODE='22023';
  END IF;
END;
$validate$;

-- Obtain every potentially contended apply row before the service re-admits
-- its verified session and management grant in a separate statement.
CREATE FUNCTION ai_pdm_core.role_policy_lock_apply_v1(
  p_request_id uuid, p_draft_id uuid, p_actor_principal_id text, p_session_id_hash text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $lock_apply$
BEGIN
  PERFORM orgmaster_contract.lock_ai_pdm_role_policy_authority_v1();
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
REVOKE ALL ON FUNCTION ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT EXECUTE ON FUNCTION ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text)
  TO jenfu_ai_pdm_runtime;

CREATE OR REPLACE FUNCTION ai_pdm_core.role_policy_apply_v1(
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
SET search_path = ai_pdm_core, orgmaster_contract, pg_catalog
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
  PERFORM ai_pdm_core.role_policy_lock_apply_v1(p_request_id,p_draft_id,p_actor_principal_id,p_session_id_hash);
  SELECT account.employee_id INTO actor_employee_id
  FROM ai_pdm_core.principal_accounts account
  JOIN ai_pdm_core.users profile ON profile.id=account.pdm_user_id AND profile.company_id=account.company_id
  JOIN ai_pdm_core.principal_session_records session ON session.principal_id=account.principal_id
    AND session.session_id_hash=p_session_id_hash
  JOIN LATERAL platform_contract.read_principal_auth_state_v3(account.principal_id) epoch
    ON epoch.principal_id=account.principal_id AND epoch.auth_epoch=session.principal_auth_epoch
  WHERE account.principal_id=p_actor_principal_id AND account.account_status='active'
    AND account.system_role_enabled AND account.account_type='human_privileged'
    AND session.revoked_at IS NULL AND session.assurance_level='aal2'
    AND session.issued_at <= clock_timestamp() AND session.expires_at > clock_timestamp()
    AND session.lifecycle_version=account.lifecycle_version AND session.profile_version=account.profile_version
    AND (epoch.revoked_before IS NULL OR session.authenticated_at>epoch.revoked_before)
    AND (account.session_invalid_before IS NULL OR session.issued_at>account.session_invalid_before);
  IF actor_employee_id IS NULL OR NOT orgmaster_contract.ai_pdm_role_policy_manager_eligible_v1(
      p_actor_principal_id,actor_employee_id,p_identity_issuer,p_identity_subject) THEN
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

  SELECT * INTO STRICT policy FROM jsonb_to_record(ai_pdm_core.dev123_policy_definition_v1()) AS source(
    baseline_catalog_version text, baseline_catalog_sha256 text, baseline_role_identity_hash text,
    protected_policy_hash text, role_schema_id text, role_profile_schema_id text, registry_hash text, registry_payload jsonb);

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
  PERFORM ai_pdm_core.dev123_assert_candidate_v1(draft.candidate_json);

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
    'profileChanges','[]'::jsonb,'policyTransition',CASE WHEN previous_format='dynamic-policy-v1' THEN 'dynamic-update' ELSE 'legacy-to-dynamic' END,
    'scopeImpact','application-global');
  IF previous_format='dynamic-policy-v1' AND role_changes='[]'::jsonb AND capability_changes='[]'::jsonb THEN
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
    published_hash, 'active', p_actor_principal_id, 'dynamic-policy-v1', 'jenfu.canonical-json.v1',
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

REVOKE ALL ON FUNCTION ai_pdm_core.dev123_canonical_json_v1(jsonb),
  ai_pdm_core.dev123_json_sha256_v1(jsonb), ai_pdm_core.dev123_assert_candidate_v1(jsonb),
  ai_pdm_core.dev123_policy_definition_v1()
FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
REVOKE ALL ON FUNCTION ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text)
FROM PUBLIC,jenfu_platform_runtime,jenfu_orgmaster_runtime,jenfu_ai_pdm_runtime,jenfu_r1_verifier;
GRANT EXECUTE ON FUNCTION ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text)
TO jenfu_ai_pdm_runtime;
COMMIT;
