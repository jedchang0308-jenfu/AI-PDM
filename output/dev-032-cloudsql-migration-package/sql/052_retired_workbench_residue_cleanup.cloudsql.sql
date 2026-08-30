-- DEV-046 Cloud SQL candidate generated from db/postgres/052_retired_workbench_residue_cleanup.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-106 closes recovery paths that could reintroduce retired Relation work
-- schema or retired BOM payload metadata after DEV-090 / DEV-095.
--
-- Formal drawing_part_links and immutable historical evidence are retained.
-- The migration fails closed if any current Relation work/projection remains.
SELECT pg_advisory_xact_lock(hashtextextended('ai_pdm:dev-106:retired-workbench-residue-cleanup', 0));

DO $$
DECLARE n BIGINT;
BEGIN
  IF to_regclass('relation_change_works') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM relation_change_works' INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'DEV106_ACTIVE_RELATION_WORK:%', n; END IF;
  END IF;

  SELECT COUNT(*) INTO n
    FROM canonical_workbench_states
   WHERE entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work');
  IF n <> 0 THEN RAISE EXCEPTION 'DEV106_ACTIVE_RELATION_STATE:%', n; END IF;

  SELECT COUNT(*) INTO n
    FROM pdm_workbench_aggregates
   WHERE entity_type = 'relation';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV106_ACTIVE_RELATION_AGGREGATE:%', n; END IF;

  SELECT COUNT(*) INTO n
    FROM pdm_work_review_requests
   WHERE request_kind = 'relation_change' OR entity_type = 'relation';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV106_ACTIVE_RELATION_REVIEW:%', n; END IF;

  SELECT COUNT(*) INTO n
    FROM pdm_workbench_migration_quarantine
   WHERE resolution IS NULL AND source_kind ILIKE '%relation%';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV106_UNRESOLVED_RELATION_QUARANTINE:%', n; END IF;
END $$;

DROP TABLE IF EXISTS relation_change_works;

-- A recovery mapper previously replayed migration 042 directly after later
-- migrations. Reinstall the current guard so no surviving trigger parses or
-- depends on the retired Relation work table.
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

UPDATE part_change_works
   SET proposed_payload = proposed_payload - 'bomUsagePolicy',
       updated_at = now()
 WHERE proposed_payload ? 'bomUsagePolicy';

ALTER TABLE part_change_works
  DROP CONSTRAINT IF EXISTS dev106_part_work_no_retired_bom_usage_policy;
ALTER TABLE part_change_works
  ADD CONSTRAINT dev106_part_work_no_retired_bom_usage_policy
  CHECK (NOT (proposed_payload ? 'bomUsagePolicy')) NOT VALID;
ALTER TABLE part_change_works
  VALIDATE CONSTRAINT dev106_part_work_no_retired_bom_usage_policy;

DO $$
DECLARE n BIGINT;
DECLARE guard_definition TEXT;
BEGIN
  IF to_regclass('relation_change_works') IS NOT NULL THEN
    RAISE EXCEPTION 'DEV106_RELATION_WORK_TABLE_REMAINS';
  END IF;

  SELECT COUNT(*) INTO n
    FROM part_change_works
   WHERE proposed_payload ? 'bomUsagePolicy';
  IF n <> 0 THEN RAISE EXCEPTION 'DEV106_RETIRED_BOM_PAYLOAD_REMAINS:%', n; END IF;

  SELECT pg_get_functiondef(p.oid) INTO guard_definition
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
   WHERE nsp.nspname = current_schema()
     AND p.proname = 'dev087_guard_company_reference'
   ORDER BY p.oid
   LIMIT 1;
  IF guard_definition IS NULL OR guard_definition ILIKE '%relation_change_works%' THEN
    RAISE EXCEPTION 'DEV106_RETIRED_RELATION_GUARD_REMAINS';
  END IF;
END $$;

COMMENT ON CONSTRAINT dev106_part_work_no_retired_bom_usage_policy ON part_change_works IS
  'DEV-106: retired BOM usage metadata cannot be restored through recovery or current writes.';
