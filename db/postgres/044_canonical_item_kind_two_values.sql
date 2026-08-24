-- Canonical item classification: manufactured/purchased compatibility codes.
--
-- Human semantics:
--   manufactured = 依圖製作件 (in-house or outsourced execution)
--   purchased    = 外購標準件
--
-- Deterministic legacy mappings:
--   outsourced -> manufactured
--   custom      -> manufactured
-- The retired `shared` value expressed universality, not the base category.
-- It must be reclassified explicitly by the provider-aware converter and have
-- `is_universal=true` before this migration runs. Guessing it into either base
-- category would violate the production zero-loss policy.
-- The source rows, relationships, files and audit timestamps remain intact;
-- only the obsolete classification vocabulary is normalized.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ai_pdm:canonical-item-kind-v1'));

DO $$
DECLARE
  ambiguous_shared bigint;
BEGIN
  SELECT COUNT(*) INTO ambiguous_shared
  FROM (
    SELECT item_kind FROM part_roots WHERE item_kind = 'shared'
    UNION ALL SELECT item_kind FROM part_numbers WHERE item_kind = 'shared'
    UNION ALL SELECT item_kind FROM numbering_draft_roots WHERE item_kind = 'shared'
    UNION ALL SELECT item_kind FROM numbering_draft_parts WHERE item_kind = 'shared'
  ) shared_rows;
  IF ambiguous_shared <> 0 THEN
    RAISE EXCEPTION 'canonical item kind migration requires explicit base classification for legacy shared rows: %', ambiguous_shared;
  END IF;
END $$;

UPDATE part_numbers
SET item_kind = CASE item_kind
      WHEN 'outsourced' THEN 'manufactured'
      WHEN 'custom' THEN 'manufactured'
      ELSE item_kind
    END
WHERE item_kind IN ('outsourced', 'custom');

UPDATE part_roots
SET item_kind = CASE item_kind
  WHEN 'outsourced' THEN 'manufactured'
  WHEN 'custom' THEN 'manufactured'
  ELSE item_kind
END
WHERE item_kind IN ('outsourced', 'custom');

UPDATE numbering_draft_parts
SET item_kind = CASE item_kind
      WHEN 'outsourced' THEN 'manufactured'
      WHEN 'custom' THEN 'manufactured'
      ELSE item_kind
    END
WHERE item_kind IN ('outsourced', 'custom');

UPDATE numbering_draft_roots
SET item_kind = CASE item_kind
  WHEN 'outsourced' THEN 'manufactured'
  WHEN 'custom' THEN 'manufactured'
  ELSE item_kind
END
WHERE item_kind IN ('outsourced', 'custom');

DO $$
DECLARE
  unresolved bigint;
BEGIN
  SELECT COUNT(*) INTO unresolved
  FROM (
    SELECT item_kind FROM part_roots WHERE item_kind NOT IN ('purchased', 'manufactured')
    UNION ALL SELECT item_kind FROM part_numbers WHERE item_kind NOT IN ('purchased', 'manufactured')
    UNION ALL SELECT item_kind FROM numbering_draft_roots WHERE item_kind NOT IN ('purchased', 'manufactured')
    UNION ALL SELECT item_kind FROM numbering_draft_parts WHERE item_kind NOT IN ('purchased', 'manufactured')
  ) invalid_rows;
  IF unresolved <> 0 THEN
    RAISE EXCEPTION 'canonical item kind migration unresolved rows: %', unresolved;
  END IF;
END $$;

ALTER TABLE part_roots DROP CONSTRAINT IF EXISTS part_roots_item_kind_check;
ALTER TABLE part_roots ADD CONSTRAINT part_roots_item_kind_check CHECK (item_kind IN ('purchased', 'manufactured'));
ALTER TABLE part_numbers DROP CONSTRAINT IF EXISTS part_numbers_item_kind_check;
ALTER TABLE part_numbers ADD CONSTRAINT part_numbers_item_kind_check CHECK (item_kind IN ('purchased', 'manufactured'));
ALTER TABLE numbering_draft_roots DROP CONSTRAINT IF EXISTS numbering_draft_roots_item_kind_check;
ALTER TABLE numbering_draft_roots ADD CONSTRAINT numbering_draft_roots_item_kind_check CHECK (item_kind IN ('purchased', 'manufactured'));
ALTER TABLE numbering_draft_parts DROP CONSTRAINT IF EXISTS numbering_draft_parts_item_kind_check;
ALTER TABLE numbering_draft_parts ADD CONSTRAINT numbering_draft_parts_item_kind_check CHECK (item_kind IN ('purchased', 'manufactured'));

COMMIT;
