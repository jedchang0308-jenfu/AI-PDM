-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: bind every Windows parsing device to one permanent Principal owner
-- compatibility: additive
-- migration-note: forward-only backfill from immutable migration 089 registered_by
-- governance-review: AIPDM/DEV-125
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.principal_accounts
  ADD CONSTRAINT principal_accounts_company_principal_pair_v1
  UNIQUE (company_id, principal_id);

ALTER TABLE ai_pdm_core.windows_service_devices
  ADD COLUMN owner_principal_id text;

UPDATE ai_pdm_core.windows_service_devices
SET owner_principal_id = registered_by
WHERE owner_principal_id IS NULL;

ALTER TABLE ai_pdm_core.windows_service_devices
  ALTER COLUMN owner_principal_id SET NOT NULL,
  ADD CONSTRAINT windows_service_devices_owner_principal_fk
    FOREIGN KEY (company_id, owner_principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id, principal_id)
    ON DELETE RESTRICT;

CREATE INDEX windows_service_devices_owner_status_idx
  ON ai_pdm_core.windows_service_devices(company_id, owner_principal_id, status, registered_at, id);

CREATE FUNCTION ai_pdm_core.enforce_windows_service_device_owner_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ai_pdm_core
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id THEN
    RAISE EXCEPTION 'AIPDM_WINDOWS_DEVICE_OWNER_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER windows_service_device_owner_immutable
BEFORE UPDATE OF company_id, owner_principal_id
ON ai_pdm_core.windows_service_devices
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.enforce_windows_service_device_owner_immutable_v1();

REVOKE ALL ON FUNCTION ai_pdm_core.enforce_windows_service_device_owner_immutable_v1()
  FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_r1_verifier;

COMMIT;
