BEGIN;

ALTER TABLE part_numbers
  ADD COLUMN IF NOT EXISTS series_code TEXT;

ALTER TABLE numbering_draft_parts
  ADD COLUMN IF NOT EXISTS series_code TEXT;

COMMIT;
