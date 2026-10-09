-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none (migrator-only unlinked legacy profile capability)
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-121#unlinked-profile-cleanup
-- Installation contains no target or operational evidence. The protected owner
-- supplies an immutable private input to the parameterized capability and keeps
-- its target-specific evidence private. This migration does not delete data.
-- Native prior-row snapshot and the exact DELETE share the caller transaction.

SET LOCAL ROLE jenfu_ai_pdm_migrator;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL timezone = 'UTC';
SET LOCAL row_security = off;

CREATE FUNCTION ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $snapshot_body$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.action = 'legacy_profile.unlinked.delete.v2'
       OR NEW.detail_json->>'contractVersion' = 'ai-pdm.dev121.unlinked-profile-cleanup.v2' THEN
      IF current_user <> 'jenfu_ai_pdm_migrator'
         OR NEW.action IS DISTINCT FROM 'legacy_profile.unlinked.delete.v2'
         OR NEW.detail_json->>'contractVersion' IS DISTINCT FROM 'ai-pdm.dev121.unlinked-profile-cleanup.v2' THEN
        RAISE EXCEPTION 'AIPDM_UNLINKED_PROFILE_SNAPSHOT_WRITER_INVALID' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.action = 'legacy_profile.unlinked.delete.v2'
     OR OLD.detail_json->>'contractVersion' = 'ai-pdm.dev121.unlinked-profile-cleanup.v2'
     OR (TG_OP = 'UPDATE' AND
         (NEW.action = 'legacy_profile.unlinked.delete.v2'
          OR NEW.detail_json->>'contractVersion' = 'ai-pdm.dev121.unlinked-profile-cleanup.v2')) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_PROFILE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$snapshot_body$;
ALTER FUNCTION ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()
  FROM PUBLIC,jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_dev121_unlinked_profile_snapshot_v2
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.audit_logs FOR EACH ROW
  EXECUTE FUNCTION ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2();

CREATE FUNCTION ai_pdm_core.delete_unlinked_legacy_profile_v1(
  target_profile_id text, target_company_id text, operation_id text,
  operation_context jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog
SET lock_timeout='2s'
SET statement_timeout='15s'
SET idle_in_transaction_session_timeout='30s'
SET timezone='UTC'
SET row_security=off
AS $cleanup$
DECLARE
  target_id constant text := target_profile_id;
  target_company constant text := target_company_id;
  audit_id text;
  audit_action constant text := 'legacy_profile.unlinked.delete.v2';
  receipt_contract constant text := 'ai-pdm.dev121.unlinked-profile-cleanup.v2';
  snapshot_body constant text := $snapshot_body$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.action = 'legacy_profile.unlinked.delete.v2'
       OR NEW.detail_json->>'contractVersion' = 'ai-pdm.dev121.unlinked-profile-cleanup.v2' THEN
      IF current_user <> 'jenfu_ai_pdm_migrator'
         OR NEW.action IS DISTINCT FROM 'legacy_profile.unlinked.delete.v2'
         OR NEW.detail_json->>'contractVersion' IS DISTINCT FROM 'ai-pdm.dev121.unlinked-profile-cleanup.v2' THEN
        RAISE EXCEPTION 'AIPDM_UNLINKED_PROFILE_SNAPSHOT_WRITER_INVALID' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.action = 'legacy_profile.unlinked.delete.v2'
     OR OLD.detail_json->>'contractVersion' = 'ai-pdm.dev121.unlinked-profile-cleanup.v2'
     OR (TG_OP = 'UPDATE' AND
         (NEW.action = 'legacy_profile.unlinked.delete.v2'
          OR NEW.detail_json->>'contractVersion' = 'ai-pdm.dev121.unlinked-profile-cleanup.v2')) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_PROFILE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$snapshot_body$;
  snapshot_function oid;
  snapshot_guard_present boolean;
  prior_row jsonb;
  receipt ai_pdm_core.audit_logs%ROWTYPE;
  relation record;
  edge record;
  join_predicate text;
  has_reference boolean;
  inventory_before jsonb;
  inventory_after jsonb;
  deleted_count integer;
  prior_hash text;
  cleanup_function oid;
BEGIN
  IF current_user <> 'jenfu_ai_pdm_migrator'
     OR pg_catalog.current_setting('transaction_isolation') <> 'read committed'
     OR pg_catalog.current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_WRITER_INVALID' USING ERRCODE = '23514';
  END IF;
  IF target_id IS NULL OR target_company IS NULL
     OR length(target_id) NOT BETWEEN 1 AND 512
     OR length(target_company) NOT BETWEEN 1 AND 512
     OR target_id ~ '[[:cntrl:]]' OR target_company ~ '[[:cntrl:]]'
     OR btrim(target_id) <> target_id OR btrim(target_company) <> target_company
     OR operation_id IS NULL
     OR operation_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_INPUT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(operation_context) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_CONTEXT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(operation_context)) <> 2
     OR jsonb_typeof(operation_context->'sourceRevision') IS DISTINCT FROM 'string'
     OR jsonb_typeof(operation_context->'inputSha256') IS DISTINCT FROM 'string'
     OR operation_context->>'sourceRevision' !~ '^[0-9a-f]{40}$'
     OR operation_context->>'inputSha256' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_CONTEXT_INVALID' USING ERRCODE = '23514';
  END IF;
  audit_id := 'dev121-unlinked-profile-cleanup-v2-' ||
    encode(pg_catalog.sha256(convert_to(jsonb_build_array(target_company,target_id)::text,'UTF8')),'hex');
  cleanup_function := pg_catalog.to_regprocedure('ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb)');
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=cleanup_function AND p.proowner='jenfu_ai_pdm_migrator'::regrole
      AND NOT p.prosecdef AND p.prokind='f' AND p.pronargs=4
      AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
      AND p.provolatile='v' AND p.proparallel='u' AND p.prorettype='pg_catalog.jsonb'::regtype
      AND NOT pg_catalog.has_function_privilege('jenfu_ai_pdm_runtime',p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
                     WHERE a.grantee <> p.proowner AND a.privilege_type='EXECUTE')
  ) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_CAPABILITY_DRIFT' USING ERRCODE='23514';
  END IF;
  -- Same owner runner fence and same subject fence as the unmodified 065 guard.
  -- Runtime has no DDL; cooperating owner DDL uses this existing migration lane.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('dev012-ai-pdm'), pg_catalog.hashtext(current_database()));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aipdm-dev121-subject'), pg_catalog.hashtext(target_id));

  IF pg_catalog.to_regclass('ai_pdm_core.users') IS NULL
     OR pg_catalog.to_regclass('ai_pdm_core.principal_accounts') IS NULL
     OR pg_catalog.to_regclass('ai_pdm_core.principal_identity_cutovers') IS NULL THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_SCHEMA_UNKNOWN' USING ERRCODE = '23514';
  END IF;
  -- Protect row absence too. This prevents a new profile/FK edge while checking.
  LOCK TABLE ai_pdm_core.users, ai_pdm_core.audit_logs IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid IN ('ai_pdm_core.users'::regclass, 'ai_pdm_core.audit_logs'::regclass)
      AND (c.relowner <> 'jenfu_ai_pdm_migrator'::regrole
           OR c.relkind <> 'r' OR c.relforcerowsecurity)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    WHERE n.nspname = 'ai_pdm_core'
      AND n.nspowner <> 'jenfu_ai_pdm_migrator'::regrole
  ) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_OWNERSHIP_OR_RLS' USING ERRCODE = '23514';
  END IF;
  -- Refuse a future users shape rather than snapshot an unknown credential field.
  IF (SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'ai_pdm_core.users'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped) IS DISTINCT FROM
     ARRAY['account_lifecycle_version','account_status','account_status_changed_at',
           'account_status_changed_by','account_status_reason','company_id',
           'created_at','display_name','email','id','password_hash','role',
           'session_invalid_before','system_role_enabled','updated_at']::text[] THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_PROFILE_SHAPE_UNKNOWN' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'ai_pdm_core.users'::regclass
      AND t.tgname = 'guard_legacy_user_security_write_v1'
      AND NOT t.tgisinternal AND t.tgenabled = 'O' AND t.tgtype = 27
      AND t.tgnargs = 0 AND t.tgqual IS NULL
      AND p.oid = 'ai_pdm_core.guard_legacy_security_write_v1()'::regprocedure
      AND p.proowner = 'jenfu_ai_pdm_migrator'::regrole AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND encode(pg_catalog.sha256(convert_to(replace(p.prosrc, E'\r\n', E'\n'), 'UTF8')), 'hex')
          = 'de0dce8da17d6d73a841511956ae1e9d3c2756b08d0333c1db8e1f7fecfdc7cd'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'ai_pdm_core.users'::regclass
      AND (t.tgtype::integer & 8) <> 0
      AND (t.tgenabled NOT IN ('O','A')
           OR (NOT t.tgisinternal AND t.tgname <> 'guard_legacy_user_security_write_v1'))
  ) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_LEGACY_GUARD_DRIFT' USING ERRCODE = '23514';
  END IF;

  snapshot_function := pg_catalog.to_regprocedure('ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()');
  snapshot_guard_present := snapshot_function IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='ai_pdm_core.audit_logs'::regclass
      AND tgname='guard_dev121_unlinked_profile_snapshot_v2');
  IF NOT snapshot_guard_present THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_SNAPSHOT_GUARD_MISSING' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_trigger t ON t.tgfoid=p.oid
    WHERE p.oid=snapshot_function AND p.proowner='jenfu_ai_pdm_migrator'::regrole
      AND NOT p.prosecdef AND p.prokind='f' AND p.pronargs=0
      AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
      AND p.provolatile='v' AND p.proparallel='u'
      AND p.prorettype='pg_catalog.trigger'::regtype
      AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND replace(p.prosrc,E'\r\n',E'\n')=snapshot_body
      AND NOT pg_catalog.has_function_privilege('jenfu_ai_pdm_runtime',p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
                      WHERE a.grantee<>p.proowner AND a.privilege_type='EXECUTE')
      AND t.tgrelid='ai_pdm_core.audit_logs'::regclass
      AND t.tgname='guard_dev121_unlinked_profile_snapshot_v2'
      AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=31
      AND t.tgnargs=0 AND t.tgqual IS NULL
  ) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_SNAPSHOT_GUARD_DRIFT' USING ERRCODE='23514';
  END IF;
  -- Profile ids are globally unique. A receipt for this id under a different
  -- company is a conflict, never evidence that the requested tuple was absent.
  IF EXISTS (
    SELECT 1 FROM ai_pdm_core.audit_logs a
    WHERE (a.action=audit_action OR a.detail_json->>'contractVersion'=receipt_contract)
      AND a.detail_json->>'targetProfileId'=target_id
      AND a.company_id IS DISTINCT FROM target_company
  ) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_RECEIPT_CONFLICT' USING ERRCODE='23514';
  END IF;
  SELECT to_jsonb(u) INTO prior_row FROM ai_pdm_core.users u
    WHERE u.id = target_id FOR UPDATE;
  SELECT * INTO receipt FROM ai_pdm_core.audit_logs WHERE id = audit_id FOR UPDATE;
  IF FOUND THEN
    IF NOT snapshot_guard_present THEN
      RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_SNAPSHOT_GUARD_MISSING' USING ERRCODE='23514';
    END IF;
    IF jsonb_typeof(receipt.detail_json) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_RECEIPT_CONFLICT' USING ERRCODE = '23514';
    END IF;
    IF receipt.action IS DISTINCT FROM audit_action OR receipt.company_id IS DISTINCT FROM target_company
       OR receipt.scope_kind IS DISTINCT FROM 'tenant' OR receipt.actor_id IS NOT NULL
       OR receipt.submission_id IS NOT NULL
       OR receipt.detail_json->>'contractVersion' IS DISTINCT FROM receipt_contract
       OR receipt.detail_json->>'targetProfileId' IS DISTINCT FROM target_id
       OR receipt.detail_json->>'migration' IS DISTINCT FROM '084_dev121_unlinked_legacy_profile_cleanup'
       OR receipt.detail_json->>'operationId' IS DISTINCT FROM operation_id
       OR receipt.detail_json->'operationContext' IS DISTINCT FROM operation_context
       OR (SELECT count(*) FROM jsonb_object_keys(receipt.detail_json)) <> 7
       OR jsonb_typeof(receipt.detail_json->'priorRow') IS DISTINCT FROM 'object'
       OR (CASE WHEN jsonb_typeof(receipt.detail_json->'priorRow') = 'object' THEN
            (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(receipt.detail_json->'priorRow') k)
            IS DISTINCT FROM ARRAY['account_lifecycle_version','account_status','account_status_changed_at',
              'account_status_changed_by','account_status_reason','company_id','created_at','display_name',
              'email','id','password_hash','role','session_invalid_before','system_role_enabled','updated_at']::text[]
          ELSE true END)
       OR receipt.detail_json->'priorRow'->>'id' IS DISTINCT FROM target_id
       OR receipt.detail_json->'priorRow'->>'company_id' IS DISTINCT FROM target_company
       OR receipt.detail_json->'priorRow'->'password_hash' IS DISTINCT FROM 'null'::jsonb
       OR receipt.detail_json->>'priorRowSha256' IS DISTINCT FROM
          encode(pg_catalog.sha256(convert_to((receipt.detail_json->'priorRow')::text, 'UTF8')), 'hex')
       OR prior_row IS NOT NULL THEN
      RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_RECEIPT_CONFLICT' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('status','REPLAYED','auditId',audit_id,
      'priorRowSha256',receipt.detail_json->>'priorRowSha256');
  END IF;
  IF prior_row IS NULL THEN
    RETURN jsonb_build_object('status','ABSENT','auditId',audit_id,'priorRowSha256',NULL);
  END IF;
  IF prior_row->>'company_id' IS DISTINCT FROM target_company THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_COMPANY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF prior_row->'password_hash' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_CREDENTIAL_PRESENT' USING ERRCODE = '23514';
  END IF;

  -- Fail closed on cross-schema FK metadata, without reading another core.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint f
    JOIN pg_catalog.pg_class c ON c.oid = f.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE f.contype = 'f' AND f.confrelid = 'ai_pdm_core.users'::regclass
      AND (n.nspname <> 'ai_pdm_core' OR NOT f.convalidated)
  ) THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_FK_BOUNDARY_UNKNOWN' USING ERRCODE = '23514';
  END IF;
  -- Local relation locks prevent concurrent non-FK references as well as FK writes.
  -- All stored relations must be ordinary/partitioned tables owned by this lane.
  SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relforcerowsecurity)
                   ORDER BY c.oid) INTO inventory_before
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ai_pdm_core' AND c.relkind IN ('r','p','f','m');
  FOR relation IN
    SELECT c.oid,c.relname,c.relkind,c.relowner,c.relforcerowsecurity
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='ai_pdm_core' AND c.relkind IN ('r','p','f','m')
    ORDER BY c.relname
  LOOP
    IF relation.relkind NOT IN ('r','p')
       OR relation.relowner <> 'jenfu_ai_pdm_migrator'::regrole
       OR relation.relforcerowsecurity THEN
      RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_RELATION_UNKNOWN' USING ERRCODE = '23514';
    END IF;
    EXECUTE format('LOCK TABLE ai_pdm_core.%I IN SHARE ROW EXCLUSIVE MODE', relation.relname);
  END LOOP;

  FOR edge IN
    SELECT f.oid,f.conrelid,c.relname,f.conkey,f.confkey
    FROM pg_catalog.pg_constraint f JOIN pg_catalog.pg_class c ON c.oid=f.conrelid
    WHERE f.contype='f' AND f.confrelid='ai_pdm_core.users'::regclass
    ORDER BY f.oid
  LOOP
    SELECT string_agg(format('child.%I = profile.%I', ca.attname,pa.attname), ' AND ' ORDER BY k.ordinality)
      INTO join_predicate
    FROM unnest(edge.conkey,edge.confkey) WITH ORDINALITY k(child_key,parent_key,ordinality)
    JOIN pg_catalog.pg_attribute ca ON ca.attrelid=edge.conrelid AND ca.attnum=k.child_key
    JOIN pg_catalog.pg_attribute pa ON pa.attrelid='ai_pdm_core.users'::regclass AND pa.attnum=k.parent_key;
    IF join_predicate IS NULL THEN
      RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_FK_SHAPE_UNKNOWN' USING ERRCODE = '23514';
    END IF;
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM ai_pdm_core.%I child JOIN ai_pdm_core.users profile ON %s WHERE profile.id=$1)',
      edge.relname, join_predicate) INTO has_reference USING target_id;
    IF has_reference THEN
      RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_REFERENCED_FK' USING ERRCODE = '23514',
        DETAIL = format('own relation=%I constraint_oid=%s',edge.relname,edge.oid);
    END IF;
  END LOOP;

  FOR relation IN
    SELECT c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='ai_pdm_core' AND c.relkind IN ('r','p')
      -- Native 001 audit actor/detail are trace-only history, without a users FK.
      -- Keep every historical row; any future FK is still checked above.
      AND c.relname <> 'audit_logs'
    ORDER BY c.relname
  LOOP
    EXECUTE format($scan$
      SELECT EXISTS (
        SELECT 1 FROM ai_pdm_core.%I r
        WHERE %s (
          jsonb_path_exists(to_jsonb(r), '$.** ? (@.type() == "object").keyvalue() ? (@.key == $target)',
                            jsonb_build_object('target',$1),false)
          OR EXISTS (
            SELECT 1 FROM jsonb_path_query(to_jsonb(r),'$.** ? (@.type() == "string")') leaf(value)
            WHERE leaf.value #>> '{}' = $1
               OR CASE WHEN (leaf.value #>> '{}') IS JSON THEN
                    jsonb_path_exists((leaf.value #>> '{}')::jsonb,'$.** ? (@ == $target)',
                                      jsonb_build_object('target',$1),false)
                    OR jsonb_path_exists((leaf.value #>> '{}')::jsonb,'$.** ? (@.type() == "object").keyvalue() ? (@.key == $target)',
                                         jsonb_build_object('target',$1),false)
                  ELSE false END
          )
        )
      )
    $scan$, relation.relname, CASE WHEN relation.relname='users' THEN 'r.id <> $1 AND' ELSE '' END)
      INTO has_reference USING target_id;
    IF has_reference THEN
      RAISE EXCEPTION USING MESSAGE = CASE WHEN relation.relname='principal_identity_operations' THEN 'AIPDM_UNLINKED_CLEANUP_IMMUTABLE_RECEIPT_REFERENCE' ELSE 'AIPDM_UNLINKED_CLEANUP_UNCLASSIFIED_EXACT_VALUE' END, ERRCODE = '23514',
        DETAIL = format('own relation=%I',relation.relname);
    END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relforcerowsecurity)
                   ORDER BY c.oid) INTO inventory_after
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ai_pdm_core' AND c.relkind IN ('r','p','f','m');
  IF inventory_after IS DISTINCT FROM inventory_before THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_CATALOG_CHANGED' USING ERRCODE = '23514';
  END IF;

  -- The migration-installed guard freezes only this capability's recovery rows.
  -- No operation performs DDL or changes another historical audit record.
  DELETE FROM ai_pdm_core.users WHERE id=target_id AND company_id=target_company;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 THEN
    RAISE EXCEPTION 'AIPDM_UNLINKED_CLEANUP_DELETE_COUNT_INVALID' USING ERRCODE = '23514';
  END IF;
  -- Native JSONB preserves numeric/timestamp text without a JavaScript roundtrip.
  -- Credentials were rejected above; the complete original row is restorable.
  INSERT INTO ai_pdm_core.audit_logs
    (id,submission_id,actor_id,action,detail_json,company_id,scope_kind)
  VALUES (audit_id,NULL,NULL,audit_action,
    jsonb_build_object('contractVersion',receipt_contract,'targetProfileId',target_id,
      'migration','084_dev121_unlinked_legacy_profile_cleanup',
      'operationId',operation_id,'operationContext',operation_context,
      'priorRow',prior_row,
      'priorRowSha256',encode(pg_catalog.sha256(convert_to(prior_row::text,'UTF8')),'hex')),
    target_company,'tenant');
  prior_hash := encode(pg_catalog.sha256(convert_to(prior_row::text,'UTF8')),'hex');
  RETURN jsonb_build_object('status','DELETED','auditId',audit_id,'priorRowSha256',prior_hash);
END;
$cleanup$;
ALTER FUNCTION ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb)
  FROM PUBLIC,jenfu_ai_pdm_runtime;
