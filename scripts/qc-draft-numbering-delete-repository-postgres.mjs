#!/usr/bin/env node

// Real repository integration against a task-owned disposable PostgreSQL cluster.
// Historical migrations are applied to the temporary public schema, then moved
// into the isolated ai_pdm_core namespace before runtime repositories connect.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pgDir = path.join(root, 'db', 'postgres')
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-draft-delete-repo-pg-'))
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const checks = []
const { Client } = pg
let port
let started = false
let admin
let database

function native(name, args) {
  const executable = path.join(bin, process.platform === 'win32' ? `${name}.exe` : name)
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', windowsHide: true,
    timeout: 45_000, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' })
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`)
  return String(result.stdout ?? '').trim()
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer(); server.unref(); server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address(); const value = typeof address === 'object' && address ? address.port : null
      server.close(error => error ? reject(error) : value ? resolve(value) : reject(new Error('PORT_ALLOCATION_FAILED')))
    })
  })
}

async function released(value) {
  return await new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: value }); socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

function mark(name) { checks.push(name); process.stdout.write(`PASS ${name}\n`) }

const migrations = [
  '001_initial_schema.sql', '010_transfer_package_phase3a0.sql', '012_number_state_flow_phase1a.sql',
  '017_number_state_flow_phase1d.sql', '022_unified_drawing_workbench.sql',
  '026_drawing_revision_lifecycle_authority.sql', '029_pdm_file_ownership_and_3d_reuse.sql',
  '030_unified_drawing_aggregate.sql', '033_drawing_recognition.sql',
  '039_allow_recycled_candidate_drawing_codes.sql', '042_status_data_rebuild.sql',
  '043_inline_relation_matrix.sql', '047_remove_bom_module.sql',
  '048_solidworks_credential_ui_activation.sql', '049_retire_standalone_manufacturing_impact.sql',
  '050_drawing_recognition_part_owner_invariant.sql', '051_part_structure_type_authority.sql',
  '052_retired_workbench_residue_cleanup.sql',
]

try {
  assert.ok(fs.existsSync(path.join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb')), `PostgreSQL initdb missing in ${bin}`)
  assert.ok(fs.existsSync(path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')), `PostgreSQL pg_ctl missing in ${bin}`)
  for (const migration of migrations) assert.ok(fs.existsSync(path.join(pgDir, migration)), `required migration missing: ${migration}`)
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: { project: root,
    purpose: 'Real async numbering and transfer repository delete/reuse integration checks', port,
    owningProcessTree: `qc-draft-numbering-delete-repository-postgres.mjs -> ${path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')} -D ${cluster}`,
    cleanupCondition: 'close database clients, stop this exact cluster, verify loopback port released, remove task TEMP root',
    mutationScope: taskRoot, productionWrites: false, schema: 'actual repository migrations in disposable cluster' } })}\n`)
  native('initdb', ['-D', cluster, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale', '--no-sync'])
  native('pg_ctl', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1 -c max_connections=16`, '-w', 'start'])
  started = true
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`
  admin = new Client({ connectionString, application_name: 'aipdm-draft-delete-repository-admin' })
  await admin.connect()
  await admin.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;`)
  for (const migration of migrations) {
    try { await admin.query(fs.readFileSync(path.join(pgDir, migration), 'utf8')) }
    catch (error) { throw new Error(`REAL_MIGRATION_FAILED ${migration}: ${error.message}`, { cause: error }) }
  }

  // Reproduce the namespace move in DEV-010 §62 for this disposable fresh DB.
  await admin.query(`DO $move$
    DECLARE relation record;
    BEGIN
      FOR relation IN SELECT c.relname,c.relkind FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_catalog.pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') AND d.objid IS NULL
        ORDER BY CASE c.relkind WHEN 'r' THEN 1 WHEN 'p' THEN 1 WHEN 'S' THEN 2 ELSE 3 END,c.relname
      LOOP
        IF to_regclass(format('ai_pdm_core.%I',relation.relname)) IS NOT NULL THEN
          RAISE EXCEPTION 'TEST_SCHEMA_COLLISION: %', relation.relname;
        END IF;
        EXECUTE format('ALTER %s public.%I SET SCHEMA ai_pdm_core',
          CASE WHEN relation.relkind='S' THEN 'SEQUENCE' WHEN relation.relkind='v' THEN 'VIEW'
               WHEN relation.relkind='m' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, relation.relname);
        EXECUTE format('ALTER %s ai_pdm_core.%I OWNER TO jenfu_ai_pdm_migrator',
          CASE WHEN relation.relkind='S' THEN 'SEQUENCE' WHEN relation.relkind='v' THEN 'VIEW'
               WHEN relation.relkind='m' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, relation.relname);
      END LOOP;
      FOR relation IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        LEFT JOIN pg_catalog.pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'
        WHERE n.nspname='public' AND d.objid IS NULL
      LOOP
        EXECUTE format('ALTER FUNCTION %s SET SCHEMA ai_pdm_core',relation.signature);
        EXECUTE format('ALTER FUNCTION %s OWNER TO jenfu_ai_pdm_migrator',
          replace(relation.signature::text,'public.','ai_pdm_core.'));
      END LOOP;
    END $move$`)
  await admin.query(fs.readFileSync(path.join(pgDir, '065_dev121_principal_security_subject.sql'), 'utf8'))
  await admin.query(fs.readFileSync(path.join(pgDir, '079_dev122_canonical_review_lifecycle.sql'), 'utf8'))
  await admin.query(fs.readFileSync(path.join(pgDir, '082_dev122_openswx_auxiliary_jobs.sql'), 'utf8'))
  await admin.query(fs.readFileSync(path.join(pgDir, '102_draft_numbering_delete_terminal_openswx.sql'), 'utf8'))
  const { createAsyncDatabaseClient } = await import(pathToFileURL(path.join(root, 'src/lib/db-async-provider.ts')).href)
  const { AsyncNumberingRepository, readV3OccupiedRootCodes } = await import(pathToFileURL(path.join(root, 'src/lib/repositories/numbering-async-repository.ts')).href)
  const { AsyncTransferPackageRepository } = await import(pathToFileURL(path.join(root, 'src/lib/repositories/transfer-package-async-repository.ts')).href)
  const { deleteVerifiedDraftNumberingBundleInClient } = await import(pathToFileURL(path.join(root, 'src/lib/numbering-async.ts')).href)
  database = createAsyncDatabaseClient({ kind: 'postgres', connectionString, searchPath: 'ai_pdm_core', maxConnections: 5,
    connectionTimeoutMillis: 5000, statementTimeoutMillis: 10000, queryTimeoutMillis: 10000,
    applicationName: 'aipdm-draft-delete-repository-qc' })
  await admin.query(`INSERT INTO ai_pdm_core.companies(id,company_code,display_name) VALUES ('qc-company','QC','QC');
    INSERT INTO ai_pdm_core.users(id,display_name,role,company_id) VALUES ('qc-owner','QC Owner','Engineer','qc-company');`)
  const owner = { userId: 'qc-owner', companyId: 'qc-company', role: 'Engineer' }
  const transferOwner = { ...owner, principalId: 'qc-principal', principalDecision: {
    allowed: true, permissionCode: 'transfer.package.update', principalId: 'qc-principal', roleCode: 'rd_manager'
  } }
  const numbering = new AsyncNumberingRepository(database)
  const seeded = { rootId: 'qc-root', rootCode: 'A0062', partId: 'qc-part', partCode: 'A0062-P01',
    drawingId: 'qc-drawing-number', drawingCode: 'A0062-M01' }
  await admin.query(`INSERT INTO ai_pdm_core.part_roots
      (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by)
    VALUES ($1,$2,$3,'QC bundle','manufactured','Draft','numbering-rule-v3-alpha-root',$4)`,
  [seeded.rootId, owner.companyId, seeded.rootCode, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.part_numbers
      (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,record_status,rule_version_id,created_by)
    VALUES ($1,$2,$3,$4,1,'01','QC part','manufactured','Draft','numbering-rule-v3-alpha-root',$5)`,
  [seeded.partId, owner.companyId, seeded.rootId, seeded.partCode, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_numbers
      (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,rule_version_id,created_by)
    VALUES ($1,$2,$3,$4,'M','QC manufacturing drawing',1,1,'Draft','numbering-rule-v3-alpha-root',$5)`,
  [seeded.drawingId, owner.companyId, seeded.rootId, seeded.drawingCode, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.part_roots
      (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by)
    VALUES ('qc-blocked-root',$1,'A0063','QC blocked bundle','manufactured','Draft','numbering-rule-v3-alpha-root',$2)`,
  [owner.companyId, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.part_numbers
      (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,record_status,rule_version_id,created_by)
    VALUES ('qc-blocked-part',$1,'qc-blocked-root','A0063-P01',1,'01','QC blocked part','manufactured','Draft','numbering-rule-v3-alpha-root',$2)`,
  [owner.companyId, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_numbers
      (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,rule_version_id,created_by)
    VALUES ('qc-blocked-drawing',$1,'qc-blocked-root','A0063-M01','M','QC blocked drawing',1,1,'Draft','numbering-rule-v3-alpha-root',$2)`,
  [owner.companyId, owner.userId])
  const rootCode = seeded.rootCode
  const transfer = new AsyncTransferPackageRepository(database)
  const packageRow = await transfer.createDraft({ actor: owner, idempotencyKey: 'qc-delete-draft-transfer', title: 'QC draft transfer',
    caseType: 'development_case', caseReason: 'repository integration fixture', sourceReferenceStatus: 'not_available',
    sourceReference: null, sourceReferenceReason: 'isolated QC fixture', sourceItem: {
      entityType: 'drawing_number', entityId: seeded.drawingId, entityCode: seeded.drawingCode,
      displayLabel: seeded.drawingCode, rootCode, recordStatus: 'Draft'
    } })
  assert.equal(packageRow.items.length, 1)
  let basis = await numbering.readDraftNumberingDeleteBasis(owner.companyId, rootCode)
  assert.ok(basis, 'seeded root should be readable')
  assert.equal(basis.transfers.length, 1, 'draft transfer reference should be in exact delete basis')

  await admin.query(`INSERT INTO ai_pdm_core.relation_approved_change_snapshots
    (id,company_id,root_id,before_tree,after_tree,content_hash,formalized_at)
    VALUES ('qc-formal-relation','qc-company','qc-blocked-root','{}'::jsonb,'{}'::jsonb,'qc-formal-hash',now())`)
  const blockedBasis = await numbering.readDraftNumberingDeleteBasis(owner.companyId, 'A0063')
  assert.ok(blockedBasis)
  const policy = await import(pathToFileURL(path.join(root, 'src/lib/draft-numbering-delete-policy.ts')).href)
  const verified = { profile: { companyId: owner.companyId, pdmUserId: owner.userId },
    session: { principalId: 'qc-principal', profileVersion: 1 } }
  await assert.rejects(database.transaction(async tx => deleteVerifiedDraftNumberingBundleInClient(tx, {
    companyId: owner.companyId, rootCode: 'A0063',
    fingerprint: policy.draftNumberingDeleteFingerprint(blockedBasis, { userId: owner.userId, systemAdmin: false }),
    actor: { userId: owner.userId, systemAdmin: false }, transferActor: transferOwner, verified
  })), error => error.message === 'NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES')
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.transfer_package_items WHERE package_id=$1', [packageRow.id])).rows[0].n, 1,
    'formal-reference denial must retain its Draft transfer item')
  assert.equal((await admin.query('SELECT row_version FROM ai_pdm_core.transfer_packages WHERE id=$1', [packageRow.id])).rows[0].row_version, 1,
    'formal-reference denial must not change package version')
  mark('real approved relation history blocks deletion and preserves transfer scope')

  basis = await numbering.readDraftNumberingDeleteBasis(owner.companyId, rootCode)
  await admin.query(`CREATE FUNCTION ai_pdm_core.qc_fail_root_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'QC_FORCED_ROOT_DELETE_FAILURE'; END $$;
    CREATE TRIGGER qc_fail_root_delete BEFORE DELETE ON ai_pdm_core.part_roots
    FOR EACH ROW WHEN (OLD.id = '${seeded.rootId}') EXECUTE FUNCTION ai_pdm_core.qc_fail_root_delete()`)
  const fingerprint = policy.draftNumberingDeleteFingerprint(basis, { userId: owner.userId, systemAdmin: false })
  await assert.rejects(database.transaction(async tx => deleteVerifiedDraftNumberingBundleInClient(tx, {
    companyId: owner.companyId, rootCode, fingerprint, actor: { userId: owner.userId, systemAdmin: false }, transferActor: transferOwner, verified
  }), { isolationLevel: 'serializable' }), error => String(error.message).includes('QC_FORCED_ROOT_DELETE_FAILURE'))
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.transfer_package_items WHERE package_id=$1', [packageRow.id])).rows[0].n, 1,
    'root delete failure must roll back transfer item removal')
  assert.equal((await admin.query('SELECT row_version FROM ai_pdm_core.transfer_packages WHERE id=$1', [packageRow.id])).rows[0].row_version, 1,
    'root delete failure must roll back transfer package version')
  await admin.query('DROP TRIGGER qc_fail_root_delete ON ai_pdm_core.part_roots; DROP FUNCTION ai_pdm_core.qc_fail_root_delete()')
  mark('late root-delete failure rolls back transfer removal and package version')

  basis = await numbering.readDraftNumberingDeleteBasis(owner.companyId, rootCode)
  const successFingerprint = policy.draftNumberingDeleteFingerprint(basis, { userId: owner.userId, systemAdmin: false })
  const deleted = await database.transaction(tx => deleteVerifiedDraftNumberingBundleInClient(tx, {
    companyId: owner.companyId, rootCode, fingerprint: successFingerprint,
    actor: { userId: owner.userId, systemAdmin: false }, transferActor: transferOwner, verified
  }), { isolationLevel: 'serializable' })
  assert.equal(deleted.rootCode, rootCode)
  assert.equal(deleted.removedTransferReferences, 1)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.part_roots WHERE id=$1', [seeded.rootId])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.part_numbers WHERE part_root_id=$1', [seeded.rootId])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawing_numbers WHERE part_root_id=$1', [seeded.rootId])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.transfer_package_items WHERE package_id=$1', [packageRow.id])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT row_version FROM ai_pdm_core.transfer_packages WHERE id=$1', [packageRow.id])).rows[0].row_version, 2)
  const occupied = await readV3OccupiedRootCodes(database, owner.companyId)
  assert.equal(occupied.includes(rootCode), false, `deleted root ${rootCode} must be released by the actual shared occupied-code reader`)
  mark(`real repository deletes root/part/drawing and Draft transfer; ${rootCode} is reusable by readV3OccupiedRootCodes`)

  process.stdout.write(`${JSON.stringify({ status: 'PASS', checks })}\n`)
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
} finally {
  try { await database?.close?.() } catch {}
  try { await admin?.end() } catch {}
  if (started) {
    try { native('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']) } catch (error) { process.stderr.write(`cluster stop failed: ${error.message}\n`) }
    if (port && !(await released(port))) { process.stderr.write(`port ${port} remains occupied after cluster stop\n`); process.exitCode = 1 }
  }
  if (!started || (port && await released(port))) {
    const resolvedTemp = path.resolve(os.tmpdir())
    const resolvedTask = path.resolve(taskRoot)
    const relative = path.relative(resolvedTemp, resolvedTask)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(resolvedTask, { recursive: true, force: true })
    else { process.stderr.write('task temp root escaped OS temp; retained for inspection\n'); process.exitCode = 1 }
  }
}
