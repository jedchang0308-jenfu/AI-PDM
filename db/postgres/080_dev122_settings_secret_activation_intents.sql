-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: owner-private durable settings secret consent
-- compatibility: additive
-- historical jobs remain test-only
-- governance-review: AIPDM/DEV-122#one-submit-secret-workflow
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.settings_secret_probe_jobs
  ADD COLUMN completion_digest text NULL,
  ADD COLUMN completion_test_run_id text NULL
    REFERENCES ai_pdm_core.setting_test_runs(id) ON DELETE RESTRICT;

CREATE TABLE ai_pdm_core.settings_secret_activation_intents (
  id text PRIMARY KEY,
  secret_reference_id text NOT NULL REFERENCES ai_pdm_core.secret_references(id) ON DELETE RESTRICT,
  probe_job_id text NOT NULL REFERENCES ai_pdm_core.settings_secret_probe_jobs(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind = 'solidworks_document_manager'),
  company_id text NOT NULL,
  consent_principal_id text NOT NULL,
  consent_employee_id text NOT NULL,
  consent_pdm_user_id text NOT NULL,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  profile_version bigint NOT NULL CHECK (profile_version > 0),
  account_lifecycle_version bigint NOT NULL CHECK (account_lifecycle_version > 0),
  auth_epoch bigint NOT NULL CHECK (auth_epoch >= 0),
  authenticated_at timestamptz NOT NULL,
  session_issued_at timestamptz NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','activated','blocked','superseded')),
  safe_result_code text NULL,
  activated_at timestamptz NULL,
  activation_test_run_id text NULL REFERENCES ai_pdm_core.setting_test_runs(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY (company_id,consent_pdm_user_id,consent_principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id,pdm_user_id,principal_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX settings_secret_activation_pending_reference
  ON ai_pdm_core.settings_secret_activation_intents(secret_reference_id) WHERE state = 'pending';
CREATE INDEX settings_secret_activation_pending_kind
  ON ai_pdm_core.settings_secret_activation_intents(kind,requested_at) WHERE state = 'pending';

CREATE FUNCTION ai_pdm_core.require_settings_secret_activation_consent_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id,NEW.secret_reference_id,NEW.probe_job_id,NEW.kind,NEW.company_id,
      NEW.consent_principal_id,NEW.consent_employee_id,NEW.consent_pdm_user_id,
      NEW.identity_issuer,NEW.identity_subject,NEW.profile_version,NEW.account_lifecycle_version,
      NEW.auth_epoch,NEW.authenticated_at,NEW.session_issued_at,NEW.requested_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.secret_reference_id,OLD.probe_job_id,OLD.kind,OLD.company_id,
      OLD.consent_principal_id,OLD.consent_employee_id,OLD.consent_pdm_user_id,
      OLD.identity_issuer,OLD.identity_subject,OLD.profile_version,OLD.account_lifecycle_version,
      OLD.auth_epoch,OLD.authenticated_at,OLD.session_issued_at,OLD.requested_at) THEN
      RAISE EXCEPTION 'settings_secret_consent_immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM ai_pdm_core.settings_secret_probe_jobs job
      JOIN ai_pdm_core.secret_references ref ON ref.id=job.secret_reference_id
      WHERE job.id=NEW.probe_job_id AND ref.id=NEW.secret_reference_id
        AND job.kind=NEW.kind AND ref.kind=NEW.kind AND job.company_id=NEW.company_id
        AND job.purpose='settings_secret_probe' AND job.initiator_principal_id IS NOT NULL
        AND job.initiator_profile_version > 0
        AND ref.metadata_json::jsonb->>'companyId'=NEW.company_id) THEN
      RAISE EXCEPTION 'settings_secret_consent_binding_invalid' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION ai_pdm_core.require_settings_secret_activation_consent_v1() OWNER TO jenfu_ai_pdm_migrator;
CREATE TRIGGER settings_secret_activation_consent_immutable
  BEFORE INSERT OR UPDATE ON ai_pdm_core.settings_secret_activation_intents
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.require_settings_secret_activation_consent_v1();
REVOKE ALL ON ai_pdm_core.settings_secret_activation_intents FROM PUBLIC,jenfu_ai_pdm_runtime;
GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.settings_secret_activation_intents TO jenfu_ai_pdm_runtime;
COMMIT;
