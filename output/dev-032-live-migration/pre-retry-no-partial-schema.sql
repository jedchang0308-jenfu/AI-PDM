-- DEV-032 failed-execution no-partial-schema assertion.
-- The first migration execution never established a database connection.

DO $$
DECLARE
  user_table_count INTEGER;
BEGIN
  IF to_regclass('public.pdm_schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'DEV032_PARTIAL_MIGRATION_HISTORY_FOUND';
  END IF;

  SELECT COUNT(*)
  INTO user_table_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p');

  IF user_table_count <> 0 THEN
    RAISE EXCEPTION 'DEV032_PARTIAL_USER_TABLES_FOUND:%', user_table_count;
  END IF;
END
$$;
