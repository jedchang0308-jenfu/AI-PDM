BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev010-n2-ai-pdm'), hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

CREATE TABLE IF NOT EXISTS ai_pdm_core.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source_revision text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS ai_pdm_core.contract_manifest (
  contract_id text PRIMARY KEY,
  contract_version text NOT NULL,
  signature_sha256 char(64) NOT NULL CHECK (signature_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 char(64),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$')
);

-- The frozen historical lane was applied by its legacy migration owner.  The
-- task-owned migration-admin connection performs the one-time namespace and
-- owner transfer; no permanent cross-role membership is created.
RESET ROLE;

DO $import_legacy_ledger$
BEGIN
  IF to_regclass('public.pdm_schema_migrations') IS NOT NULL THEN
    INSERT INTO ai_pdm_core.schema_migrations (
      version, name, checksum_sha256, source_revision, applied_at
    )
    SELECT version, name, checksum, 'ai-pdm-fresh-derived-v1', applied_at
    FROM public.pdm_schema_migrations
    ON CONFLICT (version) DO UPDATE SET
      name = EXCLUDED.name,
      checksum_sha256 = EXCLUDED.checksum_sha256,
      source_revision = EXCLUDED.source_revision,
      applied_at = EXCLUDED.applied_at;
    DROP TABLE public.pdm_schema_migrations;
  END IF;
END;
$import_legacy_ledger$;

-- Migration 055 historically placed private catalog tables beside its public
-- projection.  Move those authority tables in-place; PostgreSQL preserves the
-- dependent view OIDs while their relation references follow the move.
DO $move_catalog$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['role_catalog_entries', 'active_role_catalog', 'role_catalog_publications'] LOOP
    IF to_regclass(format('ai_pdm_contract.%I', relation_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE ai_pdm_contract.%I SET SCHEMA ai_pdm_core', relation_name);
    END IF;
  END LOOP;
END;
$move_catalog$;

DO $move_public_relations$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT c.relname, c.relkind
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_class'::regclass
     AND dependency.objid = c.oid
     AND dependency.deptype = 'e'
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND dependency.objid IS NULL
    ORDER BY CASE c.relkind WHEN 'r' THEN 1 WHEN 'p' THEN 1 WHEN 'S' THEN 2 ELSE 3 END, c.relname
  LOOP
    IF to_regclass(format('public.%I', relation.relname)) IS NULL THEN
      CONTINUE;
    END IF;
    IF to_regclass(format('ai_pdm_core.%I', relation.relname)) IS NOT NULL THEN
      RAISE EXCEPTION 'DEV010_N2_AI_PDM_RELATION_COLLISION: %', relation.relname USING ERRCODE = '42710';
    END IF;
    EXECUTE format(
      'ALTER %s public.%I SET SCHEMA ai_pdm_core',
      CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE'
           WHEN relation.relkind = 'v' THEN 'VIEW'
           WHEN relation.relkind = 'm' THEN 'MATERIALIZED VIEW'
           ELSE 'TABLE' END,
      relation.relname
    );
  END LOOP;
END;
$move_public_relations$;

DO $move_public_functions$
DECLARE routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    LEFT JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_proc'::regclass
     AND dependency.objid = p.oid
     AND dependency.deptype = 'e'
    WHERE n.nspname = 'public' AND dependency.objid IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA ai_pdm_core', routine.signature);
  END LOOP;
END;
$move_public_functions$;

CREATE OR REPLACE FUNCTION ai_pdm_core.dev079_reject_reconciliation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ai_pdm_core, pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'drawing_recognition_owner_reconciliations_append_only';
END;
$function$;

CREATE OR REPLACE FUNCTION ai_pdm_core.dev079_enforce_recognition_part_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ai_pdm_core, pg_catalog
AS $function$
BEGIN
  IF NEW.proposed_owner_type = 'part_number'
     AND NEW.review_state IN ('accepted', 'corrected', 'mapped')
     AND btrim(coalesce(NEW.proposed_value, '')) <> ''
     AND (
       btrim(coalesce(NEW.proposed_owner_id, '')) = ''
       OR NOT (
         EXISTS (
           SELECT 1
           FROM ai_pdm_core.drawing_recognition_sessions AS session
           JOIN ai_pdm_core.drawings AS drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
           JOIN ai_pdm_core.drawing_part_links AS link ON link.drawing_number_id = drawing.formal_drawing_number_id
           JOIN ai_pdm_core.part_numbers AS part ON part.id = link.part_number_id AND part.company_id = session.company_id
           WHERE session.id = NEW.session_id AND session.company_id = NEW.company_id
             AND part.id = NEW.proposed_owner_id
             AND part.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
         )
         OR EXISTS (
           SELECT 1
           FROM ai_pdm_core.drawing_recognition_sessions AS session
           JOIN ai_pdm_core.drawings AS drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
           JOIN ai_pdm_core.numbering_draft_parts AS draft ON draft.id = NEW.proposed_owner_id
             AND draft.workspace_id = drawing.workspace_id AND draft.company_id = session.company_id
           JOIN ai_pdm_core.number_candidate_reservations AS reservation ON reservation.id = draft.candidate_reservation_id
             AND reservation.company_id = session.company_id AND reservation.reservation_state = 'active'
           WHERE session.id = NEW.session_id AND session.company_id = NEW.company_id
         )
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RECOGNITION_PART_OWNER_INVARIANT';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v1
WITH (security_barrier = true)
AS
SELECT
  publication.contract_version,
  publication.application_id,
  publication.catalog_version,
  publication.published_at,
  publication.catalog_sha256,
  entry.display_order,
  entry.stable_role_id,
  entry.role_code,
  entry.display_name,
  entry.assignable,
  entry.risk,
  entry.subject_kind,
  entry.recommendation_allowed,
  entry.delegation_allowed,
  entry.allowed_scope_kinds,
  entry.assignment_tier,
  entry.permissions,
  entry.metadata,
  entry.role_definition_hash
FROM ai_pdm_core.active_role_catalog AS active
JOIN ai_pdm_core.role_catalog_publications AS publication
  ON publication.application_id = active.application_id
 AND publication.catalog_version = active.catalog_version
 AND publication.status = 'active'
JOIN ai_pdm_core.role_catalog_entries AS entry
  ON entry.catalog_version = publication.catalog_version
WHERE publication.application_id = 'ai-pdm';

INSERT INTO ai_pdm_core.contract_manifest (
  contract_id, contract_version, signature_sha256, payload_sha256
) VALUES (
  'ai-pdm.role-catalog',
  'ai-pdm.role-catalog.2026-09-03.v3',
  '1317eec6191028b9ea9d327687343a000dbb37577e660fd7ad71f179286ced16',
  '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8'
)
ON CONFLICT (contract_id) DO UPDATE SET
  contract_version = EXCLUDED.contract_version,
  signature_sha256 = EXCLUDED.signature_sha256,
  payload_sha256 = EXCLUDED.payload_sha256,
  published_at = clock_timestamp();

CREATE OR REPLACE VIEW ai_pdm_contract.v_contract_manifest_v1
WITH (security_barrier = true)
AS
SELECT contract_id, contract_version, signature_sha256::text, payload_sha256::text
FROM ai_pdm_core.contract_manifest;

CREATE OR REPLACE VIEW ai_pdm_contract.v_r1_company_scope_v1
WITH (security_barrier = true)
AS
SELECT id AS company_id, company_code, company_kind
FROM ai_pdm_core.companies
WHERE id IN ('company-jenfu', 'company-smoke');

CREATE OR REPLACE VIEW ai_pdm_contract.v_r1_numbering_objects_v1
WITH (security_barrier = true)
AS
SELECT
  'root'::text AS object_kind,
  root.id AS object_id,
  root.company_id,
  root.root_code AS object_code,
  NULL::text AS parent_root_id,
  NULL::integer AS sequence_no,
  root.record_status,
  root.created_at
FROM ai_pdm_core.part_roots AS root
WHERE root.company_id IN ('company-jenfu', 'company-smoke')
UNION ALL
SELECT
  'part'::text,
  part.id,
  part.company_id,
  part.part_number,
  part.part_root_id,
  part.sequence_no,
  part.record_status,
  part.created_at
FROM ai_pdm_core.part_numbers AS part
WHERE part.company_id IN ('company-jenfu', 'company-smoke')
UNION ALL
SELECT
  'drawing'::text,
  drawing.id,
  drawing.company_id,
  drawing.drawing_number,
  drawing.part_root_id,
  drawing.sequence_no,
  drawing.record_status,
  drawing.created_at
FROM ai_pdm_core.drawing_numbers AS drawing
WHERE drawing.company_id IN ('company-jenfu', 'company-smoke');

CREATE OR REPLACE VIEW ai_pdm_contract.v_r1_numbering_relations_v1
WITH (security_barrier = true)
AS
SELECT
  link.id AS relation_id,
  drawing.company_id,
  link.drawing_number_id,
  link.part_number_id,
  link.link_type,
  link.created_at
FROM ai_pdm_core.drawing_part_links AS link
JOIN ai_pdm_core.drawing_numbers AS drawing ON drawing.id = link.drawing_number_id
JOIN ai_pdm_core.part_numbers AS part
  ON part.id = link.part_number_id
 AND part.company_id = drawing.company_id
WHERE drawing.company_id IN ('company-jenfu', 'company-smoke');

CREATE OR REPLACE VIEW ai_pdm_contract.v_r1_sequence_state_v1
WITH (security_barrier = true)
AS
SELECT sequence_key, company_id, next_value, updated_at
FROM ai_pdm_core.numbering_sequences
WHERE company_id IN ('company-jenfu', 'company-smoke');

CREATE OR REPLACE VIEW ai_pdm_contract.v_r1_numbering_create_audit_v1
WITH (security_barrier = true)
AS
SELECT
  id AS audit_id,
  company_id,
  scope_kind,
  action,
  detail_json ->> 'rootCode' AS root_code,
  detail_json ->> 'partNumber' AS part_number,
  detail_json ->> 'drawingNumber' AS drawing_number,
  created_at
FROM ai_pdm_core.audit_logs
WHERE company_id IN ('company-jenfu', 'company-smoke')
  AND scope_kind = 'tenant'
  AND action = 'numbering.create';

CREATE OR REPLACE VIEW ai_pdm_contract.v_r1_command_effect_v1
WITH (security_barrier = true)
AS
SELECT
  'command_receipt'::text AS effect_kind,
  receipt.id AS effect_id,
  receipt.company_id,
  receipt.command_name AS effect_name,
  NULL::text AS aggregate_id,
  receipt.response_json #>> '{result,root,id}' AS root_id,
  receipt.response_json #>> '{result,partNumber,id}' AS part_id,
  receipt.response_json #>> '{result,drawingNumber,id}' AS drawing_id,
  receipt.command_status AS effect_status,
  COALESCE(receipt.completed_at, receipt.created_at) AS occurred_at
FROM ai_pdm_core.platform_command_receipts AS receipt
WHERE receipt.company_id IN ('company-jenfu', 'company-smoke')
  AND receipt.command_name = 'pdm.numbering.create_official_record'
UNION ALL
SELECT
  'outbox_event'::text,
  event.id,
  event.company_id,
  event.event_type,
  event.aggregate_id,
  event.aggregate_id,
  NULL::text,
  NULL::text,
  event.delivery_status,
  event.occurred_at
FROM ai_pdm_core.platform_outbox_events AS event
WHERE event.company_id IN ('company-jenfu', 'company-smoke')
  AND event.event_type = 'pdm.numbering.official_record_created.v1';

-- PostgreSQL does not create indexes on referencing columns for foreign keys.
-- The pre-DEV-010 AI PDM schema therefore carries a sizeable set of unindexed
-- foreign keys after it is moved into ai_pdm_core.  Create deterministic,
-- same-table indexes for every uncovered FK so deletes/updates on referenced
-- rows cannot degrade into unbounded scans.
DO $create_missing_foreign_key_indexes$
DECLARE foreign_key record;
BEGIN
  FOR foreign_key IN
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      constraint_row.conname AS constraint_name,
      string_agg(quote_ident(attribute.attname), ', ' ORDER BY key_column.ordinality) AS column_list
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = constraint_row.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE constraint_row.contype = 'f'
      AND namespace.nspname = 'ai_pdm_core'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_row
        WHERE index_row.indrelid = constraint_row.conrelid
          AND index_row.indisvalid
          AND index_row.indnkeyatts >= cardinality(constraint_row.conkey)
          AND (
            SELECT array_agg(index_row.indkey[position]::smallint ORDER BY position)
            FROM generate_series(0, cardinality(constraint_row.conkey) - 1) AS position
          ) = constraint_row.conkey
      )
    GROUP BY namespace.nspname, relation.relname, constraint_row.conname,
      constraint_row.conrelid, constraint_row.conkey
    ORDER BY namespace.nspname, relation.relname, constraint_row.conname
  LOOP
    EXECUTE format(
      'CREATE INDEX %I ON %I.%I (%s)',
      'dev010_fk_' || substr(md5(
        foreign_key.schema_name || '.' || foreign_key.table_name || '.' || foreign_key.constraint_name
      ), 1, 20),
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.column_list
    );
  END LOOP;
END;
$create_missing_foreign_key_indexes$;

DO $ownership_and_search_path$
DECLARE relation record;
DECLARE routine record;
BEGIN
  FOR relation IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('ai_pdm_core', 'ai_pdm_contract')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO jenfu_ai_pdm_migrator',
      CASE WHEN relation.relkind = 'S' THEN 'SEQUENCE'
           WHEN relation.relkind = 'v' THEN 'VIEW'
           WHEN relation.relkind = 'm' THEN 'MATERIALIZED VIEW'
           ELSE 'TABLE' END,
      relation.nspname,
      relation.relname
    );
  END LOOP;
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ai_pdm_core'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO jenfu_ai_pdm_migrator', routine.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = ai_pdm_core, pg_catalog', routine.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier', routine.signature);
  END LOOP;
END;
$ownership_and_search_path$;

REVOKE CREATE ON SCHEMA public, ai_pdm_core, ai_pdm_contract FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_pdm_core FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA ai_pdm_core FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_pdm_contract FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;
GRANT USAGE ON SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
REVOKE ALL ON TABLE ai_pdm_core.schema_migrations, ai_pdm_core.contract_manifest FROM jenfu_ai_pdm_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT SELECT ON TABLE ai_pdm_contract.v_application_role_catalog_v1, ai_pdm_contract.v_contract_manifest_v1
  TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;
GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_r1_verifier;
GRANT SELECT ON TABLE
  ai_pdm_contract.v_r1_company_scope_v1,
  ai_pdm_contract.v_r1_numbering_objects_v1,
  ai_pdm_contract.v_r1_numbering_relations_v1,
  ai_pdm_contract.v_r1_sequence_state_v1,
  ai_pdm_contract.v_r1_numbering_create_audit_v1,
  ai_pdm_contract.v_r1_command_effect_v1
TO jenfu_r1_verifier;

DO $assert_public_empty$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_class'::regclass
     AND dependency.objid = c.oid
     AND dependency.deptype = 'e'
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND dependency.objid IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    LEFT JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_proc'::regclass
     AND dependency.objid = p.oid
     AND dependency.deptype = 'e'
    WHERE n.nspname = 'public' AND dependency.objid IS NULL
  ) THEN
    RAISE EXCEPTION 'DEV010_N2_PUBLIC_BUSINESS_OBJECT_REMAINS' USING ERRCODE = '55000';
  END IF;
END;
$assert_public_empty$;

COMMIT;
