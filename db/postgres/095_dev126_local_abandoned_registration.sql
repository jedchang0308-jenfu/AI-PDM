-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: additive
-- migration-note: local-only terminal state for abandoned Central registrations without an acknowledgement
-- governance-review: AIPDM/DEV-126
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $local_target$
DECLARE
  database_marker text;
BEGIN
  IF current_database() !~ '^jenfu_local_[a-z0-9_]{3,51}$'
     OR COALESCE(host(inet_server_addr()), '') NOT IN ('127.0.0.1', '::1') THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_TARGET_REQUIRED';
  END IF;

  SELECT shobj_description(d.oid, 'pg_database')
    INTO database_marker
    FROM pg_database AS d
   WHERE d.datname = current_database();
  IF COALESCE(database_marker, '') !~ '^jenfu\.local-principal-bootstrap\.v1:[a-z][a-z0-9-]{2,63}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_BOOTSTRAP_MARKER_REQUIRED';
  END IF;
END
$local_target$;
SET LOCAL ROLE jenfu_ai_pdm_migrator;

DO $binding_upgrade$
DECLARE
  binding_oid oid;
  status_attnum smallint;
  correlation_attnum smallint;
  observed_at_attnum smallint;
  status_shape_count integer;
  status_exact_count integer;
  ack_shape_count integer;
  ack_exact_count integer;
  relevant_check_count integer;
  status_constraint_name text;
  ack_constraint_name text;
  status_expression constant text := 'status=anyarray[''pending_central_registration'',''central_registered'',''revoked'']';
  ack_expression constant text := 'status=''pending_central_registration''andcentral_correlation_idisnullandcentral_registration_observed_atisnullorstatus=anyarray[''central_registered'',''revoked'']andcentral_correlation_idisnotnullandcentral_registration_observed_atisnotnull';
BEGIN
  SELECT c.oid
    INTO binding_oid
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'ai_pdm_core'
     AND c.relname = 'local_sandbox_principal_session_bindings'
     AND c.relkind = 'r'
     AND c.relowner = 'jenfu_ai_pdm_migrator'::pg_catalog.regrole;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_BINDING_TABLE_OWNER_OR_SHAPE_INVALID';
  END IF;

  SELECT a.attnum INTO status_attnum
    FROM pg_catalog.pg_attribute AS a
   WHERE a.attrelid = binding_oid AND a.attname = 'status'
     AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
     AND a.attnotnull AND a.attnum > 0 AND NOT a.attisdropped;
  SELECT a.attnum INTO correlation_attnum
    FROM pg_catalog.pg_attribute AS a
   WHERE a.attrelid = binding_oid AND a.attname = 'central_correlation_id'
     AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
     AND NOT a.attnotnull AND a.attnum > 0 AND NOT a.attisdropped;
  SELECT a.attnum INTO observed_at_attnum
    FROM pg_catalog.pg_attribute AS a
   WHERE a.attrelid = binding_oid AND a.attname = 'central_registration_observed_at'
     AND a.atttypid = 'pg_catalog.timestamptz'::pg_catalog.regtype
     AND NOT a.attnotnull AND a.attnum > 0 AND NOT a.attisdropped;
  IF status_attnum IS NULL OR correlation_attnum IS NULL OR observed_at_attnum IS NULL THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_BINDING_COLUMNS_INVALID';
  END IF;

  SELECT
    count(*) FILTER (
      WHERE cardinality(checks.conkey) = 1
        AND checks.conkey[1] = status_attnum
    ),
    count(*) FILTER (
      WHERE cardinality(checks.conkey) = 1
        AND checks.conkey[1] = status_attnum
        AND checks.convalidated AND checks.conislocal AND checks.coninhcount = 0
        AND checks.normalized_expression = status_expression
    ),
    count(*) FILTER (
      WHERE cardinality(checks.conkey) = 3
        AND checks.conkey @> ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
        AND checks.conkey <@ ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
    ),
    count(*) FILTER (
      WHERE cardinality(checks.conkey) = 3
        AND checks.conkey @> ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
        AND checks.conkey <@ ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
        AND checks.convalidated AND checks.conislocal AND checks.coninhcount = 0
        AND checks.normalized_expression = ack_expression
    ),
    count(*) FILTER (
      WHERE checks.conkey && ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
    )
    INTO status_shape_count, status_exact_count, ack_shape_count, ack_exact_count, relevant_check_count
    FROM (
      SELECT c.conkey, c.convalidated, c.conislocal, c.coninhcount, c.conname,
             pg_catalog.regexp_replace(
               pg_catalog.lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid, true)),
               '[[:space:]]|[()]|::text', '', 'g'
             ) AS normalized_expression
        FROM pg_catalog.pg_constraint AS c
       WHERE c.conrelid = binding_oid AND c.contype = 'c'
    ) AS checks;

  IF status_shape_count <> 1 OR status_exact_count <> 1
     OR ack_shape_count <> 1 OR ack_exact_count <> 1
     OR relevant_check_count <> 2 THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_BINDING_CHECK_CONSTRAINTS_UNEXPECTED';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM ai_pdm_core.local_sandbox_principal_session_bindings AS b
     WHERE NOT (
       (b.status IN ('pending_central_registration', 'registration_abandoned')
        AND b.central_correlation_id IS NULL
        AND b.central_registration_observed_at IS NULL)
       OR
       (b.status IN ('central_registered', 'revoked')
        AND b.central_correlation_id IS NOT NULL
        AND b.central_registration_observed_at IS NOT NULL)
     )
  ) THEN
    RAISE EXCEPTION 'LOCAL_SANDBOX_BINDING_DATA_INCOMPATIBLE';
  END IF;

  SELECT c.conname INTO status_constraint_name
    FROM pg_catalog.pg_constraint AS c
   WHERE c.conrelid = binding_oid AND c.contype = 'c'
     AND c.convalidated AND c.conislocal AND c.coninhcount = 0
     AND cardinality(c.conkey) = 1 AND c.conkey[1] = status_attnum
     AND pg_catalog.regexp_replace(
           pg_catalog.lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid, true)),
           '[[:space:]]|[()]|::text', '', 'g'
         ) = status_expression;
  SELECT c.conname INTO ack_constraint_name
    FROM pg_catalog.pg_constraint AS c
   WHERE c.conrelid = binding_oid AND c.contype = 'c'
     AND c.convalidated AND c.conislocal AND c.coninhcount = 0
     AND cardinality(c.conkey) = 3
     AND c.conkey @> ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
     AND c.conkey <@ ARRAY[status_attnum, correlation_attnum, observed_at_attnum]::smallint[]
     AND pg_catalog.regexp_replace(
           pg_catalog.lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid, true)),
           '[[:space:]]|[()]|::text', '', 'g'
         ) = ack_expression;

  EXECUTE pg_catalog.format(
    'ALTER TABLE %I.%I DROP CONSTRAINT %I',
    'ai_pdm_core', 'local_sandbox_principal_session_bindings', status_constraint_name
  );
  EXECUTE pg_catalog.format(
    'ALTER TABLE %I.%I DROP CONSTRAINT %I',
    'ai_pdm_core', 'local_sandbox_principal_session_bindings', ack_constraint_name
  );
END
$binding_upgrade$;

ALTER TABLE ai_pdm_core.local_sandbox_principal_session_bindings
  ADD CONSTRAINT local_sandbox_principal_status_v2_check
    CHECK (status IN ('pending_central_registration', 'central_registered', 'revoked', 'registration_abandoned'));

ALTER TABLE ai_pdm_core.local_sandbox_principal_session_bindings
  ADD CONSTRAINT local_sandbox_principal_ack_state_v2_check
    CHECK (
      (status IN ('pending_central_registration', 'registration_abandoned')
       AND central_correlation_id IS NULL
       AND central_registration_observed_at IS NULL)
      OR
      (status IN ('central_registered', 'revoked')
       AND central_correlation_id IS NOT NULL
       AND central_registration_observed_at IS NOT NULL)
    );

COMMIT;
