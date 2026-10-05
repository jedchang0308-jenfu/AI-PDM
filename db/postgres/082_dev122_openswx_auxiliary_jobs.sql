-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: owner-private read-only auxiliary metadata
-- compatibility: additive
-- governance-review: AIPDM/DEV-122#openswx-phase2
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE UNIQUE INDEX openswx_session_company_identity ON ai_pdm_core.drawing_recognition_sessions(company_id,id);
CREATE TABLE ai_pdm_core.openswx_metadata_jobs (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  session_id text NOT NULL,
  source_set_fingerprint text NOT NULL CHECK (source_set_fingerprint ~ '^[a-f0-9]{64}$'),
  reader_commit text NOT NULL CHECK (reader_commit = '30bd63845d3532cdecfdf2654e9cc0871229c45a'),
  initiator_principal_id text NOT NULL,
  initiator_pdm_user_id text NOT NULL,
  initiator_json text NOT NULL CHECK (jsonb_typeof(initiator_json::jsonb)='object'),
  sources_json text NOT NULL CHECK (jsonb_typeof(sources_json::jsonb)='array' AND jsonb_array_length(sources_json::jsonb) BETWEEN 1 AND 8),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 2),
  locked_by text CHECK (locked_by IS NULL OR locked_by='openswx-metadata-reader'),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  dispatch_state text NOT NULL DEFAULT 'due' CHECK (dispatch_state IN ('due','requested','dispatched','dispatch_unknown','terminal')),
  dispatch_generation integer NOT NULL DEFAULT 0 CHECK (dispatch_generation >= 0),
  dispatch_lease_expires_at timestamptz,
  dispatch_requested_at timestamptz,
  dispatch_request_window_end timestamptz,
  provider_operation text,
  execution_name text,
  completion_digest text CHECK (completion_digest IS NULL OR completion_digest ~ '^[a-f0-9]{64}$'),
  completion_receipt_id text UNIQUE,
  completion_audit_json text,
  result_json text,
  result_bytes integer CHECK (result_bytes BETWEEN 1 AND 2097152),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE(company_id,session_id,source_set_fingerprint,reader_commit),
  FOREIGN KEY (company_id,session_id) REFERENCES ai_pdm_core.drawing_recognition_sessions(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id,initiator_pdm_user_id,initiator_principal_id) REFERENCES ai_pdm_core.principal_accounts(company_id,pdm_user_id,principal_id) ON DELETE RESTRICT,
  CHECK (COALESCE(initiator_json::jsonb ?& ARRAY['companyId','principalId','pdmUserId','employeeId','identityIssuer','identitySubject','profileVersion','accountLifecycleVersion','authEpoch','authenticatedAt','sessionIssuedAt'] AND initiator_json::jsonb->>'companyId'=company_id AND initiator_json::jsonb->>'principalId'=initiator_principal_id AND initiator_json::jsonb->>'pdmUserId'=initiator_pdm_user_id AND length(initiator_json::jsonb->>'employeeId')>0 AND length(initiator_json::jsonb->>'identityIssuer')>0 AND length(initiator_json::jsonb->>'identitySubject')>0 AND (initiator_json::jsonb->>'profileVersion')::bigint>0 AND (initiator_json::jsonb->>'accountLifecycleVersion')::bigint>0 AND (initiator_json::jsonb->>'authEpoch')::bigint>=0 AND (initiator_json::jsonb->>'authenticatedAt')::timestamptz IS NOT NULL AND (initiator_json::jsonb->>'sessionIssuedAt')::timestamptz IS NOT NULL,false)),
  CHECK (status <> 'running' OR (attempt_count > 0 AND locked_by IS NOT NULL AND lease_expires_at IS NOT NULL AND execution_name IS NOT NULL AND dispatch_state='dispatched')),
  CHECK (status <> 'completed' OR (completion_digest IS NOT NULL AND completion_receipt_id IS NOT NULL AND completion_audit_json IS NOT NULL AND result_json IS NOT NULL AND result_bytes IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (completion_audit_json IS NULL OR jsonb_typeof(completion_audit_json::jsonb)='object'),
  CHECK (result_json IS NULL OR COALESCE(octet_length(result_json)=result_bytes AND result_json::jsonb->>'schemaVersion'='aipdm.openswx-auxiliary.v1',false))
);
CREATE INDEX openswx_metadata_due ON ai_pdm_core.openswx_metadata_jobs(dispatch_state,status,created_at,id);
-- The durable dispatch generation fences provider operations in the subsequent dispatcher slice.
CREATE UNIQUE INDEX openswx_metadata_one_admission ON ai_pdm_core.openswx_metadata_jobs((1)) WHERE dispatch_state IN ('requested','dispatched','dispatch_unknown');
CREATE FUNCTION ai_pdm_core.require_openswx_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR source IN SELECT value FROM jsonb_array_elements(NEW.sources_json::jsonb) LOOP
      IF NOT COALESCE((source ?& ARRAY['id','fileAssetId','sha256','bytes','extension','storageGeneration']) AND
        source->>'sha256' ~ '^[a-f0-9]{64}$' AND (source->>'bytes')::bigint BETWEEN 1 AND 268435456 AND source->>'extension' IN ('sldprt','sldasm','slddrw') AND
        EXISTS (SELECT 1 FROM ai_pdm_core.drawing_recognition_sources s WHERE s.id=source->>'id' AND s.company_id=NEW.company_id AND s.session_id=NEW.session_id AND s.file_asset_id=source->>'fileAssetId' AND s.content_hash=source->>'sha256' AND s.file_size=(source->>'bytes')::bigint AND lower(trim(leading '.' from s.file_ext))=source->>'extension' AND COALESCE(s.storage_generation,'')=COALESCE(source->>'storageGeneration','')),false) THEN
        RAISE EXCEPTION 'openswx_source_binding_invalid' USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.sources_json::jsonb)) <> jsonb_array_length(NEW.sources_json::jsonb) THEN
      RAISE EXCEPTION 'openswx_source_binding_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.company_id,NEW.session_id,NEW.source_set_fingerprint,NEW.reader_commit,NEW.initiator_principal_id,NEW.initiator_pdm_user_id,NEW.initiator_json,NEW.sources_json,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.session_id,OLD.source_set_fingerprint,OLD.reader_commit,OLD.initiator_principal_id,OLD.initiator_pdm_user_id,OLD.initiator_json,OLD.sources_json,OLD.created_at) THEN
    RAISE EXCEPTION 'openswx_snapshot_immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.completion_digest IS NOT NULL AND ROW(NEW.completion_digest,NEW.completion_receipt_id,NEW.completion_audit_json,NEW.result_json,NEW.result_bytes,NEW.completed_at)
    IS DISTINCT FROM ROW(OLD.completion_digest,OLD.completion_receipt_id,OLD.completion_audit_json,OLD.result_json,OLD.result_bytes,OLD.completed_at) THEN
    RAISE EXCEPTION 'openswx_receipt_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION ai_pdm_core.require_openswx_immutable_v1() OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.require_openswx_immutable_v1() FROM PUBLIC;
CREATE TRIGGER openswx_metadata_immutable BEFORE INSERT OR UPDATE ON ai_pdm_core.openswx_metadata_jobs FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.require_openswx_immutable_v1();
ALTER TABLE ai_pdm_core.openswx_metadata_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY openswx_metadata_owned_runtime ON ai_pdm_core.openswx_metadata_jobs TO jenfu_ai_pdm_runtime USING (
  EXISTS (SELECT 1 FROM ai_pdm_core.principal_accounts a WHERE a.company_id=openswx_metadata_jobs.company_id AND a.pdm_user_id=openswx_metadata_jobs.initiator_pdm_user_id AND a.principal_id=openswx_metadata_jobs.initiator_principal_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM ai_pdm_core.principal_accounts a WHERE a.company_id=openswx_metadata_jobs.company_id AND a.pdm_user_id=openswx_metadata_jobs.initiator_pdm_user_id AND a.principal_id=openswx_metadata_jobs.initiator_principal_id)
);
REVOKE ALL ON ai_pdm_core.openswx_metadata_jobs FROM PUBLIC,jenfu_ai_pdm_runtime;
GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.openswx_metadata_jobs TO jenfu_ai_pdm_runtime;
COMMIT;
