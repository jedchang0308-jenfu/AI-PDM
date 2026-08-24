-- Canonical change-control draft item classification: self_made/purchased
-- compatibility codes. Human labels are 依圖製作件 / 外購標準件.
-- Historical `standard` is retained as a source value only for this mapping;
-- no active API or UI may create it after this migration.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:part-number-draft-item-type-v1'));

UPDATE part_number_drafts
SET item_type = 'purchased'
WHERE item_type = 'standard';

DO $$
DECLARE
  unresolved bigint;
BEGIN
  SELECT COUNT(*) INTO unresolved
  FROM part_number_drafts
  WHERE item_type NOT IN ('self_made', 'purchased');
  IF unresolved <> 0 THEN
    RAISE EXCEPTION 'part-number draft item type migration unresolved rows: %', unresolved;
  END IF;
END $$;

ALTER TABLE part_number_drafts DROP CONSTRAINT IF EXISTS part_number_drafts_item_type_check;
ALTER TABLE part_number_drafts
  ADD CONSTRAINT part_number_drafts_item_type_check CHECK (item_type IN ('self_made', 'purchased'));

COMMIT;
