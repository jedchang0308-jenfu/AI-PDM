-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: new-version
-- governance-review: AIPDM/DEV-121#principal-only-background-work
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Keep historical jobs unchanged. Missing provenance is held by the new
-- consumer, never reconstructed from the draft creator or a legacy UID.
-- Existing reads and non-actor updates remain compatible. New inserts require
-- the Principal-aware writer; an older writer fails closed during deployment.
ALTER TABLE ai_pdm_core.settings_secret_probe_jobs
  ADD COLUMN company_id text NULL,
  ADD COLUMN initiator_principal_id text NULL,
  ADD COLUMN initiator_profile_version bigint NULL,
  ADD COLUMN purpose text NULL,
  ADD CONSTRAINT settings_probe_initiator_account_v1
    FOREIGN KEY (company_id, created_by, initiator_principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id, pdm_user_id, principal_id)
    ON DELETE RESTRICT NOT VALID;

-- A held historical job must not permanently reserve the active queue slot.
-- Preserve the row; only new, typed jobs participate in the uniqueness fence.
DROP INDEX ai_pdm_core.idx_settings_secret_probe_jobs_active;
CREATE UNIQUE INDEX idx_settings_secret_probe_jobs_active
  ON ai_pdm_core.settings_secret_probe_jobs(secret_reference_id)
  WHERE status IN ('pending', 'running')
    AND company_id IS NOT NULL AND initiator_principal_id IS NOT NULL
    AND initiator_profile_version > 0 AND purpose = 'settings_secret_probe';

CREATE FUNCTION ai_pdm_core.require_settings_probe_initiator_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.company_id, NEW.created_by, NEW.initiator_principal_id,
           NEW.initiator_profile_version, NEW.purpose, NEW.secret_reference_id, NEW.kind)
       IS DISTINCT FROM
       ROW(OLD.company_id, OLD.created_by, OLD.initiator_principal_id,
           OLD.initiator_profile_version, OLD.purpose, OLD.secret_reference_id, OLD.kind) THEN
      RAISE EXCEPTION 'settings_probe_initiator_immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL OR char_length(NEW.company_id) NOT BETWEEN 1 AND 255 OR
     NEW.initiator_principal_id IS NULL OR char_length(NEW.initiator_principal_id) NOT BETWEEN 1 AND 255 OR
     NEW.initiator_principal_id ~ '[[:cntrl:]]' OR
     NEW.initiator_profile_version IS NULL OR NEW.initiator_profile_version < 1 OR
     NEW.purpose IS DISTINCT FROM 'settings_secret_probe' THEN
    RAISE EXCEPTION 'settings_probe_principal_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION ai_pdm_core.require_settings_probe_initiator_v1() OWNER TO jenfu_ai_pdm_migrator;
CREATE TRIGGER trg_settings_probe_initiator_v1
BEFORE INSERT OR UPDATE ON ai_pdm_core.settings_secret_probe_jobs
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.require_settings_probe_initiator_v1();
COMMIT;
