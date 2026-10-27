-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: internal Windows service device identity and completion readback
-- compatibility: additive
-- governance-review: AIPDM/DEV-125
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE TABLE ai_pdm_core.windows_service_devices (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  company_id text NOT NULL REFERENCES ai_pdm_core.companies(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND name=btrim(name)),
  credential_hash char(64) NOT NULL UNIQUE CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  instance_id text CHECK (instance_id IS NULL OR instance_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  service_version text NOT NULL CHECK (char_length(service_version) BETWEEN 1 AND 40 AND service_version=btrim(service_version)),
  protocol_version integer NOT NULL CHECK (protocol_version=1),
  registered_by text NOT NULL REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by text REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='active' AND revoked_at IS NULL AND revoked_by IS NULL)
      OR (status='revoked' AND instance_id IS NULL AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);

CREATE TABLE ai_pdm_core.windows_service_enrollments (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  company_id text NOT NULL REFERENCES ai_pdm_core.companies(id) ON DELETE RESTRICT,
  request_id text NOT NULL CHECK (request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  code_hash char(64) NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  creator_session_hash char(64) NOT NULL CHECK (creator_session_hash ~ '^[a-f0-9]{64}$'),
  creator_auth_epoch bigint NOT NULL CHECK (creator_auth_epoch BETWEEN 0 AND 9007199254740991),
  creator_identity_issuer text NOT NULL CHECK (char_length(creator_identity_issuer) BETWEEN 1 AND 255),
  creator_identity_subject text NOT NULL CHECK (char_length(creator_identity_subject) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  device_id text UNIQUE REFERENCES ai_pdm_core.windows_service_devices(id) ON DELETE RESTRICT,
  UNIQUE (company_id,request_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CHECK ((consumed_at IS NULL AND device_id IS NULL) OR (consumed_at IS NOT NULL AND device_id IS NOT NULL))
);

CREATE INDEX windows_service_devices_company_status_idx
  ON ai_pdm_core.windows_service_devices(company_id,status,registered_at,id);
CREATE INDEX windows_service_enrollments_expiry_idx
  ON ai_pdm_core.windows_service_enrollments(company_id,expires_at,id) WHERE consumed_at IS NULL;

ALTER TABLE ai_pdm_core.preview_jobs ADD COLUMN IF NOT EXISTS worker_completion_json jsonb
  CHECK (worker_completion_json IS NULL OR jsonb_typeof(worker_completion_json)='object');
ALTER TABLE ai_pdm_core.drawing_recognition_sessions ADD COLUMN IF NOT EXISTS worker_completion_json jsonb
  CHECK (worker_completion_json IS NULL OR jsonb_typeof(worker_completion_json)='object');
ALTER TABLE ai_pdm_core.settings_secret_probe_jobs ADD COLUMN IF NOT EXISTS worker_completion_json jsonb
  CHECK (worker_completion_json IS NULL OR jsonb_typeof(worker_completion_json)='object');

REVOKE ALL ON TABLE ai_pdm_core.windows_service_devices,
  ai_pdm_core.windows_service_enrollments FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_r1_verifier;
GRANT SELECT, INSERT, UPDATE ON TABLE ai_pdm_core.windows_service_devices,
  ai_pdm_core.windows_service_enrollments TO jenfu_ai_pdm_runtime;

COMMIT;
