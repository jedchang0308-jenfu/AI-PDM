-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: validates the shared submitter and preserves immutable review identity
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.pdm_work_review_requests
  DROP CONSTRAINT pdm_work_review_shared_request_check,
  ADD CONSTRAINT pdm_work_review_shared_request_check CHECK (
    (reviewer_user_id IS NOT NULL AND submitted_by IS NULL AND requires_model_review IS NULL AND requires_publish IS NULL)
    OR (reviewer_user_id IS NULL AND submitted_by IS NOT NULL AND requires_model_review IS NOT NULL AND requires_publish IS NOT NULL
      AND request_kind IN ('drawing_revision', 'drawing_rd_void', 'part_change'))
  );

CREATE FUNCTION ai_pdm_core.dev121_guard_work_review_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, ai_pdm_core AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.users u
    WHERE u.id = COALESCE(NEW.reviewer_user_id, NEW.submitted_by) AND u.company_id = NEW.company_id
  ) OR (NEW.entity_type = 'drawing' AND NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.drawings d WHERE d.id = NEW.canonical_entity_id AND d.company_id = NEW.company_id
  )) OR (NEW.entity_type = 'part' AND NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.part_numbers p WHERE p.id = NEW.canonical_entity_id AND p.company_id = NEW.company_id
  )) THEN
    RAISE EXCEPTION 'DEV087_REVIEW_REFERENCE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev087_review_request_company_guard ON ai_pdm_core.pdm_work_review_requests;
CREATE TRIGGER trg_dev087_review_request_company_guard BEFORE INSERT ON ai_pdm_core.pdm_work_review_requests
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev121_guard_work_review_reference();

CREATE OR REPLACE FUNCTION ai_pdm_core.dev087_protect_review_request_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.company_id, OLD.request_kind, OLD.entity_type, OLD.canonical_entity_id, OLD.work_id,
         OLD.branch_id, OLD.reviewer_user_id, OLD.review_cycle_id, OLD.snapshot_payload,
         OLD.snapshot_hash, OLD.submitted_by, OLD.requires_model_review, OLD.requires_publish)
    IS DISTINCT FROM
     ROW(NEW.company_id, NEW.request_kind, NEW.entity_type, NEW.canonical_entity_id, NEW.work_id,
         NEW.branch_id, NEW.reviewer_user_id, NEW.review_cycle_id, NEW.snapshot_payload,
         NEW.snapshot_hash, NEW.submitted_by, NEW.requires_model_review, NEW.requires_publish)
  THEN
    RAISE EXCEPTION 'DEV087_REVIEW_REQUEST_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev087_review_request_identity ON ai_pdm_core.pdm_work_review_requests;
CREATE TRIGGER trg_dev087_review_request_identity BEFORE UPDATE ON ai_pdm_core.pdm_work_review_requests
FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.dev087_protect_review_request_identity();

COMMIT;
