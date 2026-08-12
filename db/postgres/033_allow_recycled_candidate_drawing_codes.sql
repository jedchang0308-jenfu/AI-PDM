-- DEV-069: a cancelled candidate projection is immutable history, not an
-- active number claim. Release its provisional code from the active unique
-- namespace while preserving the cancelled drawing row and its audit links.

BEGIN;

ALTER TABLE drawings
  DROP CONSTRAINT IF EXISTS drawings_company_id_drawing_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drawings_active_company_number
  ON drawings(company_id, drawing_number)
  WHERE drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled';

COMMIT;
