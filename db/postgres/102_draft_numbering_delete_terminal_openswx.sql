-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE FUNCTION ai_pdm_core.delete_draft_bundle_terminal_openswx_v1(p_company_id text, p_root_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ai_pdm_core
AS $function$
DECLARE
  job record;
  removed integer := 0;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' OR NOT EXISTS (
    SELECT 1 FROM part_roots root
    WHERE root.company_id = p_company_id AND root.id = p_root_id
      AND root.record_status IN ('Draft', 'NeedInfo')
  ) OR EXISTS (
    SELECT 1 FROM drawing_numbers drawing
    WHERE drawing.company_id = p_company_id AND drawing.part_root_id = p_root_id
      AND drawing.record_status NOT IN ('Draft', 'NeedInfo')
  ) OR EXISTS (
    SELECT 1 FROM drawing_revisions revision JOIN drawings drawing
      ON drawing.company_id = revision.company_id AND drawing.id = revision.drawing_id
    WHERE drawing.company_id = p_company_id AND drawing.part_root_id = p_root_id
      AND revision.lifecycle_state NOT IN ('preparing', 'correction_required', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'NUMBERING_DRAFT_DELETE_OPEN_SWX_SCOPE_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR job IN
    SELECT worker.id, worker.status, worker.dispatch_state
    FROM openswx_metadata_jobs worker
    WHERE worker.company_id = p_company_id AND (
      worker.drawing_number_id IN (
        SELECT id FROM drawing_numbers WHERE company_id = p_company_id AND part_root_id = p_root_id
      ) OR worker.drawing_revision_id IN (
        SELECT revision.id FROM drawing_revisions revision JOIN drawings drawing
          ON drawing.company_id = revision.company_id AND drawing.id = revision.drawing_id
        WHERE drawing.company_id = p_company_id AND drawing.part_root_id = p_root_id
      )
    )
    ORDER BY worker.id FOR UPDATE
  LOOP
    IF job.status NOT IN ('completed', 'failed', 'cancelled') OR job.dispatch_state <> 'terminal' THEN
      RAISE EXCEPTION 'NUMBERING_DRAFT_DELETE_OPEN_SWX_ACTIVE' USING ERRCODE = '23514';
    END IF;
    DELETE FROM openswx_metadata_jobs WHERE company_id = p_company_id AND id = job.id;
    removed := removed + 1;
  END LOOP;
  RETURN removed;
END;
$function$;

REVOKE ALL ON FUNCTION ai_pdm_core.delete_draft_bundle_terminal_openswx_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.delete_draft_bundle_terminal_openswx_v1(text, text) TO jenfu_ai_pdm_runtime;
COMMIT;
