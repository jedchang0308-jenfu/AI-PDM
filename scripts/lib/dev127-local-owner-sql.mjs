import { createHash } from 'node:crypto'
import { canonicalize } from './dev012-production-migration-runner.mjs'

export const LOCAL_ALIGNMENT_VERSION = 'ai-pdm-local-dev127-owner-alignment-v1'
export const LOCAL_ALIGNMENT_NAME = 'dev127_local_owner_alignment'
export const MIGRATION_VERSION = 'ai-pdm-096'
export const MIGRATION_NAME = 'dev127_platform_super_admin_consumer'
export const MIGRATION_SOURCE_SHA = 'c5a064cffc6c5f9abef085e8ed14ff11ab11c2562ccaae41f19021e49f9bf9b1'
export const MIGRATION_APPLIED_SHA = '36d53700ba87ea6aa278ff227aef33f1f203942b491f0d01e4af5de8b6087ffa'
export const MIGRATOR = 'jenfu_ai_pdm_migrator'
export const TABLES = Object.freeze(['schema_migrations','role_catalog_publications','role_catalog_entries',
  'active_role_catalog','role_policy_commands','role_policy_drafts','role_policy_role_identities',
  'principal_accounts','principal_session_records','users'])
export const FUNCTIONS = Object.freeze(['ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text)',
  'ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,character,text)',
  'ai_pdm_core.dev123_canonical_json_v1(jsonb)','ai_pdm_core.dev123_json_sha256_v1(jsonb)'])
const CONTRACTS = ['orgmaster_contract.lock_ai_pdm_role_policy_authority_v2()',
  'orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text)',
  'platform_contract.read_principal_auth_state_v3(text)']
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalize(value)).digest('hex')
export const fail = code => { throw Object.assign(new Error(`DEV127_LOCAL_${code}`), {code:`DEV127_LOCAL_${code}`}) }
const same = (a,b) => canonicalize(a) === canonicalize(b)

export async function inspectLocalOwnerDatabase(database, target) {
  const {rows:[connection]} = await database.query(`SELECT current_database() AS database,session_user,current_user,
    host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer/10000 AS major,
    pg_catalog.shobj_description(d.oid,'pg_database') AS marker,
    r.rolcanlogin,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
    pg_has_role($1,d.datdba,'MEMBER') AS runtime_owner,
    pg_has_role($1,'jenfu_ai_pdm_migrator','MEMBER') AS runtime_migrator,
    pg_has_role($1,'jenfu_ai_pdm_runtime','MEMBER') AS runtime_member,
    has_database_privilege($1,current_database(),'CREATE') AS runtime_database_create,
    EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      AND has_schema_privilege($1,n.oid,'CREATE')) AS runtime_schema_create,
    EXISTS(SELECT 1 FROM pg_roles unsafe WHERE pg_has_role($1,unsafe.oid,'MEMBER') AND
      (unsafe.rolsuper OR unsafe.rolcreaterole OR unsafe.rolcreatedb OR unsafe.rolreplication OR unsafe.rolbypassrls
       OR unsafe.rolname ~* '(owner|migrator)')) AS runtime_unsafe,
    (SELECT rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
      FROM pg_roles WHERE rolname='jenfu_ai_pdm_migrator') AS migrator_unsafe
    FROM pg_database d JOIN pg_roles r ON r.rolname=$1 WHERE d.datname=current_database()`,[target.runtimeUser])
  if (!connection || typeof target.host!=='string' || !target.host || connection.database!==target.database || connection.host!==target.host || connection.port!==target.port ||
      connection.major!==18 || connection.session_user!=='postgres' || connection.current_user!=='postgres' ||
      connection.rolcanlogin!==true || connection.runtime_member!==true ||
      ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','runtime_owner','runtime_migrator',
        'runtime_database_create','runtime_schema_create','runtime_unsafe','migrator_unsafe'].some(key=>connection[key]!==false)) {
    // The closed CLI prints only the code. CI may inspect this explicit
    // allowlist to diagnose transport/role facts, never connection options.
    const safe={}
    for(const key of ['database','host','port','major','session_user','current_user','rolcanlogin','runtime_member','rolsuper',
      'rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','runtime_owner','runtime_migrator',
      'runtime_database_create','runtime_schema_create','runtime_unsafe','migrator_unsafe']) safe[key]=connection?.[key]??null
    safe.markerSha256=connection?.marker==null?null:hash(String(connection.marker))
    throw Object.assign(new Error('DEV127_LOCAL_DATABASE_BOUNDARY_INVALID'),{code:'DEV127_LOCAL_DATABASE_BOUNDARY_INVALID',boundary:safe})
  }
  const schemas = (await database.query(`SELECT n.oid,n.nspname AS name,pg_get_userbyid(n.nspowner) AS owner,
    coalesce(n.nspacl::text,'') AS acl FROM pg_namespace n
    WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname`,[['ai_pdm_core','ai_pdm_contract']])).rows
  const relations = (await database.query(`SELECT c.oid,n.nspname||'.'||c.relname AS name,c.relkind,
    pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
    CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,true) ELSE NULL END AS definition,
    (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',a.atttypid::integer,'modifier',a.atttypmod,
      'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid,true)) ORDER BY k.conname)
      FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
    (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid) AS indexes,
    (SELECT jsonb_agg(pg_get_triggerdef(t.oid,true) ORDER BY t.tgname) FROM pg_trigger t
      WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname||'.'||c.relname=ANY($1::text[]) ORDER BY n.nspname,c.relname`,
  [[...TABLES.map(name=>'ai_pdm_core.'+name),'ai_pdm_contract.v_role_policy_publications_v1']])).rows
  const functions = (await database.query(`SELECT p.oid,p.oid::regprocedure::text AS signature,
    pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p WHERE p.oid=ANY(ARRAY(SELECT to_regprocedure(s)::oid FROM unnest($1::text[]) s)) ORDER BY p.oid::regprocedure::text`,[FUNCTIONS])).rows
  if (schemas.length!==2 || relations.length!==TABLES.length+1 || functions.length!==FUNCTIONS.length ||
      [...schemas,...relations,...functions].some(row=>!['postgres',MIGRATOR].includes(row.owner))) fail('INVENTORY_SCOPE_INVALID')
  const ledgerColumns=relations.find(row=>row.name==='ai_pdm_core.schema_migrations')?.columns
  if (!Array.isArray(ledgerColumns) || ledgerColumns.find(column=>column.name==='name')?.type!==25 ||
      ledgerColumns.find(column=>column.name==='source_revision')?.type!==25) fail('LEDGER_SHAPE_INVALID')
  const contracts = (await database.query(`SELECT signature,to_regprocedure(signature)::oid AS oid,
    CASE WHEN to_regprocedure(signature) IS NULL THEN false ELSE
      has_function_privilege('jenfu_ai_pdm_migrator',to_regprocedure(signature),'EXECUTE') END AS executable
    FROM unnest($1::text[]) signature ORDER BY signature`,[CONTRACTS])).rows
  const usage = (await database.query(`SELECT name,CASE WHEN to_regnamespace(name) IS NULL THEN false ELSE
    has_schema_privilege('jenfu_ai_pdm_migrator',name,'USAGE') END AS usable
    FROM unnest(ARRAY['orgmaster_contract','platform_contract']) name ORDER BY name`)).rows
  const ledger = (await database.query(`SELECT version,name,btrim(checksum_sha256) AS checksum,source_revision,applied_at::text
    FROM ai_pdm_core.schema_migrations ORDER BY applied_at,version`)).rows
  if (!ledger.length || ledger.length>256 || new Set(ledger.map(row=>row.version)).size!==ledger.length ||
      ledger.some(row=>!/^[a-f0-9]{64}$/u.test(row.checksum??''))) fail('LEDGER_INVALID')
  return {connection,schemas,relations,functions,contracts,usage,ledger}
}

export function buildLocalInstallPlan(binding, inventory, alignmentSql, migrationSql) {
  if (hash(migrationSql)!==MIGRATION_APPLIED_SHA || hash(binding.migrationSource)!==MIGRATION_SOURCE_SHA) fail('MIGRATION_SOURCE_INVALID')
  const installed=inventory.ledger.filter(row=>[LOCAL_ALIGNMENT_VERSION,MIGRATION_VERSION].includes(row.version))
  if (installed.length && (installed.length!==2 || !installed.some(row=>row.version===MIGRATION_VERSION && row.name===MIGRATION_NAME && row.checksum===MIGRATION_APPLIED_SHA) ||
      !installed.some(row=>row.version===LOCAL_ALIGNMENT_VERSION && new RegExp(`^${LOCAL_ALIGNMENT_NAME}_[a-f0-9]{64}$`,'u').test(row.name) &&
        row.checksum===hash(alignmentSql)))) fail('INSTALLED_LEDGER_CONFLICT')
  const {migrationSource,...publicBinding}=binding
  const core={schemaVersion:'ai-pdm.dev127.local-install-plan.v1',binding:publicBinding,inventory,
    alignmentSha256:hash(alignmentSql),migrationAppliedSha256:MIGRATION_APPLIED_SHA,state:installed.length?'INSTALLED':'PLANNED'}
  return {...core,planSha256:hash(core)}
}

export function assertLocalInstallPlan(value) {
  if (!value || value.schemaVersion!=='ai-pdm.dev127.local-install-plan.v1') fail('PLAN_INVALID')
  const {planSha256,...core}=value
  if (planSha256!==hash(core)) fail('PLAN_INVALID')
  return value
}
export function assertLocalOwnerContracts(inventory) {
  if (inventory.contracts.length!==3 || inventory.contracts.some(row=>!row.oid || row.executable!==true) ||
      inventory.usage.some(row=>row.usable!==true)) fail('CONTRACT_OWNER_PREREQUISITE_MISSING')
}
export async function assertLocalDev127Installation(database) {
  const {rows}=await database.query(`SELECT
    has_schema_privilege('jenfu_orgmaster_migrator','ai_pdm_contract','USAGE') AS org_namespace,
    has_table_privilege('jenfu_orgmaster_migrator','ai_pdm_contract.v_application_role_catalog_v3','SELECT') AS org_catalog,
    has_table_privilege('jenfu_orgmaster_migrator','ai_pdm_contract.v_role_policy_publications_v1','SELECT') AS org_history,
    has_table_privilege('jenfu_ai_pdm_runtime','ai_pdm_contract.v_application_role_catalog_v3','SELECT') AS runtime_catalog,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_lock_apply_v2(uuid,uuid,text,text)','EXECUTE') AS runtime_lock,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_apply_v2(uuid,text,text,text,text,uuid,integer,text,character,text)','EXECUTE') AS runtime_apply,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text)','EXECUTE') AS legacy_lock,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,character,text)','EXECUTE') AS legacy_apply,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_upgrade_v2(uuid,text,character,jsonb)','EXECUTE') AS runtime_owner_upgrade,
    NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='ai_pdm_core' AND p.proname IN ('dev127_policy_definition_v2','dev127_assert_candidate_v2',
        'role_policy_lock_apply_v2','role_policy_apply_v2','role_policy_upgrade_v2') AND pg_get_userbyid(p.proowner)<>'jenfu_ai_pdm_migrator') AS function_owners,
    (SELECT pg_get_userbyid(c.relowner)='jenfu_ai_pdm_migrator' FROM pg_class c
      WHERE c.oid='ai_pdm_contract.v_application_role_catalog_v3'::regclass) AS view_owner`)
  const row=rows[0]
  if(rows.length!==1 || ['org_namespace','org_catalog','org_history','runtime_catalog','runtime_lock','runtime_apply','function_owners','view_owner']
    .some(key=>row[key]!==true) || ['legacy_lock','legacy_apply','runtime_owner_upgrade'].some(key=>row[key]!==false))fail('INSTALL_POSTCONDITIONS_INVALID')
}
export async function readLocalInstallReceipt(database, plan) {
  const all=(await database.query(`SELECT version,name,btrim(checksum_sha256) AS checksum,source_revision,applied_at::text
    FROM ai_pdm_core.schema_migrations ORDER BY applied_at,version`)).rows
  if (all.length>256 || new Set(all.map(row=>row.version)).size!==all.length) fail('INSTALL_RECEIPT_CONFLICT')
  const rows=all.filter(row=>[LOCAL_ALIGNMENT_VERSION,MIGRATION_VERSION].includes(row.version))
  if (!rows.length) return null
  const baseline=plan.inventory.ledger.filter(row=>![LOCAL_ALIGNMENT_VERSION,MIGRATION_VERSION].includes(row.version))
  if (baseline.some(prior=>!same(all.find(row=>row.version===prior.version),prior))) fail('INSTALL_RECEIPT_CONFLICT')
  if (rows.length!==2 || !rows.some(row=>row.version===LOCAL_ALIGNMENT_VERSION && row.name===`${LOCAL_ALIGNMENT_NAME}_${plan.planSha256}` &&
      row.checksum===plan.alignmentSha256 && row.source_revision===plan.binding.source.revision) ||
      !rows.some(row=>row.version===MIGRATION_VERSION && row.name===MIGRATION_NAME && row.checksum===MIGRATION_APPLIED_SHA &&
        row.source_revision===plan.binding.source.revision)) fail('INSTALL_RECEIPT_CONFLICT')
  return {state:'INSTALLED',planSha256:plan.planSha256,ledger:rows}
}

/** Closed SQL only. The wrapper owns and verifies the operator session; this
 * component neither creates a connection nor accepts arbitrary SQL from a CLI. */
export async function installLocalDev127({database,plan,alignmentSql,migrationSql,revalidate,readAfterUnknown}) {
  assertLocalInstallPlan(plan)
  if (hash(alignmentSql)!==plan.alignmentSha256 || hash(migrationSql)!==MIGRATION_APPLIED_SHA) fail('SOURCE_CHANGED')
  await database.query('BEGIN ISOLATION LEVEL READ COMMITTED')
  let commitStarted=false
  try {
    await database.query("SELECT pg_advisory_xact_lock(hashtext('ai-pdm-dev127-local-owner'))")
    const prior=await readLocalInstallReceipt(database,plan)
    if (prior) {await database.query('COMMIT');return {...prior,disposition:'ORIGINAL_INSTALL_RECEIPT'}}
    const current=await revalidate(database)
    if (!same(current,plan)) fail('PLAN_DRIFT')
    assertLocalOwnerContracts(current.inventory)
    await database.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s'")
    await database.query(alignmentSql)
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    await database.query(migrationSql)
    await assertLocalDev127Installation(database)
    await database.query(`INSERT INTO ai_pdm_core.schema_migrations(version,name,checksum_sha256,source_revision)
      VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,[LOCAL_ALIGNMENT_VERSION,`${LOCAL_ALIGNMENT_NAME}_${plan.planSha256}`,plan.alignmentSha256,plan.binding.source.revision,
      MIGRATION_VERSION,MIGRATION_NAME,MIGRATION_APPLIED_SHA,plan.binding.source.revision])
    commitStarted=true
    await database.query('COMMIT')
    return {state:'INSTALLED',planSha256:plan.planSha256,disposition:'ATOMIC_LOCAL_ALIGNMENT_AND_096'}
  } catch(error) {
    await database.query('ROLLBACK').catch(()=>{})
    if (!commitStarted || ['40001','22023','23505','42501'].includes(error?.code)) throw error
    let receipt
    try{receipt=await readAfterUnknown(plan)}catch{fail('INSTALL_OUTCOME_UNKNOWN')}
    if (receipt) return {...receipt,disposition:'UNKNOWN_COMMIT_CONFIRMED_BY_ORIGINAL_LEDGER'}
    fail('INSTALL_OUTCOME_UNKNOWN')
  }
}
