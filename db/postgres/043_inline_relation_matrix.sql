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

-- DEV-090 retires Relation work, so the shared DEV-087 reference guard must
-- no longer parse a branch that references the dropped table. PostgreSQL
-- resolves relation names when the surviving trigger executes; leaving the
-- old function in place would block otherwise valid Drawing/Part mutations.
CREATE OR REPLACE FUNCTION dev087_guard_company_reference() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'drawing_rd_branches' THEN
    IF NOT EXISTS (SELECT 1 FROM drawings d WHERE d.id = NEW.drawing_id AND d.company_id = NEW.company_id)
      OR (NEW.base_production_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.base_production_revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.drawing_id))
      OR (NEW.latest_approved_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.latest_approved_revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.drawing_id))
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'drawing_revision_claims' THEN
    IF NOT EXISTS (SELECT 1 FROM drawings d JOIN drawing_rd_branches b ON b.id = NEW.branch_id WHERE d.id = NEW.drawing_id AND d.company_id = NEW.company_id AND b.company_id = NEW.company_id AND b.drawing_id = NEW.drawing_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.predecessor_revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.drawing_id)
    THEN RAISE EXCEPTION 'DEV087_PREDECESSOR_REFERENCE_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'drawing_revision_works' THEN
    IF NOT EXISTS (SELECT 1 FROM drawing_rd_branches b JOIN drawing_revision_claims c ON c.id = NEW.target_claim_id WHERE b.id = NEW.branch_id AND b.company_id = NEW.company_id AND b.drawing_id = NEW.drawing_id AND c.company_id = NEW.company_id AND c.drawing_id = NEW.drawing_id AND c.branch_id = NEW.branch_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.owner_user_id AND u.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_OWNER_COMPANY_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'part_change_works' THEN
    IF NOT EXISTS (SELECT 1 FROM part_numbers p WHERE p.id = NEW.part_id AND p.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.owner_user_id AND u.company_id = NEW.company_id)
    THEN RAISE EXCEPTION 'DEV087_OWNER_COMPANY_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'canonical_workbench_states' THEN
    IF (NEW.entity_type = 'drawing' AND NOT EXISTS (SELECT 1 FROM drawings d WHERE d.id = NEW.canonical_entity_id AND d.company_id = NEW.company_id))
      OR (NEW.entity_type = 'part' AND NOT EXISTS (SELECT 1 FROM part_numbers p WHERE p.id = NEW.canonical_entity_id AND p.company_id = NEW.company_id))
    THEN RAISE EXCEPTION 'DEV087_COMPANY_REFERENCE_MISMATCH'; END IF;
    IF NEW.entity_type = 'drawing' AND (NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.id = NEW.revision_id AND r.company_id = NEW.company_id AND r.drawing_id = NEW.canonical_entity_id) OR (NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drawing_rd_branches b WHERE b.id = NEW.branch_id AND b.company_id = NEW.company_id AND b.drawing_id = NEW.canonical_entity_id)))
    THEN RAISE EXCEPTION 'DEV087_DRAWING_REFERENCE_MISMATCH'; END IF;
    IF NEW.work_id IS NOT NULL AND ((NEW.data_layer = 'drawing_rd' AND NOT EXISTS (SELECT 1 FROM drawing_revision_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.drawing_id = NEW.canonical_entity_id)) OR (NEW.data_layer = 'part_work' AND NOT EXISTS (SELECT 1 FROM part_change_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.part_id = NEW.canonical_entity_id)))
    THEN RAISE EXCEPTION 'DEV087_WORK_REFERENCE_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'pdm_work_review_requests' THEN
    IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.reviewer_user_id AND u.company_id = NEW.company_id)
      OR (NEW.entity_type = 'drawing' AND NOT EXISTS (SELECT 1 FROM drawings d WHERE d.id = NEW.canonical_entity_id AND d.company_id = NEW.company_id))
      OR (NEW.entity_type = 'part' AND NOT EXISTS (SELECT 1 FROM part_numbers p WHERE p.id = NEW.canonical_entity_id AND p.company_id = NEW.company_id))
    THEN RAISE EXCEPTION 'DEV087_REVIEW_REFERENCE_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Constraint names differ between installations. Discover and remove only
-- checks which admit the retired Relation current layer. Fixed DDL stays at
-- top level so PostgreSQL parses CHECK expressions as SQL rather than PL/pgSQL.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'pdm_workbench_aggregates'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%relation%'
  LOOP EXECUTE format('ALTER TABLE pdm_workbench_aggregates DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'canonical_workbench_states'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%relation%'
  LOOP EXECUTE format('ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'pdm_work_review_requests'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) ILIKE '%relation%' OR pg_get_constraintdef(oid) ILIKE '%request_kind%')
  LOOP EXECUTE format('ALTER TABLE pdm_work_review_requests DROP CONSTRAINT IF EXISTS %I', c.conname); END LOOP;
END $$;

ALTER TABLE pdm_workbench_aggregates DROP CONSTRAINT IF EXISTS dev090_aggregate_entity_type;
ALTER TABLE pdm_workbench_aggregates
  ADD CONSTRAINT dev090_aggregate_entity_type CHECK (entity_type IN ('drawing', 'part'));

ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS dev090_state_entity_type;
ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS dev090_state_data_layer;
ALTER TABLE canonical_workbench_states DROP CONSTRAINT IF EXISTS dev090_state_layer_identity;
ALTER TABLE canonical_workbench_states
  ADD CONSTRAINT dev090_state_entity_type CHECK (entity_type IN ('drawing', 'part'));
ALTER TABLE canonical_workbench_states
  ADD CONSTRAINT dev090_state_data_layer CHECK (data_layer IN ('drawing_production', 'drawing_rd', 'part_formal', 'part_work'));
ALTER TABLE canonical_workbench_states
  ADD CONSTRAINT dev090_state_layer_identity CHECK (
    (data_layer = 'drawing_production' AND entity_type = 'drawing' AND branch_id IS NULL AND revision_id IS NOT NULL AND work_id IS NULL)
    OR (data_layer = 'drawing_rd' AND entity_type = 'drawing' AND branch_id IS NOT NULL AND revision_id IS NOT NULL)
    OR (data_layer = 'part_formal' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NULL)
    OR (data_layer = 'part_work' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NOT NULL)
  );

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
