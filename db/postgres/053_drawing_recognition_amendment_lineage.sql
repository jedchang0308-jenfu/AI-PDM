-- DEV-107: embedded recognition commit and amendment lineage.
-- Additive, forward-only. Raw observations stay on their source session;
-- amendments create a new extraction session and reference the origin only.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev107:drawing-recognition-lineage-v1'));

ALTER TABLE drawing_recognition_sessions
  ADD COLUMN IF NOT EXISTS session_purpose TEXT;
UPDATE drawing_recognition_sessions
  SET session_purpose = CASE
    WHEN supersedes_session_id IS NULL THEN 'recognition'
    ELSE 'rerun'
  END
  WHERE session_purpose IS NULL;
ALTER TABLE drawing_recognition_sessions
  ALTER COLUMN session_purpose SET DEFAULT 'recognition';
ALTER TABLE drawing_recognition_sessions
  ALTER COLUMN session_purpose SET NOT NULL;
ALTER TABLE drawing_recognition_sessions
  DROP CONSTRAINT IF EXISTS drawing_recognition_sessions_purpose_check;
ALTER TABLE drawing_recognition_sessions
  ADD CONSTRAINT drawing_recognition_sessions_purpose_check
  CHECK (session_purpose IN ('recognition', 'rerun', 'amendment'));

ALTER TABLE drawing_recognition_sessions
  ADD COLUMN IF NOT EXISTS evidence_origin_session_id TEXT;
ALTER TABLE drawing_recognition_sessions
  DROP CONSTRAINT IF EXISTS drawing_recognition_sessions_evidence_origin_fk;
ALTER TABLE drawing_recognition_sessions
  ADD CONSTRAINT drawing_recognition_sessions_evidence_origin_fk
  FOREIGN KEY (evidence_origin_session_id)
  REFERENCES drawing_recognition_sessions(id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION pdm_validate_drawing_recognition_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.session_purpose IS DISTINCT FROM NEW.session_purpose
    OR OLD.evidence_origin_session_id IS DISTINCT FROM NEW.evidence_origin_session_id
    OR (
      OLD.supersedes_session_id IS DISTINCT FROM NEW.supersedes_session_id
      AND NOT (OLD.status = 'cancelled' AND NEW.status = 'cancelled' AND NEW.supersedes_session_id IS NULL)
    )
  ) THEN
    RAISE EXCEPTION 'DRAWING_RECOGNITION_SESSION_LINEAGE_IMMUTABLE';
  END IF;

  IF NEW.evidence_origin_session_id IS NOT NULL
     AND NEW.evidence_origin_session_id <> NEW.id
     AND NOT EXISTS (
       SELECT 1
       FROM drawing_recognition_sessions origin
       WHERE origin.id = NEW.evidence_origin_session_id
         AND origin.company_id = NEW.company_id
     ) THEN
    RAISE EXCEPTION 'DRAWING_RECOGNITION_EVIDENCE_ORIGIN_SCOPE_INVALID';
  END IF;

  IF NEW.session_purpose = 'amendment' AND (
    NEW.supersedes_session_id IS NULL
    OR NEW.evidence_origin_session_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM drawing_recognition_sessions parent
      WHERE parent.id = NEW.supersedes_session_id
        AND parent.company_id = NEW.company_id
        AND parent.status = 'formalized'
        AND COALESCE(parent.evidence_origin_session_id, parent.id) = NEW.evidence_origin_session_id
    )
  ) THEN
    RAISE EXCEPTION 'DRAWING_RECOGNITION_AMENDMENT_LINEAGE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_recognition_lineage_guard ON drawing_recognition_sessions;
CREATE TRIGGER trg_drawing_recognition_lineage_guard
BEFORE INSERT OR UPDATE OF session_purpose, evidence_origin_session_id, supersedes_session_id
ON drawing_recognition_sessions
FOR EACH ROW
EXECUTE FUNCTION pdm_validate_drawing_recognition_lineage();

CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_lineage_order
  ON drawing_recognition_sessions(company_id, source_lineage_key, created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_recognition_open_amendment
  ON drawing_recognition_sessions(company_id, evidence_origin_session_id)
  WHERE session_purpose = 'amendment'
    AND status IN ('queued', 'extracting', 'review_ready', 'extraction_partial', 'ready_to_formalize');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drawing_recognition_sessions
    WHERE session_purpose NOT IN ('recognition', 'rerun', 'amendment')
  ) THEN
    RAISE EXCEPTION 'DRAWING_RECOGNITION_SESSION_PURPOSE_INVALID';
  END IF;
END;
$$;

COMMIT;
