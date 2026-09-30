-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-121#principal-only-background-work

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Existing recognition sessions remain readable and processable. Every new
-- human-initiated session must retain the verified security subject as well as
-- its historical PDM profile foreign key.
ALTER TABLE ai_pdm_core.drawing_recognition_sessions
  ADD COLUMN initiator_principal_id text NULL;

ALTER TABLE ai_pdm_core.drawing_recognition_sessions
  ADD CONSTRAINT drawing_recognition_initiator_account_v1
  FOREIGN KEY (company_id, created_by, initiator_principal_id)
  REFERENCES ai_pdm_core.principal_accounts(company_id, pdm_user_id, principal_id)
  ON DELETE RESTRICT NOT VALID;

CREATE FUNCTION ai_pdm_core.require_drawing_recognition_initiator_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.company_id, NEW.created_by, NEW.initiator_principal_id)
       IS DISTINCT FROM
       ROW(OLD.company_id, OLD.created_by, OLD.initiator_principal_id) THEN
      RAISE EXCEPTION 'drawing_recognition_initiator_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.initiator_principal_id IS NULL OR
     char_length(NEW.initiator_principal_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'drawing_recognition_principal_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION ai_pdm_core.require_drawing_recognition_initiator_v1()
  OWNER TO jenfu_ai_pdm_migrator;

CREATE TRIGGER trg_drawing_recognition_initiator_v1
BEFORE INSERT OR UPDATE ON ai_pdm_core.drawing_recognition_sessions
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.require_drawing_recognition_initiator_v1();

-- Review decisions and formalization are human security events. Their legacy
-- actor_id remains a domain foreign key, while new events retain the verified
-- Principal independently. Historical events are not reverse-mapped.
ALTER TABLE ai_pdm_core.drawing_recognition_decisions
  ADD COLUMN actor_principal_id text NULL,
  ADD CONSTRAINT drawing_recognition_decision_actor_principal_v1
    FOREIGN KEY (company_id, actor_id, actor_principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id, pdm_user_id, principal_id)
    ON DELETE RESTRICT NOT VALID;

ALTER TABLE ai_pdm_core.drawing_recognition_formalization_events
  ADD COLUMN actor_principal_id text NULL,
  ADD CONSTRAINT drawing_recognition_formalization_actor_principal_v1
    FOREIGN KEY (company_id, actor_id, actor_principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id, pdm_user_id, principal_id)
    ON DELETE RESTRICT NOT VALID;

CREATE FUNCTION ai_pdm_core.require_drawing_recognition_event_principal_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.company_id, NEW.actor_id, NEW.actor_principal_id)
       IS DISTINCT FROM
       ROW(OLD.company_id, OLD.actor_id, OLD.actor_principal_id) THEN
      RAISE EXCEPTION 'drawing_recognition_event_actor_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.actor_principal_id IS NULL OR
     char_length(NEW.actor_principal_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'drawing_recognition_event_principal_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION ai_pdm_core.require_drawing_recognition_event_principal_v1()
  OWNER TO jenfu_ai_pdm_migrator;

CREATE TRIGGER trg_drawing_recognition_decision_principal_v1
BEFORE INSERT OR UPDATE ON ai_pdm_core.drawing_recognition_decisions
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.require_drawing_recognition_event_principal_v1();

CREATE TRIGGER trg_drawing_recognition_formalization_principal_v1
BEFORE INSERT OR UPDATE ON ai_pdm_core.drawing_recognition_formalization_events
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.require_drawing_recognition_event_principal_v1();

COMMIT;
