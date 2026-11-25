-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: none
-- compatibility: backward-compatible
-- governance-review: AI-PDM DEV-013 DEV-015 legacy local forward
-- LOCAL ONLY. The native owner wrapper admits an isolated DEV-127 baseline,
-- preserves its original ledger, and records this forward in the local ledger.
-- 097 intentionally retained postgres ownership at that historical stage.
-- Bring application DDL ownership to the existing native migrator contract;
-- runtime memberships, business grants, identities and rows are unchanged.
DO $alignment$
DECLARE item record;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'LOCAL_OWNER_OPERATOR_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('ai_pdm_core','ai_pdm_contract')
    AND pg_get_userbyid(nspowner) NOT IN ('postgres','jenfu_ai_pdm_migrator'))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('ai_pdm_core','ai_pdm_contract') AND pg_get_userbyid(c.relowner) NOT IN ('postgres','jenfu_ai_pdm_migrator'))
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('ai_pdm_core','ai_pdm_contract') AND pg_get_userbyid(p.proowner) NOT IN ('postgres','jenfu_ai_pdm_migrator'))
    THEN RAISE EXCEPTION 'LOCAL_OWNER_INVENTORY_REJECTED'; END IF;
  FOR item IN SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('ai_pdm_core','ai_pdm_contract') AND c.relkind IN ('r','p','v','m','S','f')
      AND pg_get_userbyid(c.relowner)='postgres' ORDER BY c.relkind='S',n.nspname,c.relname
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO jenfu_ai_pdm_migrator',
      CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,item.nspname,item.relname);
  END LOOP;
  FOR item IN SELECT n.nspname,p.proname,p.prokind,pg_get_function_identity_arguments(p.oid) arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('ai_pdm_core','ai_pdm_contract') AND pg_get_userbyid(p.proowner)='postgres'
  LOOP
    EXECUTE format('ALTER %s %I.%I(%s) OWNER TO jenfu_ai_pdm_migrator',
      CASE item.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
      item.nspname,item.proname,item.arguments);
  END LOOP;
  FOR item IN SELECT n.nspname,t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname IN ('ai_pdm_core','ai_pdm_contract') AND t.typrelid=0 AND t.typelem=0
      AND pg_get_userbyid(t.typowner)='postgres'
  LOOP EXECUTE format('ALTER TYPE %I.%I OWNER TO jenfu_ai_pdm_migrator',item.nspname,item.typname); END LOOP;
  ALTER SCHEMA ai_pdm_core OWNER TO jenfu_ai_pdm_migrator;
  ALTER SCHEMA ai_pdm_contract OWNER TO jenfu_ai_pdm_migrator;
END;
$alignment$;
