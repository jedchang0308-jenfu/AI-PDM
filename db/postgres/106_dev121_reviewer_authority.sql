-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: stores the versioned AI-PDM reviewer authority projection
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE TABLE ai_pdm_core.reviewer_authority_state (
  singleton boolean PRIMARY KEY CHECK (singleton),
  initial_source_version bigint NOT NULL CHECK (initial_source_version>=0)
);
CREATE TABLE ai_pdm_core.reviewer_authority (
  principal_id text PRIMARY KEY,
  source_version bigint NOT NULL CHECK (source_version>=0),
  pending_operation_id uuid
);
CREATE TABLE ai_pdm_core.reviewer_authority_intervals (
  principal_id text NOT NULL REFERENCES ai_pdm_core.reviewer_authority ON DELETE CASCADE,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz CHECK (valid_until>valid_from),
  accounts jsonb NOT NULL CHECK (jsonb_typeof(accounts)='array'),
  grants jsonb NOT NULL CHECK (jsonb_typeof(grants)='array'),
  PRIMARY KEY (principal_id,valid_from)
);
REVOKE ALL ON ai_pdm_core.reviewer_authority_state,ai_pdm_core.reviewer_authority,
  ai_pdm_core.reviewer_authority_intervals FROM PUBLIC,jenfu_ai_pdm_runtime;
GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.reviewer_authority_state,ai_pdm_core.reviewer_authority TO jenfu_ai_pdm_runtime;
GRANT SELECT,INSERT,DELETE ON ai_pdm_core.reviewer_authority_intervals TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.block_reviewer_authority_on_prepare_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
BEGIN
  IF NEW.pending_operation_id IS NOT NULL AND OLD.pending_operation_id IS NULL THEN
    INSERT INTO ai_pdm_core.reviewer_authority(principal_id,source_version,pending_operation_id)
      VALUES(NEW.principal_id,coalesce(NEW.last_publication_version,0),NEW.pending_operation_id)
    ON CONFLICT(principal_id) DO UPDATE SET pending_operation_id=EXCLUDED.pending_operation_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.block_reviewer_authority_on_prepare_v1() FROM PUBLIC;
-- Defer until the transaction has drained the session rows it is revoking.
-- A submitter may already hold their own session while locking a reviewer.
CREATE CONSTRAINT TRIGGER block_reviewer_authority_on_prepare_v1
  AFTER UPDATE OF pending_operation_id ON ai_pdm_core.principal_session_issuance_controls
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.block_reviewer_authority_on_prepare_v1();

COMMIT;
