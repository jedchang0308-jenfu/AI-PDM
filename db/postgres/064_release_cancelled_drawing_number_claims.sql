-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: backward-compatible

-- DEV-012: the consolidated production baseline must retain cancelled drawing
-- history without reserving its former provisional number. This is a forward-
-- only correction for databases that already applied the folded 001 baseline.

BEGIN;

ALTER TABLE ai_pdm_core.drawings
  DROP CONSTRAINT IF EXISTS drawings_company_id_drawing_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drawings_active_company_number
  ON ai_pdm_core.drawings(company_id, drawing_number)
  WHERE drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled';

COMMIT;
