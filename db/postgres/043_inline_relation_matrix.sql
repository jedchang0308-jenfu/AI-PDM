-- DEV-090 formal relation matrix authority.
-- This forward-only migration is fail-closed: formal links and historical
-- evidence are retained; only derived current Relation projections are
-- removed after all unresolved/current Relation work has been ruled out.
SELECT pg_advisory_xact_lock(hashtextextended('ai_pdm:dev-090:inline-relation-matrix', 0));

DO $$
DECLARE n BIGINT;
BEGIN
  IF to_regclass('relation_change_works') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM relation_change_works' INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'DEV090_ACTIVE_RELATION_WORK:%', n; END IF;
  END IF;
  IF to_regclass('pdm_work_review_requests') IS NOT NULL THEN
    EXECUTE $q$SELECT COUNT(*) FROM pdm_work_review_requests
      WHERE request_kind = 'relation_change' OR entity_type = 'relation'$q$ INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'DEV090_ACTIVE_RELATION_REVIEW:%', n; END IF;
  END IF;
  IF to_regclass('pdm_workbench_migration_quarantine') IS NOT NULL THEN
    EXECUTE $q$SELECT COUNT(*) FROM pdm_workbench_migration_quarantine
      WHERE resolution IS NULL AND source_kind ILIKE '%relation%'$q$ INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'DEV090_UNRESOLVED_RELATION_QUARANTINE:%', n; END IF;
  END IF;
  SELECT COUNT(*) INTO n FROM (
    SELECT drawing_number_id, part_number_id FROM drawing_part_links
    GROUP BY drawing_number_id, part_number_id HAVING COUNT(*) > 1
  ) duplicates;
  IF n <> 0 THEN RAISE EXCEPTION 'DEV090_DUAL_TYPE_RELATION_PAIR:%', n; END IF;
  SELECT COUNT(*) INTO n FROM (
    SELECT part_number_id FROM drawing_part_links
    WHERE link_type = 'primary_manufacturing'
    GROUP BY part_number_id HAVING COUNT(*) > 1
  ) multiple_primary;
  IF n <> 0 THEN RAISE EXCEPTION 'DEV090_MULTI_PRIMARY:%', n; END IF;
  SELECT COUNT(*) INTO n
    FROM drawing_part_links l
    LEFT JOIN drawing_numbers d ON d.id = l.drawing_number_id
    LEFT JOIN part_numbers p ON p.id = l.part_number_id
   WHERE d.id IS NULL OR p.id IS NULL
      OR d.company_id <> p.company_id OR d.part_root_id <> p.part_root_id;
  IF n <> 0 THEN RAISE EXCEPTION 'DEV090_ORPHAN_OR_CROSS_COMPANY_LINK:%', n; END IF;
END $$;

DELETE FROM pdm_work_review_requests
 WHERE request_kind = 'relation_change' OR entity_type = 'relation';
DELETE FROM canonical_workbench_states
 WHERE entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work');
DELETE FROM pdm_workbench_aggregates WHERE entity_type = 'relation';
DROP TABLE IF EXISTS relation_change_works;

-- Constraint names differ between installations. Discover and remove only
-- checks which admit the retired Relation current layer, then add canonical
-- Drawing/Part-only checks with stable names.
DO $$
DECLARE c RECORD;
BEGIN
  IF to_regclass('pdm_workbench_aggregates') IS NOT NULL THEN
    FOR c IN SELECT conname FROM pg_constraint
      WHERE conrelid = 'pdm_workbench_aggregates'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%relation%'
    LOOP EXECUTE format('ALTER TABLE pdm_workbench_aggregates DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
    ALTER TABLE pdm_workbench_aggregates DROP CONSTRAINT IF EXISTS dev090_aggregate_entity_type;
    ALTER TABLE pdm_workbench_aggregates
      ADD CONSTRAINT dev090_aggregate_entity_type CHECK (entity_type IN ('drawing', 'part'));
  END IF;
  IF to_regclass('canonical_workbench_states') IS NOT NULL THEN
    FOR c IN SELECT conname FROM pg_constraint
      WHERE conrelid = 'canonical_workbench_states'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%relation%'
    LOOP EXECUTE format('ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
    ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS dev090_state_entity_type;
    ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS dev090_state_data_layer;
    ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS dev090_state_layer_identity;
    ALTER TABLE canonical_workbench_states
      ADD CONSTRAINT dev090_state_entity_type CHECK (entity_type IN ('drawing', 'part'));
    ALTER TABLE canonical_workbench_states
      ADD CONSTRAINT dev090_state_data_layer CHECK (data_layer IN ('drawing_production', 'drawing_rd', 'part_formal', 'part_work));
    ALTER TABLE canonical_workbench_states
      ADD CONSTRAINT dev090_state_layer_identity CHECK (
        (data_layer = 'drawing_production' AND entity_type = 'drawing' AND branch_id IS NULL AND revision_id IS NOT NULL AND work_id IS NULL)
        OR (data_layer = 'drawing_rd' AND entity_type = 'drawing' AND branch_id IS NOT NULL AND revision_id IS NOT NULL)
        OR (data_layer = 'part_formal' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NULL)
        OR (data_layer = 'part_work' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NOT NULL)
      );
  END IF;
  IF to_regclass('pdm_work_review_requests') IS NOT NULL THEN
    FOR c IN SELECT conname FROM pg_constraint
      WHERE conrelid = 'pdm_work_review_requests'::regclass AND contype = 'c'
        AND (pg_get_constraintdef(oid) ILIKE '%relation%' OR pg_get_constraintdef(oid) ILIKE '%request_kind%')
    LOOP EXECUTE format('ALTER TABLE pdm_work_review_requests DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
    ALTER TABLE pdm_work_review_requests DROP CONSTRAINT IF EXISTS dev090_review_request_kind;
    ALTER TABLE pdm_work_review_requests DROP CONSTRAINT IF EXISTS dev090_review_entity_type;
    ALTER TABLE pdm_work_review_requests DROP CONSTRAINT IF EXISTS dev090_review_identity;
    ALTER TABLE pdm_work_review_requests
      ADD CONSTRAINT dev090_review_request_kind CHECK (request_kind IN ('drawing_revision', 'drawing_rd_void', 'part_change'));
    ALTER TABLE pdm_work_review_requests
      ADD CONSTRAINT dev090_review_entity_type CHECK (entity_type IN ('drawing', 'part'));
    ALTER TABLE pdm_work_review_requests
      ADD CONSTRAINT dev090_review_identity CHECK (
        (request_kind = 'drawing_rd_void' AND entity_type = 'drawing' AND work_id IS NULL AND branch_id IS NOT NULL)
        OR (request_kind <> 'drawing_rd_void' AND work_id IS NOT NULL)
      );
  END IF;
END $$;

DROP INDEX IF EXISTS uq_canonical_workbench_relation_layer;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_part_links_unique_pair
  ON drawing_part_links(drawing_number_id, part_number_id);
UPDATE pdm_workbench_state_authority_control
   SET mode = 'canonical_only', schema_hash = 'dev090-v1', row_version = row_version + 1, switched_at = now()
 WHERE id = 1;

DO $$
DECLARE n BIGINT;
BEGIN
  IF to_regclass('relation_change_works') IS NOT NULL THEN RAISE EXCEPTION 'DEV090_RELATION_WORK_TABLE_REMAINS'; END IF;
  SELECT COUNT(*) INTO n FROM canonical_workbench_states WHERE entity_type = 'relation' OR data_layer LIKE 'relation_%';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV090_RELATION_STATE_REMAINS:%', n; END IF;
  SELECT COUNT(*) INTO n FROM pdm_workbench_aggregates WHERE entity_type = 'relation';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV090_RELATION_AGGREGATE_REMAINS:%', n; END IF;
  SELECT COUNT(*) INTO n FROM pdm_work_review_requests WHERE request_kind = 'relation_change' OR entity_type = 'relation';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV090_RELATION_REVIEW_REMAINS:%', n; END IF;
END $$;

COMMENT ON INDEX idx_drawing_part_links_unique_pair IS
  'DEV-090: one formal relation cell per drawing/part pair; type is replaced atomically.';
