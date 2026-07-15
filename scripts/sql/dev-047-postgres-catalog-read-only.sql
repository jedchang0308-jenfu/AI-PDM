-- DEV-047 Phase A catalog export contract.
-- Run only after the stable-pilot gate and target identity approval.
-- The statement reads metadata only and does not read business rows.

WITH target_namespaces AS (
  SELECT oid, nspname
  FROM pg_catalog.pg_namespace
  WHERE nspname IN ('public', 'platform', 'ontology', 'integration')
),
relations AS (
  SELECT
    namespace.nspname AS schema_name,
    relation.relname AS object_name,
    relation.relkind AS relation_kind,
    relation.relrowsecurity AS rls_enabled,
    relation.relforcerowsecurity AS rls_forced,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
  FROM pg_catalog.pg_class AS relation
  JOIN target_namespaces AS namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relkind IN ('r', 'p', 'S', 'v', 'm')
),
indexes AS (
  SELECT
    namespace.nspname AS schema_name,
    index_relation.relname AS index_name,
    table_relation.relname AS table_name,
    pg_catalog.pg_get_indexdef(index_relation.oid) AS definition,
    index_meta.indisunique AS is_unique,
    index_meta.indisvalid AS is_valid
  FROM pg_catalog.pg_index AS index_meta
  JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_meta.indexrelid
  JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_meta.indrelid
  JOIN target_namespaces AS namespace ON namespace.oid = table_relation.relnamespace
),
constraints AS (
  SELECT
    namespace.nspname AS schema_name,
    relation.relname AS table_name,
    constraint_meta.conname AS constraint_name,
    constraint_meta.contype AS constraint_kind,
    pg_catalog.pg_get_constraintdef(constraint_meta.oid, true) AS definition,
    referenced_namespace.nspname AS referenced_schema,
    referenced_relation.relname AS referenced_table
  FROM pg_catalog.pg_constraint AS constraint_meta
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_meta.conrelid
  JOIN target_namespaces AS namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_catalog.pg_class AS referenced_relation ON referenced_relation.oid = constraint_meta.confrelid
  LEFT JOIN pg_catalog.pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced_relation.relnamespace
),
functions AS (
  SELECT
    namespace.nspname AS schema_name,
    procedure.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
    pg_catalog.pg_get_functiondef(procedure.oid) AS definition,
    pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name
  FROM pg_catalog.pg_proc AS procedure
  JOIN target_namespaces AS namespace ON namespace.oid = procedure.pronamespace
),
triggers AS (
  SELECT
    namespace.nspname AS schema_name,
    relation.relname AS table_name,
    trigger_meta.tgname AS trigger_name,
    pg_catalog.pg_get_triggerdef(trigger_meta.oid, true) AS definition,
    trigger_meta.tgenabled AS enabled_state
  FROM pg_catalog.pg_trigger AS trigger_meta
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_meta.tgrelid
  JOIN target_namespaces AS namespace ON namespace.oid = relation.relnamespace
  WHERE NOT trigger_meta.tgisinternal
),
table_privileges AS (
  SELECT table_schema, table_name, grantee, privilege_type, is_grantable
  FROM information_schema.role_table_grants
  WHERE table_schema IN ('public', 'platform', 'ontology', 'integration')
),
routine_privileges AS (
  SELECT routine_schema, routine_name, grantee, privilege_type, is_grantable
  FROM information_schema.role_routine_grants
  WHERE routine_schema IN ('public', 'platform', 'ontology', 'integration')
),
policies AS (
  SELECT
    namespace.nspname AS schema_name,
    relation.relname AS table_name,
    policy.polname AS policy_name,
    policy.polpermissive AS is_permissive,
    policy.polcmd AS command_kind,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
  FROM pg_catalog.pg_policy AS policy
  JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
  JOIN target_namespaces AS namespace ON namespace.oid = relation.relnamespace
),
migration_relations AS (
  SELECT namespace.nspname AS schema_name, relation.relname AS relation_name
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname IN ('public', 'supabase_migrations')
    AND relation.relname IN ('pdm_schema_migrations', 'schema_migrations')
)
SELECT pg_catalog.jsonb_build_object(
  'schemaVersion', 1,
  'databaseName', pg_catalog.current_database(),
  'serverVersion', pg_catalog.current_setting('server_version'),
  'relations', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.object_name) FROM relations AS item), '[]'::jsonb),
  'indexes', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.index_name) FROM indexes AS item), '[]'::jsonb),
  'constraints', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.table_name, item.constraint_name) FROM constraints AS item), '[]'::jsonb),
  'functions', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.function_name, item.identity_arguments) FROM functions AS item), '[]'::jsonb),
  'triggers', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.table_name, item.trigger_name) FROM triggers AS item), '[]'::jsonb),
  'tablePrivileges', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.table_schema, item.table_name, item.grantee, item.privilege_type) FROM table_privileges AS item), '[]'::jsonb),
  'routinePrivileges', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.routine_schema, item.routine_name, item.grantee, item.privilege_type) FROM routine_privileges AS item), '[]'::jsonb),
  'policies', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.table_name, item.policy_name) FROM policies AS item), '[]'::jsonb),
  'migrationRelations', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.schema_name, item.relation_name) FROM migration_relations AS item), '[]'::jsonb)
) AS dev_047_catalog_inventory;

