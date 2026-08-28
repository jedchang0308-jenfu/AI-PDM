-- DEV-046 Cloud SQL candidate generated from db/postgres/045_part_number_draft_item_type_two_values.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Canonical change-control draft item classification: self_made/purchased
-- compatibility codes. Human labels are 依圖製作件 / 外購標準件.
-- Historical `standard` is retained as a source value only for this mapping;
-- no active API or UI may create it after this migration.
-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:5

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

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:29
