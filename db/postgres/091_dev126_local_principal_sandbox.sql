-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: additive
-- migration-note: local-only Principal v2 sandbox target pin and Central registration binding storage
-- governance-review: AIPDM/DEV-126
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE TABLE ai_pdm_core.local_sandbox_target_metadata (
  application_id text NOT NULL CHECK (application_id = 'ai-pdm'),
  sandbox_id text NOT NULL CHECK (sandbox_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  database_name text NOT NULL CHECK (length(btrim(database_name)) BETWEEN 1 AND 63),
  status text NOT NULL CHECK (status IN ('maintenance', 'ready')),
  generation uuid NOT NULL,
  fixture_version text NOT NULL CHECK (length(btrim(fixture_version)) BETWEEN 1 AND 128),
  fixture_hash text NOT NULL CHECK (fixture_hash ~ '^[a-f0-9]{64}$'),
  native_session_contract_version text NOT NULL CHECK (native_session_contract_version = 'jenfu.ai-pdm-session.v2'),
  sandbox_root text NOT NULL CHECK (length(btrim(sandbox_root)) BETWEEN 1 AND 2048),
  data_directory text NOT NULL CHECK (length(btrim(data_directory)) BETWEEN 1 AND 2048),
  repository_directory text NOT NULL CHECK (length(btrim(repository_directory)) BETWEEN 1 AND 2048),
  target_fingerprint text NOT NULL CHECK (target_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (application_id, sandbox_id),
  CHECK (data_directory <> repository_directory),
  CHECK (sandbox_root <> data_directory AND sandbox_root <> repository_directory)
);

CREATE TABLE ai_pdm_core.local_sandbox_principal_session_bindings (
  contract_version text NOT NULL CHECK (contract_version = 'jenfu.local-sandbox-principal-binding.v1'),
  status text NOT NULL CHECK (status IN ('pending_central_registration', 'central_registered', 'revoked')),
  registration_id text NOT NULL CHECK (registration_id ~ '^[a-f0-9-]{36}$'),
  portal_session_id text NOT NULL CHECK (portal_session_id ~ '^[a-f0-9-]{36}$'),
  application_id text NOT NULL CHECK (application_id = 'ai-pdm'),
  sandbox_id text NOT NULL CHECK (sandbox_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  generation uuid NOT NULL,
  fixture_version text NOT NULL CHECK (length(btrim(fixture_version)) BETWEEN 1 AND 128),
  fixture_hash text NOT NULL CHECK (fixture_hash ~ '^[a-f0-9]{64}$'),
  native_session_contract_version text NOT NULL CHECK (native_session_contract_version = 'jenfu.ai-pdm-session.v2'),
  target_fingerprint text NOT NULL CHECK (target_fingerprint ~ '^[a-f0-9]{64}$'),
  join_digest text NOT NULL CHECK (join_digest ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^ai-pdm-local-registration-v1_[a-f0-9]{64}$'),
  scenario_id text NOT NULL CHECK (length(btrim(scenario_id)) BETWEEN 1 AND 128),
  principal_id text NOT NULL CHECK (length(btrim(principal_id)) BETWEEN 1 AND 255),
  employee_id text NOT NULL CHECK (length(btrim(employee_id)) BETWEEN 1 AND 255),
  identity_issuer text NOT NULL CHECK (identity_issuer = 'urn:jenfu:local-principal-sandbox'),
  identity_subject text NOT NULL CHECK (length(btrim(identity_subject)) BETWEEN 1 AND 255),
  account_type text NOT NULL CHECK (account_type IN ('human_personal', 'human_privileged')),
  company_id text NOT NULL CHECK (company_id = 'company-jenfu'),
  native_session_id_hash text PRIMARY KEY CHECK (native_session_id_hash ~ '^[a-f0-9]{64}$'),
  auth_epoch bigint NOT NULL CHECK (auth_epoch >= 0),
  account_lifecycle_version bigint NOT NULL CHECK (account_lifecycle_version >= 1),
  profile_version bigint NOT NULL CHECK (profile_version >= 1),
  assurance_level text NOT NULL CHECK (assurance_level IN ('aal1', 'aal2')),
  assurance_policy_hash text NOT NULL CHECK (assurance_policy_hash ~ '^[a-f0-9]{64}$'),
  authenticated_at timestamptz NOT NULL,
  portal_session_expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  central_correlation_id text,
  central_registration_observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (registration_id, native_session_id_hash),
  CHECK (expires_at > issued_at),
  CHECK (
    (status = 'pending_central_registration' AND central_correlation_id IS NULL AND central_registration_observed_at IS NULL)
    OR (status IN ('central_registered', 'revoked') AND central_correlation_id IS NOT NULL AND central_registration_observed_at IS NOT NULL)
  )
);

CREATE INDEX local_sandbox_principal_bindings_status_idx
  ON ai_pdm_core.local_sandbox_principal_session_bindings(sandbox_id, generation, status, expires_at);

REVOKE ALL ON TABLE ai_pdm_core.local_sandbox_target_metadata,
  ai_pdm_core.local_sandbox_principal_session_bindings FROM PUBLIC, jenfu_ai_pdm_runtime;
GRANT SELECT ON TABLE ai_pdm_core.local_sandbox_target_metadata TO jenfu_ai_pdm_runtime;
GRANT SELECT, INSERT ON TABLE ai_pdm_core.local_sandbox_principal_session_bindings TO jenfu_ai_pdm_runtime;
GRANT UPDATE (status, central_correlation_id, central_registration_observed_at)
  ON TABLE ai_pdm_core.local_sandbox_principal_session_bindings TO jenfu_ai_pdm_runtime;

COMMIT;
