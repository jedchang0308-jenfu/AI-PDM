-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: new versioned dynamic role-policy current and history contracts
-- compatibility: new-version
-- governance-review: AIPDM/DEV-123
-- Forward-only. The policy starts DISABLED and does not change the active v7 catalog.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev123-role-policy-editor-v1'), hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.role_catalog_publications
  ADD COLUMN IF NOT EXISTS publication_format text,
  ADD COLUMN IF NOT EXISTS canonicalization_version text,
  ADD COLUMN IF NOT EXISTS role_schema_id text,
  ADD COLUMN IF NOT EXISTS role_profile_schema_id text,
  ADD COLUMN IF NOT EXISTS baseline_role_identity_hash char(64),
  ADD COLUMN IF NOT EXISTS role_identity_hash char(64),
  ADD COLUMN IF NOT EXISTS role_profile_hash char(64),
  ADD COLUMN IF NOT EXISTS protected_policy_hash char(64),
  ADD COLUMN IF NOT EXISTS registry_hash char(64),
  ADD COLUMN IF NOT EXISTS role_profiles jsonb,
  ADD COLUMN IF NOT EXISTS policy_draft_id uuid,
  ADD COLUMN IF NOT EXISTS base_catalog_version text,
  ADD COLUMN IF NOT EXISTS base_catalog_sha256 char(64),
  ADD COLUMN IF NOT EXISTS base_activation_generation bigint,
  ADD COLUMN IF NOT EXISTS activation_generation bigint,
  ADD COLUMN IF NOT EXISTS confirmation_hash char(64),
  ADD COLUMN IF NOT EXISTS command_id uuid,
  ADD COLUMN IF NOT EXISTS publish_reason text;

ALTER TABLE ai_pdm_core.role_catalog_entries
  ADD COLUMN IF NOT EXISTS role_status text NOT NULL DEFAULT 'active';
ALTER TABLE ai_pdm_core.role_catalog_entries
  DROP CONSTRAINT IF EXISTS role_catalog_entries_role_status_check;
ALTER TABLE ai_pdm_core.role_catalog_entries
  ADD CONSTRAINT role_catalog_entries_role_status_check CHECK (role_status IN ('active', 'inactive'));

CREATE TABLE ai_pdm_core.role_policy_state (
  application_id text PRIMARY KEY CHECK (application_id = 'ai-pdm'),
  mode text NOT NULL CHECK (mode IN ('DISABLED', 'ENABLED', 'PAUSED')),
  activation_generation bigint NOT NULL CHECK (activation_generation >= 0),
  baseline_catalog_version text NOT NULL,
  baseline_catalog_sha256 char(64) NOT NULL CHECK (baseline_catalog_sha256 ~ '^[a-f0-9]{64}$'),
  baseline_role_identity_hash char(64) NOT NULL CHECK (baseline_role_identity_hash ~ '^[a-f0-9]{64}$'),
  protected_policy_hash char(64) NOT NULL CHECK (protected_policy_hash ~ '^[a-f0-9]{64}$'),
  role_schema_id text NOT NULL CHECK (role_schema_id = 'ai-pdm.role-schema.flexible.v2'),
  role_profile_schema_id text NOT NULL CHECK (role_profile_schema_id = 'ai-pdm.role-profile-schema.v1'),
  registry_hash char(64) NOT NULL CHECK (registry_hash ~ '^[a-f0-9]{64}$'),
  registry_payload jsonb NOT NULL CHECK (jsonb_typeof(registry_payload) = 'object'),
  enablement_ref text,
  enablement_binding jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((mode = 'DISABLED') OR (enablement_ref IS NOT NULL AND enablement_binding IS NOT NULL))
);

CREATE TABLE ai_pdm_core.role_policy_commands (
  request_id uuid PRIMARY KEY,
  actor_principal_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create-draft', 'save-draft', 'apply')),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('SUCCEEDED', 'REJECTED')),
  original_http_status integer NOT NULL CHECK (original_http_status BETWEEN 200 AND 599),
  result_json jsonb,
  error_code text,
  draft_id uuid,
  catalog_version text,
  before_tuple jsonb,
  after_tuple jsonb,
  diff_json jsonb,
  reason text,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((outcome = 'SUCCEEDED' AND result_json IS NOT NULL AND error_code IS NULL)
      OR (outcome = 'REJECTED' AND error_code IS NOT NULL))
);

CREATE TABLE ai_pdm_core.role_policy_drafts (
  draft_id uuid PRIMARY KEY,
  candidate_catalog_version text NOT NULL UNIQUE CHECK (candidate_catalog_version ~ '^ai-pdm\.role-policy\.[a-f0-9-]{36}$'),
  base_catalog_version text NOT NULL,
  base_catalog_sha256 char(64) NOT NULL CHECK (base_catalog_sha256 ~ '^[a-f0-9]{64}$'),
  base_activation_generation bigint NOT NULL CHECK (base_activation_generation >= 0),
  registry_hash char(64) NOT NULL CHECK (registry_hash ~ '^[a-f0-9]{64}$'),
  candidate_json jsonb NOT NULL CHECK (jsonb_typeof(candidate_json) = 'object'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'APPLIED')),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_history_version text,
  template_id text,
  last_save_command_id uuid,
  applied_catalog_version text,
  applied_command_id uuid,
  CHECK ((status = 'OPEN' AND applied_catalog_version IS NULL AND applied_command_id IS NULL)
      OR (status = 'APPLIED' AND applied_catalog_version IS NOT NULL AND applied_command_id IS NOT NULL))
);

ALTER TABLE ai_pdm_core.role_policy_commands
  ADD CONSTRAINT role_policy_commands_draft_fk FOREIGN KEY (draft_id)
  REFERENCES ai_pdm_core.role_policy_drafts(draft_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE ai_pdm_core.role_policy_role_identities (
  stable_role_id text PRIMARY KEY,
  role_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  display_name_nfc text GENERATED ALWAYS AS (normalize(display_name, NFC)) STORED,
  origin text NOT NULL CHECK (origin IN ('builtin', 'custom')),
  identity_json jsonb NOT NULL CHECK (jsonb_typeof(identity_json) = 'object'),
  identity_hash char(64) NOT NULL CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  first_catalog_version text NOT NULL REFERENCES ai_pdm_core.role_catalog_publications(catalog_version),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (display_name_nfc)
);

CREATE UNIQUE INDEX role_catalog_publications_policy_draft_uq
  ON ai_pdm_core.role_catalog_publications(policy_draft_id) WHERE policy_draft_id IS NOT NULL;
CREATE UNIQUE INDEX role_catalog_publications_command_uq
  ON ai_pdm_core.role_catalog_publications(command_id) WHERE command_id IS NOT NULL;
CREATE INDEX role_policy_commands_draft_completed_idx
  ON ai_pdm_core.role_policy_commands(draft_id, completed_at DESC, request_id);
CREATE INDEX role_policy_commands_catalog_completed_idx
  ON ai_pdm_core.role_policy_commands(catalog_version, completed_at DESC, request_id);
CREATE INDEX role_policy_drafts_status_updated_idx
  ON ai_pdm_core.role_policy_drafts(status, updated_at DESC, draft_id);

INSERT INTO ai_pdm_core.role_policy_state (
  application_id, mode, activation_generation, baseline_catalog_version, baseline_catalog_sha256,
  baseline_role_identity_hash, protected_policy_hash, role_schema_id, role_profile_schema_id,
  registry_hash, registry_payload
)
SELECT 'ai-pdm', 'DISABLED', 0, publication.catalog_version, publication.catalog_sha256,
  '265483921bbdadfdf8933f1d0cdcbebc1b4df42983c84784a7176fdd5f05d55c',
  '604184ece311dabaf4cc7c0fec8ac802425f79363933d2d66ea67c82369803a6',
  'ai-pdm.role-schema.flexible.v2', 'ai-pdm.role-profile-schema.v1',
  'fb824e6ddedc5d0590bef6f1bed730bd579d27e11af89b5a8760a5d6a426239c',
  jsonb_build_object(
    'contractVersion', 'ai-pdm.role-policy-editor-registry.v2',
    'registryHash', 'fb824e6ddedc5d0590bef6f1bed730bd579d27e11af89b5a8760a5d6a426239c',
    'businessActionCount', 20, 'legacyBindingCount', 66, 'protectedBindingCount', 9
  )
FROM ai_pdm_core.active_role_catalog active
JOIN ai_pdm_core.role_catalog_publications publication
  ON publication.application_id = active.application_id
 AND publication.catalog_version = active.catalog_version
WHERE active.application_id = 'ai-pdm' AND publication.status = 'active'
  AND publication.catalog_version = 'ai-pdm.role-catalog.2026-10-10.v7'
  AND publication.catalog_sha256 = '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9';

DO $dev123_state_exactly_one$
BEGIN
  IF (SELECT count(*) FROM ai_pdm_core.role_policy_state WHERE application_id = 'ai-pdm') <> 1 THEN
    RAISE EXCEPTION 'DEV123_ACTIVE_BASELINE_MISSING';
  END IF;
END;
$dev123_state_exactly_one$;

INSERT INTO ai_pdm_core.role_policy_role_identities (
  stable_role_id, role_code, display_name, origin, identity_json, identity_hash, first_catalog_version
)
SELECT entry.stable_role_id, entry.role_code, entry.display_name, 'builtin',
  jsonb_build_object(
    'stableRoleId', entry.stable_role_id, 'roleCode', entry.role_code, 'displayName', entry.display_name,
    'assignable', entry.assignable, 'risk', entry.risk, 'subjectKind', entry.subject_kind,
    'recommendationAllowed', entry.recommendation_allowed, 'delegationAllowed', entry.delegation_allowed,
    'allowedScopeKinds', entry.allowed_scope_kinds, 'assignmentTier', entry.assignment_tier,
    'metadata', coalesce(entry.metadata, 'null'::jsonb)
  ), CASE entry.stable_role_id
    WHEN 'role-rd' THEN '8e0c0f4d3b9ec1766f3605adeb715725701d30a7e2671ac16509040686d2d4d9'
    WHEN 'role-rd-manager' THEN '3c65b920c00f68d6a87a91682c48d88395c131e8c3e077a76896397fb0c6dea2'
    WHEN 'role-qa' THEN '53fcf20b141077c7662c5f39b9898a4e4f776cf45e1c088ee09ba40c8ff165ed'
    WHEN 'role-manufacturing' THEN '052f9efa3b021d7e76a65db82b5b8b8bfea883496ae7cd408800433b60eda807'
    WHEN 'role-production-planning' THEN 'd976633f5e2cf27f1c9211254af43b6a44ae3b6bc999d6c758c05bc3dbe256b0'
    WHEN 'role-procurement' THEN 'ce15bbad23a380fd012d1c8b2979674f5542a1c23e2ab75751d6b82b452ef01d'
    WHEN 'role-external-specialist' THEN '34480faf9c3f3a511bce8ff0e3192534e4f854aa4f0ea18f4bb5c9e9fc918f4b'
    WHEN 'role-pdm-admin' THEN '4d713823aadf525374ab361c9b9082f58768e6d4f29cff6329c13028aecc5063'
    WHEN 'role-system-admin' THEN '9b53d29ad637b913b3c34e2ce646203b87a9d02b45a1f566277efd79f5d385c2'
    ELSE NULL
  END, entry.catalog_version
FROM ai_pdm_core.active_role_catalog active
JOIN ai_pdm_core.role_catalog_entries entry ON entry.catalog_version = active.catalog_version
WHERE active.application_id = 'ai-pdm';

CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v2
WITH (security_barrier = true) AS
SELECT
  publication.contract_version,
  publication.application_id,
  publication.catalog_version,
  publication.published_at,
  publication.catalog_sha256,
  entry.display_order,
  entry.stable_role_id,
  entry.role_code,
  entry.display_name,
  entry.assignable,
  entry.risk,
  entry.subject_kind,
  entry.recommendation_allowed,
  entry.delegation_allowed,
  entry.allowed_scope_kinds,
  entry.assignment_tier,
  entry.permissions,
  entry.metadata,
  entry.role_definition_hash,
  coalesce(publication.publication_format, 'legacy-static-v1') AS publication_format,
  publication.canonicalization_version,
  publication.role_schema_id,
  publication.activation_generation,
  publication.baseline_role_identity_hash,
  publication.role_identity_hash,
  publication.protected_policy_hash,
  publication.registry_hash,
  publication.role_profile_schema_id,
  publication.role_profile_hash,
  entry.role_status,
  coalesce(profile.value->>'permissionRoleId', entry.stable_role_id) AS permission_role_id,
  coalesce(profile.value->>'presentationName', entry.display_name) AS presentation_name,
  coalesce((profile.value->>'presentationOrder')::integer, entry.display_order) AS presentation_order,
  coalesce(profile.value->>'assignmentDisposition',
    CASE WHEN entry.stable_role_id = 'role-system-admin' THEN 'hidden-protected' ELSE 'selectable' END) AS assignment_disposition,
  publication.status AS lifecycle
FROM ai_pdm_core.active_role_catalog active
JOIN ai_pdm_core.role_catalog_publications publication
  ON publication.application_id = active.application_id
 AND publication.catalog_version = active.catalog_version
 AND publication.status = 'active'
JOIN ai_pdm_core.role_catalog_entries entry ON entry.catalog_version = publication.catalog_version
LEFT JOIN LATERAL (
  SELECT value
  FROM jsonb_array_elements(coalesce(publication.role_profiles, '[]'::jsonb)) AS profile_row(value)
  WHERE value->>'stableRoleId' = entry.stable_role_id
  LIMIT 1
) profile ON true
WHERE publication.application_id = 'ai-pdm';

CREATE OR REPLACE VIEW ai_pdm_contract.v_role_policy_publications_v1
WITH (security_barrier = true) AS
SELECT
  publication.contract_version,
  publication.application_id,
  publication.catalog_version,
  publication.published_at,
  publication.catalog_sha256,
  entry.display_order,
  entry.stable_role_id,
  entry.role_code,
  entry.display_name,
  entry.assignable,
  entry.risk,
  entry.subject_kind,
  entry.recommendation_allowed,
  entry.delegation_allowed,
  entry.allowed_scope_kinds,
  entry.assignment_tier,
  entry.permissions,
  entry.metadata,
  entry.role_definition_hash,
  coalesce(publication.publication_format, 'legacy-static-v1') AS publication_format,
  publication.canonicalization_version,
  publication.role_schema_id,
  publication.activation_generation,
  publication.baseline_role_identity_hash,
  publication.role_identity_hash,
  publication.protected_policy_hash,
  publication.registry_hash,
  publication.role_profile_schema_id,
  publication.role_profile_hash,
  entry.role_status,
  coalesce(profile.value->>'permissionRoleId', entry.stable_role_id) AS permission_role_id,
  coalesce(profile.value->>'presentationName', entry.display_name) AS presentation_name,
  coalesce((profile.value->>'presentationOrder')::integer, entry.display_order) AS presentation_order,
  coalesce(profile.value->>'assignmentDisposition',
    CASE WHEN entry.stable_role_id = 'role-system-admin' THEN 'hidden-protected' ELSE 'selectable' END) AS assignment_disposition,
  publication.status AS lifecycle
FROM ai_pdm_core.role_catalog_publications publication
JOIN ai_pdm_core.role_catalog_entries entry ON entry.catalog_version = publication.catalog_version
LEFT JOIN LATERAL (
  SELECT value
  FROM jsonb_array_elements(coalesce(publication.role_profiles, '[]'::jsonb)) AS profile_row(value)
  WHERE value->>'stableRoleId' = entry.stable_role_id
  LIMIT 1
) profile ON true
WHERE publication.application_id = 'ai-pdm' AND publication.status IN ('active', 'retired');

CREATE OR REPLACE FUNCTION ai_pdm_core.role_policy_apply_v1(
  p_request_id uuid,
  p_actor_principal_id text,
  p_request_hash char(64),
  p_draft_id uuid,
  p_expected_revision integer,
  p_expected_content_hash char(64),
  p_expected_catalog_version text,
  p_expected_catalog_sha256 char(64),
  p_expected_activation_generation bigint,
  p_expected_compatibility_revision bigint,
  p_confirmation_hash char(64),
  p_reason text,
  p_diff jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ai_pdm_core, orgmaster_contract, pg_catalog
AS $function$
DECLARE
  existing ai_pdm_core.role_policy_commands%ROWTYPE;
  policy ai_pdm_core.role_policy_state%ROWTYPE;
  draft ai_pdm_core.role_policy_drafts%ROWTYPE;
  active_version text;
  active_hash text;
  compatibility record;
  next_generation bigint;
  role_value jsonb;
  role_order bigint;
  result jsonb;
BEGIN
  SELECT * INTO existing FROM ai_pdm_core.role_policy_commands WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.actor_principal_id <> p_actor_principal_id OR existing.operation <> 'apply'
       OR existing.request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'DEV123_REQUEST_ID_REUSE' USING ERRCODE = '23505';
    END IF;
    RETURN existing.result_json;
  END IF;

  SELECT * INTO policy FROM ai_pdm_core.role_policy_state WHERE application_id = 'ai-pdm' FOR UPDATE;
  IF NOT FOUND OR policy.mode <> 'ENABLED' THEN
    RAISE EXCEPTION 'DEV123_POLICY_NOT_ENABLED' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO compatibility
  FROM orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2
  WHERE application_id = 'ai-pdm' AND consumer_id = 'orgmaster';
  IF NOT FOUND OR compatibility.readiness <> 'READY'
     OR compatibility.compatibility_revision <> p_expected_compatibility_revision
     OR compatibility.supported_publication_format <> 'dynamic-policy-v1'
     OR compatibility.supported_canonicalization_version <> 'jenfu.canonical-json.v1'
     OR compatibility.supported_role_schema_id <> policy.role_schema_id
     OR compatibility.supported_role_profile_schema_id <> policy.role_profile_schema_id
     OR compatibility.accepted_registry_hash <> policy.registry_hash
     OR compatibility.accepted_baseline_role_identity_hash <> policy.baseline_role_identity_hash
     OR compatibility.accepted_protected_policy_hash <> policy.protected_policy_hash THEN
    RAISE EXCEPTION 'DEV123_CONSUMER_NOT_READY' USING ERRCODE = '55000';
  END IF;

  SELECT publication.catalog_version, publication.catalog_sha256
    INTO active_version, active_hash
  FROM ai_pdm_core.active_role_catalog active
  JOIN ai_pdm_core.role_catalog_publications publication ON publication.catalog_version = active.catalog_version
  WHERE active.application_id = 'ai-pdm' FOR UPDATE OF active, publication;
  IF active_version IS DISTINCT FROM p_expected_catalog_version
     OR active_hash IS DISTINCT FROM p_expected_catalog_sha256
     OR policy.activation_generation <> p_expected_activation_generation THEN
    RAISE EXCEPTION 'DEV123_ACTIVE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO draft FROM ai_pdm_core.role_policy_drafts WHERE draft_id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR draft.status <> 'OPEN' OR draft.revision <> p_expected_revision
     OR draft.content_hash <> p_expected_content_hash OR draft.registry_hash <> policy.registry_hash
     OR draft.base_catalog_version <> active_version OR draft.base_catalog_sha256 <> active_hash
     OR draft.base_activation_generation <> policy.activation_generation
     OR draft.candidate_json->>'contentHash' <> draft.content_hash
     OR draft.candidate_json->>'candidateCatalogVersion' <> draft.candidate_catalog_version
     OR draft.candidate_json->>'registryHash' <> policy.registry_hash
     OR draft.candidate_json->>'baselineRoleIdentityHash' <> policy.baseline_role_identity_hash
     OR draft.candidate_json->>'protectedPolicyHash' <> policy.protected_policy_hash THEN
    RAISE EXCEPTION 'DEV123_DRAFT_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF p_confirmation_hash !~ '^[a-f0-9]{64}$' OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 240
     OR jsonb_typeof(p_diff) <> 'object' THEN
    RAISE EXCEPTION 'DEV123_APPLY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  next_generation := policy.activation_generation + 1;
  UPDATE ai_pdm_core.role_catalog_publications SET status = 'retired', retired_at = clock_timestamp()
   WHERE application_id = 'ai-pdm' AND catalog_version = active_version AND status = 'active';

  INSERT INTO ai_pdm_core.role_catalog_publications (
    catalog_version, contract_version, application_id, published_at, catalog_sha256, status, published_by,
    publication_format, canonicalization_version, role_schema_id, role_profile_schema_id,
    baseline_role_identity_hash, role_identity_hash, role_profile_hash, protected_policy_hash,
    registry_hash, role_profiles, policy_draft_id, base_catalog_version, base_catalog_sha256,
    base_activation_generation, activation_generation, confirmation_hash, command_id, publish_reason
  ) VALUES (
    draft.candidate_catalog_version, 'jenfu.platform-entitlement.v1', 'ai-pdm', clock_timestamp(),
    draft.content_hash, 'active', p_actor_principal_id, 'dynamic-policy-v1', 'jenfu.canonical-json.v1',
    policy.role_schema_id, policy.role_profile_schema_id, policy.baseline_role_identity_hash,
    draft.candidate_json->>'roleIdentityHash', draft.candidate_json->>'roleProfileHash',
    policy.protected_policy_hash, policy.registry_hash, draft.candidate_json->'roleProfiles',
    draft.draft_id, active_version, active_hash, policy.activation_generation, next_generation,
    p_confirmation_hash, p_request_id, btrim(p_reason)
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

  UPDATE ai_pdm_core.role_policy_state
     SET activation_generation = next_generation, updated_at = clock_timestamp()
   WHERE application_id = 'ai-pdm';
  UPDATE ai_pdm_core.role_policy_drafts
     SET status = 'APPLIED', updated_by = p_actor_principal_id, updated_at = clock_timestamp(),
         applied_catalog_version = candidate_catalog_version, applied_command_id = p_request_id
   WHERE draft_id = draft.draft_id;

  result := jsonb_build_object(
    'status', 'ACTIVE', 'catalogVersion', draft.candidate_catalog_version,
    'catalogSha256', draft.content_hash, 'activationGeneration', next_generation::text,
    'previousActive', jsonb_build_object('catalogVersion', active_version, 'catalogSha256', active_hash,
      'activationGeneration', policy.activation_generation::text),
    'applyCommandId', p_request_id::text
  );
  INSERT INTO ai_pdm_core.role_policy_commands (
    request_id, actor_principal_id, operation, request_hash, outcome, original_http_status,
    result_json, draft_id, catalog_version, before_tuple, after_tuple, diff_json, reason
  ) VALUES (
    p_request_id, p_actor_principal_id, 'apply', p_request_hash, 'SUCCEEDED', 200, result,
    draft.draft_id, draft.candidate_catalog_version,
    jsonb_build_object('catalogVersion', active_version, 'catalogSha256', active_hash,
      'activationGeneration', policy.activation_generation::text),
    jsonb_build_object('catalogVersion', draft.candidate_catalog_version, 'catalogSha256', draft.content_hash,
      'activationGeneration', next_generation::text),
    p_diff, btrim(p_reason)
  );
  RETURN result;
END;
$function$;

ALTER TABLE ai_pdm_core.readonly_shares
  ADD COLUMN IF NOT EXISTS project_scope_key text;

UPDATE ai_pdm_core.readonly_shares share
SET project_scope_key = NULLIF(btrim(submission.project_code), '')
FROM ai_pdm_core.submissions submission
WHERE submission.id = share.submission_id
  AND share.project_scope_key IS NULL
  AND NULLIF(btrim(submission.project_code), '') IS NOT NULL;

ALTER TABLE ai_pdm_core.readonly_shares
  ADD CONSTRAINT readonly_shares_project_scope_key_nonblank
  CHECK (project_scope_key IS NULL OR char_length(btrim(project_scope_key)) > 0);

CREATE OR REPLACE FUNCTION ai_pdm_core.dev123_bind_project_scope_key()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ai_pdm_core, pg_catalog AS $function$
BEGIN
  NEW.project_scope_key := (
    SELECT NULLIF(btrim(submission.project_code), '')
    FROM ai_pdm_core.submissions submission
    WHERE submission.id = NEW.submission_id
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER readonly_shares_bind_project_scope_key
BEFORE INSERT ON ai_pdm_core.readonly_shares
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev123_bind_project_scope_key();

CREATE OR REPLACE FUNCTION ai_pdm_core.dev123_immutable_project_scope_key()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ai_pdm_core, pg_catalog AS $function$
BEGIN
  IF NEW.project_scope_key IS DISTINCT FROM OLD.project_scope_key THEN
    RAISE EXCEPTION 'DEV123_PROJECT_SCOPE_KEY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_dev123_readonly_share_project_scope_immutable
BEFORE UPDATE OF project_scope_key ON ai_pdm_core.readonly_shares
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev123_immutable_project_scope_key();

REVOKE ALL ON FUNCTION ai_pdm_core.dev123_bind_project_scope_key(),
  ai_pdm_core.dev123_immutable_project_scope_key()
FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;

REVOKE ALL ON TABLE ai_pdm_core.role_policy_state, ai_pdm_core.role_policy_drafts,
  ai_pdm_core.role_policy_role_identities, ai_pdm_core.role_policy_commands,
  ai_pdm_core.role_catalog_publications, ai_pdm_core.role_catalog_entries,
  ai_pdm_core.active_role_catalog
FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT SELECT ON TABLE ai_pdm_core.role_policy_state, ai_pdm_core.role_policy_drafts,
  ai_pdm_core.role_policy_commands TO jenfu_ai_pdm_runtime;
GRANT INSERT, UPDATE ON TABLE ai_pdm_core.role_policy_drafts TO jenfu_ai_pdm_runtime;
GRANT INSERT ON TABLE ai_pdm_core.role_policy_commands TO jenfu_ai_pdm_runtime;
REVOKE ALL ON FUNCTION ai_pdm_core.role_policy_apply_v1(uuid,text,char,uuid,integer,char,text,char,bigint,bigint,char,text,jsonb)
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT EXECUTE ON FUNCTION ai_pdm_core.role_policy_apply_v1(uuid,text,char,uuid,integer,char,text,char,bigint,bigint,char,text,jsonb)
  TO jenfu_ai_pdm_runtime;

REVOKE ALL ON TABLE ai_pdm_contract.v_application_role_catalog_v2,
  ai_pdm_contract.v_role_policy_publications_v1
FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT SELECT ON TABLE ai_pdm_contract.v_application_role_catalog_v2,
  ai_pdm_contract.v_role_policy_publications_v1
TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

REVOKE UPDATE ON TABLE ai_pdm_core.readonly_shares FROM jenfu_ai_pdm_runtime;
GRANT UPDATE (revoked_at, revoked_by, access_count, last_accessed_at, updated_at)
  ON ai_pdm_core.readonly_shares TO jenfu_ai_pdm_runtime;

INSERT INTO ai_pdm_core.contract_manifest (contract_id, contract_version, signature_sha256, payload_sha256)
VALUES (
  'ai-pdm.role-policy-catalog-v2', 'ai-pdm.role-policy-catalog.v2',
  'd58fb8139a378b35d7ed9623a274c6ba3846bccf24556a2c2e154079c8ca0254',
  'fb824e6ddedc5d0590bef6f1bed730bd579d27e11af89b5a8760a5d6a426239c'
)
ON CONFLICT (contract_id) DO UPDATE SET
  contract_version = EXCLUDED.contract_version,
  signature_sha256 = EXCLUDED.signature_sha256,
  payload_sha256 = EXCLUDED.payload_sha256,
  published_at = clock_timestamp();

COMMIT;
