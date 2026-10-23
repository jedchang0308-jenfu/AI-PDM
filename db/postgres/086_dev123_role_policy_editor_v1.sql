-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: new versioned dynamic role-policy current and history contracts
-- compatibility: new-version
-- governance-review: AIPDM/DEV-123
-- Forward-only foundation; active policy, old grants and existing shares are unchanged.
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
  ADD COLUMN IF NOT EXISTS command_id uuid,
  ADD COLUMN IF NOT EXISTS publish_reason text;

ALTER TABLE ai_pdm_core.role_catalog_entries
  ADD COLUMN IF NOT EXISTS role_status text NOT NULL DEFAULT 'active';
ALTER TABLE ai_pdm_core.role_catalog_entries
  DROP CONSTRAINT IF EXISTS role_catalog_entries_role_status_check;
ALTER TABLE ai_pdm_core.role_catalog_entries
  ADD CONSTRAINT role_catalog_entries_role_status_check CHECK (role_status IN ('active', 'inactive'));

CREATE TABLE ai_pdm_core.role_policy_commands (
  request_id uuid PRIMARY KEY,
  actor_principal_id text NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result_json jsonb NOT NULL,
  draft_id uuid NOT NULL UNIQUE,
  catalog_version text NOT NULL,
  before_tuple jsonb NOT NULL,
  after_tuple jsonb NOT NULL,
  diff_json jsonb NOT NULL,
  reason text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ai_pdm_core.role_policy_drafts (
  draft_id uuid PRIMARY KEY,
  candidate_catalog_version text NOT NULL UNIQUE CHECK (candidate_catalog_version ~ '^ai-pdm\.role-policy\.[a-f0-9-]{36}$'),
  base_catalog_version text NOT NULL,
  base_catalog_sha256 char(64) NOT NULL CHECK (base_catalog_sha256 ~ '^[a-f0-9]{64}$'),
  registry_hash char(64) NOT NULL CHECK (registry_hash ~ '^[a-f0-9]{64}$'),
  candidate_json jsonb NOT NULL CHECK (jsonb_typeof(candidate_json) = 'object' AND NOT candidate_json ? 'contentHash'),
  role_bindings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(role_bindings) = 'array'),
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'APPLIED')),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_history_version text,
  template_id text,
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

DO $baseline$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.active_role_catalog active
    JOIN ai_pdm_core.role_catalog_publications publication ON publication.catalog_version=active.catalog_version
    WHERE active.application_id='ai-pdm' AND publication.status='active'
      AND publication.catalog_version='ai-pdm.role-catalog.2026-10-10.v7' AND publication.catalog_sha256='4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9'
  ) THEN RAISE EXCEPTION 'DEV123_ACTIVE_BASELINE_MISSING'; END IF;
END;
$baseline$;

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

ALTER TABLE ai_pdm_core.readonly_shares
  ADD COLUMN IF NOT EXISTS project_scope_key text;

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
    WHERE submission.id = NEW.submission_id AND submission.status = 'Released'
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

REVOKE ALL ON TABLE ai_pdm_core.role_policy_drafts,
  ai_pdm_core.role_policy_role_identities, ai_pdm_core.role_policy_commands,
  ai_pdm_core.role_catalog_publications, ai_pdm_core.role_catalog_entries,
  ai_pdm_core.active_role_catalog
FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT SELECT ON TABLE ai_pdm_core.role_policy_drafts,
  ai_pdm_core.role_policy_commands TO jenfu_ai_pdm_runtime;
GRANT INSERT, UPDATE ON TABLE ai_pdm_core.role_policy_drafts TO jenfu_ai_pdm_runtime;

REVOKE ALL ON TABLE ai_pdm_contract.v_application_role_catalog_v2,
  ai_pdm_contract.v_role_policy_publications_v1
FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT SELECT ON TABLE ai_pdm_contract.v_application_role_catalog_v2,
  ai_pdm_contract.v_role_policy_publications_v1
TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;

REVOKE UPDATE ON TABLE ai_pdm_core.readonly_shares FROM jenfu_ai_pdm_runtime;
GRANT UPDATE (revoked_at, revoked_by, access_count, last_accessed_at, updated_at)
  ON ai_pdm_core.readonly_shares TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.dev123_guard_draft_v1() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $draft_guard$
BEGIN
  IF TG_OP='UPDATE' AND (
    OLD.status='APPLIED'
    OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
    OR NEW.candidate_catalog_version IS DISTINCT FROM OLD.candidate_catalog_version
    OR NEW.base_catalog_version IS DISTINCT FROM OLD.base_catalog_version
    OR NEW.base_catalog_sha256 IS DISTINCT FROM OLD.base_catalog_sha256
    OR NEW.registry_hash IS DISTINCT FROM OLD.registry_hash
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.source_history_version IS DISTINCT FROM OLD.source_history_version
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
  ) THEN RAISE EXCEPTION 'DEV123_DRAFT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  IF current_user <> 'jenfu_ai_pdm_migrator' AND (
    NEW.status <> 'OPEN' OR NEW.applied_catalog_version IS NOT NULL OR NEW.applied_command_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'DEV123_DRAFT_STATUS_PROTECTED' USING ERRCODE='55000'; END IF;
  IF TG_OP='UPDATE' AND NEW.status='OPEN' AND NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'DEV123_DRAFT_REVISION_INVALID' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END;
$draft_guard$;
CREATE TRIGGER role_policy_drafts_guard BEFORE INSERT OR UPDATE ON ai_pdm_core.role_policy_drafts
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev123_guard_draft_v1();
REVOKE ALL ON FUNCTION ai_pdm_core.dev123_guard_draft_v1() FROM PUBLIC;

INSERT INTO ai_pdm_core.contract_manifest (contract_id, contract_version, signature_sha256, payload_sha256)
VALUES (
  'ai-pdm.role-policy-catalog-v2', 'ai-pdm.role-policy-catalog.v2',
  'eb6a72e51ec738cd854a0d4c25749edd7f1f434927b1fb1d916998367025aaa8',
  'c2340c96a64004538b11fd59b1a1c4f03a88779c7db722f583037b4dc6c49869'
)
ON CONFLICT (contract_id) DO UPDATE SET
  contract_version = EXCLUDED.contract_version,
  signature_sha256 = EXCLUDED.signature_sha256,
  payload_sha256 = EXCLUDED.payload_sha256,
  published_at = clock_timestamp();

COMMIT;
