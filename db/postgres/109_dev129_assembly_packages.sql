-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none; private assembly intake and immutable review sidecars
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE TABLE ai_pdm_core.drawing_assembly_packages (
  id text PRIMARY KEY, company_id text NOT NULL, work_id text NOT NULL,
  active_work_id text REFERENCES ai_pdm_core.drawing_revision_works(id) ON DELETE SET NULL,
  revision_id text NOT NULL, active_revision_id text REFERENCES ai_pdm_core.drawing_revisions(id) ON DELETE SET NULL, initiator_principal_id text NOT NULL,
  initiator_authority_json text NOT NULL, created_by text NOT NULL REFERENCES ai_pdm_core.users(id),
  idempotency_key text NOT NULL, request_hash text NOT NULL, file_name text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 268435456),
  status text NOT NULL CHECK (status IN ('uploading','accepted','cancelled','rejected')),
  storage_session_json text, storage_object_json text, archive_sha256 text, manifest_json text,
  main_entry_key text, configurations_json text NOT NULL DEFAULT '[]', selection_version integer NOT NULL DEFAULT 1 CHECK(selection_version > 0),
  primary_binding_id text, primary_asset_id text, primary_conflict integer NOT NULL DEFAULT 0, primary_conflict_binding_id text,
  upload_lease_token text, upload_lease_expires_at timestamptz, next_offset bigint NOT NULL DEFAULT 0,
  active_at timestamptz, superseded_at timestamptz, diagnostic text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,work_id,initiator_principal_id,idempotency_key), UNIQUE(company_id,id),
  CHECK(status <> 'accepted' OR (storage_object_json IS NOT NULL AND archive_sha256 IS NOT NULL AND manifest_json IS NOT NULL))
);
CREATE UNIQUE INDEX drawing_assembly_one_active ON ai_pdm_core.drawing_assembly_packages(company_id,work_id) WHERE active_at IS NOT NULL AND superseded_at IS NULL;
CREATE UNIQUE INDEX drawing_assembly_one_upload ON ai_pdm_core.drawing_assembly_packages(company_id,work_id) WHERE status='uploading';
CREATE INDEX drawing_assembly_revision ON ai_pdm_core.drawing_assembly_packages(company_id,revision_id);

CREATE TABLE ai_pdm_core.drawing_assembly_analysis (
  id text PRIMARY KEY, company_id text NOT NULL, package_id text NOT NULL,
  selection_version integer NOT NULL CHECK(selection_version > 0), initiator_principal_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','needs_input','blocked')),
  lease_owner_id text, lease_token text, lease_version integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz, attempts integer NOT NULL DEFAULT 0,
  raw_result_json text, result_json text, result_digest text, overrides_json text NOT NULL DEFAULT '{}', draft_version integer NOT NULL DEFAULT 1,
  parser_version text, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id,package_id) REFERENCES ai_pdm_core.drawing_assembly_packages(company_id,id),
  UNIQUE(company_id,package_id,selection_version)
);
CREATE INDEX drawing_assembly_claim ON ai_pdm_core.drawing_assembly_analysis(company_id,initiator_principal_id,status,created_at);

CREATE TABLE ai_pdm_core.drawing_assembly_review_snapshots (
  id text PRIMARY KEY, company_id text NOT NULL, review_request_id text NOT NULL,
  work_id text NOT NULL, revision_id text NOT NULL,
  package_id text NOT NULL, primary_binding_id text NOT NULL, primary_asset_id text NOT NULL,
  selection_version integer NOT NULL, archive_sha256 text NOT NULL, storage_generation text NOT NULL,
  main_entry_key text NOT NULL, configurations_json text NOT NULL, reference_digest text NOT NULL,
  review_snapshot_hash text NOT NULL, snapshot_json text NOT NULL,
  effective_at timestamptz, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id,package_id) REFERENCES ai_pdm_core.drawing_assembly_packages(company_id,id),
  UNIQUE(company_id,review_request_id)
);
CREATE UNIQUE INDEX drawing_assembly_effective_revision ON ai_pdm_core.drawing_assembly_review_snapshots(company_id,revision_id) WHERE effective_at IS NOT NULL;
CREATE FUNCTION ai_pdm_core.dev129_guard_assembly_company() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,ai_pdm_core AS $$
BEGIN
  IF TG_TABLE_NAME='drawing_assembly_packages' THEN
    IF TG_OP='INSERT' AND (NEW.active_work_id IS DISTINCT FROM NEW.work_id OR NEW.active_revision_id IS DISTINCT FROM NEW.revision_id)
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_REFERENCE_MISMATCH'; END IF;
    IF NEW.active_work_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ai_pdm_core.drawing_revision_works w JOIN ai_pdm_core.users u ON u.id=NEW.created_by AND u.company_id=w.company_id WHERE w.id=NEW.work_id AND w.id=NEW.active_work_id AND w.company_id=NEW.company_id AND (NEW.active_revision_id IS NULL OR EXISTS(SELECT 1 FROM ai_pdm_core.drawing_revisions r WHERE r.id=NEW.active_revision_id AND r.id=NEW.revision_id AND r.company_id=w.company_id AND r.drawing_id=w.drawing_id)))
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_REFERENCE_MISMATCH'; END IF;
    IF TG_OP='UPDATE' AND ((NEW.active_work_id IS NOT NULL AND NEW.active_work_id IS DISTINCT FROM OLD.active_work_id) OR (NEW.active_revision_id IS NOT NULL AND NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id))
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_IDENTITY_IMMUTABLE'; END IF;
    IF TG_OP='UPDATE' AND ROW(OLD.company_id,OLD.work_id,OLD.revision_id,OLD.initiator_principal_id,OLD.initiator_authority_json,OLD.created_by,OLD.idempotency_key,OLD.request_hash,OLD.file_name,OLD.byte_size)
       IS DISTINCT FROM ROW(NEW.company_id,NEW.work_id,NEW.revision_id,NEW.initiator_principal_id,NEW.initiator_authority_json,NEW.created_by,NEW.idempotency_key,NEW.request_hash,NEW.file_name,NEW.byte_size)
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_IDENTITY_IMMUTABLE'; END IF;
    IF TG_OP='UPDATE' AND OLD.status='accepted' AND ROW(OLD.status,OLD.storage_session_json,OLD.storage_object_json,OLD.archive_sha256,OLD.manifest_json,OLD.active_at)
       IS DISTINCT FROM ROW(NEW.status,NEW.storage_session_json,NEW.storage_object_json,NEW.archive_sha256,NEW.manifest_json,NEW.active_at)
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_SOURCE_IMMUTABLE'; END IF;
  ELSE
    IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM ai_pdm_core.pdm_work_review_requests request WHERE request.id=NEW.review_request_id AND request.company_id=NEW.company_id AND request.work_id=NEW.work_id AND request.snapshot_hash=NEW.review_snapshot_hash AND request.entity_type='drawing')
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_REVIEW_MISMATCH'; END IF;
    IF NOT EXISTS(SELECT 1 FROM ai_pdm_core.drawing_assembly_packages p WHERE p.id=NEW.package_id AND p.company_id=NEW.company_id AND p.work_id=NEW.work_id AND p.revision_id=NEW.revision_id)
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_REFERENCE_MISMATCH'; END IF;
    IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'effective_at') IS DISTINCT FROM (to_jsonb(NEW)-'effective_at')
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_SNAPSHOT_IMMUTABLE'; END IF;
    IF TG_OP='UPDATE' AND OLD.effective_at IS NOT NULL AND OLD.effective_at IS DISTINCT FROM NEW.effective_at
      THEN RAISE EXCEPTION 'DEV129_ASSEMBLY_EFFECTIVE_IMMUTABLE'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dev129_package_company_guard BEFORE INSERT OR UPDATE ON ai_pdm_core.drawing_assembly_packages FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev129_guard_assembly_company();
CREATE TRIGGER dev129_snapshot_company_guard BEFORE INSERT OR UPDATE ON ai_pdm_core.drawing_assembly_review_snapshots FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev129_guard_assembly_company();
GRANT SELECT, INSERT, UPDATE ON ai_pdm_core.drawing_assembly_packages, ai_pdm_core.drawing_assembly_analysis, ai_pdm_core.drawing_assembly_review_snapshots TO jenfu_ai_pdm_runtime;
COMMIT;
