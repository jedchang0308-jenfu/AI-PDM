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
  '039_allow_recycled_candidate_drawing_codes.sql', '041_part_attachment_reuse_snapshot.sql', '042_status_data_rebuild.sql',
  '043_inline_relation_matrix.sql', '046_part_preview_settings.sql', '047_remove_bom_module.sql',
  '048_solidworks_credential_ui_activation.sql', '049_retire_standalone_manufacturing_impact.sql',
  '050_drawing_recognition_part_owner_invariant.sql', '051_part_structure_type_authority.sql',
  '052_retired_workbench_residue_cleanup.sql', '053_drawing_recognition_amendment_lineage.sql',
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
  await admin.query('SET search_path = ai_pdm_core, public')
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
  await admin.query(`INSERT INTO ai_pdm_core.drawings
      (id,company_id,drawing_number,lifecycle_state,formal_drawing_number_id,part_root_id,purpose_code,
       purpose_description,sequence_no,is_primary_manufacturing,owner_id,rule_version_id,created_by)
    VALUES ('qc-canonical-drawing',$1,'A0062-M01','drawing_preparation',$2,$3,'M',
       'QC manufacturing drawing',1,1,$4,'numbering-rule-v3-alpha-root',$4)`,
  [owner.companyId, seeded.drawingId, seeded.rootId, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,row_version,created_by,updated_by)
    VALUES ('qc-revision',$1,'qc-canonical-drawing','0.1','preparing','{}'::jsonb,1,$2,$2)`, [owner.companyId, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.pdm_workbench_aggregates
      (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version)
    VALUES ('qc-drawing-aggregate',$1,'drawing','qc-canonical-drawing',1,1)`, [owner.companyId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_rd_branches
      (id,company_id,drawing_id,status,row_version)
    VALUES ('qc-drawing-branch',$1,'qc-canonical-drawing','open',1)`, [owner.companyId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_revision_claims
      (id,company_id,drawing_id,branch_id,target_major,target_minor,target_label,claim_state)
    VALUES ('qc-revision-claim',$1,'qc-canonical-drawing','qc-drawing-branch',0,1,'0.1','work')`, [owner.companyId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_revision_works
      (id,company_id,drawing_id,branch_id,target_claim_id,owner_user_id,proposed_payload,base_hash,row_version)
    VALUES ('qc-revision-work',$1,'qc-canonical-drawing','qc-drawing-branch','qc-revision-claim',$2,'{}'::jsonb,'qc-base-hash',4)`,
  [owner.companyId, owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,row_version)
    VALUES ('qc-revision-state',$1,'drawing','qc-canonical-drawing','drawing_rd','qc-drawing-branch','qc-revision','qc-revision-work','owner',7)`,
  [owner.companyId])
  await admin.query(`INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
    VALUES ('qc-principal',$1,$2,'qc-employee','human_personal','active',1,1,true,'aal1')`,
  [owner.userId, owner.companyId])
  await admin.query(`INSERT INTO ai_pdm_core.file_assets
      (id,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,uploaded_by)
    VALUES ('qc-recognition-file','qc-drawing.slddrw','slddrw','application/octet-stream',128,$1,'drawing_revision','qc-revision',$2)`,
  ['a'.repeat(64), owner.userId])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_revision_files
      (id,company_id,drawing_revision_id,source_file_asset_id,role,role_source,display_name,sort_order,is_primary,created_by)
    VALUES ('qc-revision-file','qc-company','qc-revision','qc-recognition-file','drawing_2d','system','qc-drawing.slddrw',0,1,'qc-owner')`)
  await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,
       source_set_fingerprint,deduplication_key,status,session_purpose,attempt_count,locked_by,locked_at,heartbeat_at,
       row_version,created_by)
    VALUES ('qc-recognition-session',$1,'drawing_revision','qc-revision','qc-canonical-drawing:qc-revision',
       'qc-canonical-drawing','qc-revision',$2,'qc-recognition-dedup','queued','recognition',0,NULL,NULL,NULL,7,$3)`,
  [owner.companyId, 'b'.repeat(64), owner.userId])
  const openswxInitiator = JSON.stringify({ companyId: owner.companyId, principalId: 'qc-principal', pdmUserId: owner.userId,
    employeeId: 'qc-employee', identityIssuer: 'https://issuer.invalid', identitySubject: 'qc-subject',
    profileVersion: 1, accountLifecycleVersion: 1, authEpoch: 0,
    authenticatedAt: '2026-11-12T00:00:00.000Z', sessionIssuedAt: '2026-11-12T00:00:00.000Z' })
  await admin.query(`INSERT INTO ai_pdm_core.openswx_metadata_jobs
      (id,company_id,session_id,source_context_type,source_context_id,drawing_revision_id,source_set_fingerprint,
       reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,status,attempt_count,dispatch_state)
    VALUES ('qc-terminal-openswx','qc-company','qc-recognition-session','drawing_revision','qc-revision','qc-revision',
       $1,'30bd63845d3532cdecfdf2654e9cc0871229c45a','qc-principal','qc-owner',$2,$3,'failed',1,'terminal')`,
  ['c'.repeat(64), openswxInitiator, JSON.stringify([{ id: 'qc-recognition-file', fileAssetId: 'qc-recognition-file',
    sha256: 'a'.repeat(64), bytes: 128, extension: 'slddrw', storageGeneration: null, sourceRole: 'drawing_2d', sortOrder: 0 }])])
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
  assert.equal(basis.controlledReferences, 0, 'an exact owner-handled queued recognition session is cleanable, not controlled')
  assert.deepEqual(basis.recognitionSessions, [{ id: 'qc-recognition-session', rowVersion: 7, status: 'queued' }],
    'basis must capture the exact queued session identity and row version')
  assert.deepEqual(basis.auxiliaryJobs, [{ id: 'qc-terminal-openswx', status: 'failed', dispatchState: 'terminal' }],
    'the terminal OpenSWX job must be attached to the same draft revision')
  mark('exact current owner-handled queued recognition and terminal worker are cleanable')

  const policy = await import(pathToFileURL(path.join(root, 'src/lib/draft-numbering-delete-policy.ts')).href)
  const verified = { profile: { companyId: owner.companyId, pdmUserId: owner.userId },
    session: { principalId: 'qc-principal', profileVersion: 1 } }
  const ownerDeleteActor = { userId: owner.userId, systemAdmin: false }
  const deleteTransferActor = { ...transferOwner }
  async function assertRecognitionBlocked(label, prepare) {
    const rollbackMarker = `QC_RECOGNITION_NEGATIVE_${label}`
    await assert.rejects(database.transaction(async tx => {
      await prepare(tx)
      const invalidBasis = await new AsyncNumberingRepository(tx).readDraftNumberingDeleteBasis(owner.companyId, rootCode)
      assert.ok(invalidBasis)
      assert.ok(invalidBasis.controlledReferences > 0, `${label} must be treated as controlled reference`)
      assert.deepEqual(invalidBasis.recognitionSessions, [], `${label} must not enter the cleanup set`)
      const invalidFingerprint = policy.draftNumberingDeleteFingerprint(invalidBasis, ownerDeleteActor)
      await assert.rejects(deleteVerifiedDraftNumberingBundleInClient(tx, {
        companyId: owner.companyId, rootCode, fingerprint: invalidFingerprint, actor: ownerDeleteActor,
        transferActor: deleteTransferActor, verified
      }), error => error.message === 'NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES')
      throw new Error(rollbackMarker)
    }, { isolationLevel: 'serializable' }), error => error.message === rollbackMarker)
    const current = await admin.query(`SELECT status,attempt_count,locked_by,locked_at,heartbeat_at,row_version
      FROM ai_pdm_core.drawing_recognition_sessions WHERE id='qc-recognition-session'`)
    assert.deepEqual(current.rows[0], { status: 'queued', attempt_count: 0, locked_by: null,
      locked_at: null, heartbeat_at: null, row_version: 7 }, `${label} fixture transaction must roll back`)
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ai_pdm_core.openswx_metadata_jobs
      WHERE id='qc-terminal-openswx'`)).rows[0].n, 1, `${label} denial must retain terminal worker row`)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.transfer_package_items WHERE package_id=$1',
      [packageRow.id])).rows[0].n, 1, `${label} denial must retain Draft transfer scope`)
    mark(`${label} recognition state blocks deletion without side effects`)
  }
  await assertRecognitionBlocked('claimed queued session', tx => tx.execute(`UPDATE ai_pdm_core.drawing_recognition_sessions
    SET locked_by='qc-worker', locked_at=now(), heartbeat_at=now(), row_version=row_version+1
    WHERE id='qc-recognition-session' AND status='queued' AND attempt_count=0`))
  await assertRecognitionBlocked('extracting session', tx => tx.execute(`UPDATE ai_pdm_core.drawing_recognition_sessions
    SET status='extracting', attempt_count=1, locked_by='qc-worker', locked_at=now(), heartbeat_at=now(), row_version=row_version+1
    WHERE id='qc-recognition-session'`))
  await assertRecognitionBlocked('formally written recognition session', async tx => {
    await tx.execute(`UPDATE ai_pdm_core.drawing_recognition_sessions SET status='formalized', formalized_at=now(),
      formalized_by=:ownerId, row_version=row_version+1 WHERE id='qc-recognition-session'`, { ownerId: owner.userId })
    await tx.execute(`INSERT INTO ai_pdm_core.drawing_recognition_formalization_events
      (id,session_id,company_id,actor_id,idempotency_key,impact_fingerprint,target_fingerprints_json,
       applied_changes_json,exclusions_json,result_json)
      VALUES ('qc-formalization-event','qc-recognition-session',:companyId,:ownerId,'qc-formalization',
       :fingerprint,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb)`,
    { companyId: owner.companyId, ownerId: owner.userId, fingerprint: 'd'.repeat(64) })
  })

  await admin.query(`INSERT INTO ai_pdm_core.relation_approved_change_snapshots
    (id,company_id,root_id,before_tree,after_tree,content_hash,formalized_at)
    VALUES ('qc-formal-relation','qc-company','qc-blocked-root','{}'::jsonb,'{}'::jsonb,'qc-formal-hash',now())`)
  const blockedBasis = await numbering.readDraftNumberingDeleteBasis(owner.companyId, 'A0063')
  assert.ok(blockedBasis)
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
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawing_recognition_sessions WHERE id=$1', ['qc-recognition-session'])).rows[0].n, 0,
    'successful work cancellation must remove the exact queued recognition session')
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1', ['qc-terminal-openswx'])).rows[0].n, 0,
    'terminal OpenSWX job attached to the deleted draft revision must be cleaned')
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawing_revision_works WHERE id=$1', ['qc-revision-work'])).rows[0].n, 0,
    'exact owner-handled current revision work must be cancelled and removed')
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.canonical_workbench_states WHERE id=$1', ['qc-revision-state'])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawing_revision_claims WHERE id=$1', ['qc-revision-claim'])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawing_rd_branches WHERE id=$1', ['qc-drawing-branch'])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawing_revisions WHERE id=$1', ['qc-revision'])).rows[0].n, 0)
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ai_pdm_core.drawings WHERE id=$1', ['qc-canonical-drawing'])).rows[0].n, 0)
  assert.ok((await admin.query('SELECT deleted_at FROM ai_pdm_core.file_assets WHERE id=$1', ['qc-recognition-file'])).rows[0].deleted_at,
    'source file asset must be soft-deleted by scoped work cancellation')
  await admin.query(`INSERT INTO ai_pdm_core.part_roots
    (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by)
    VALUES ('qc-single-root','qc-company','A0064','Single-delete test','manufactured','Active','numbering-rule-v3-alpha-root','qc-owner');
    INSERT INTO ai_pdm_core.part_numbers
      (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,record_status,rule_version_id,created_by)
    VALUES
      ('qc-single-part','qc-company','qc-single-root','A0064-P01',1,'01','Target','manufactured','Draft','numbering-rule-v3-alpha-root','qc-owner'),
      ('qc-single-sibling','qc-company','qc-single-root','A0064-P02',2,'02','Retained','manufactured','Active','numbering-rule-v3-alpha-root','qc-owner');
    INSERT INTO ai_pdm_core.drawing_numbers
      (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,rule_version_id,created_by)
    VALUES ('qc-single-drawing','qc-company','qc-single-root','A0064-M01','M','Target drawing',1,1,'Draft','numbering-rule-v3-alpha-root','qc-owner');
    INSERT INTO ai_pdm_core.drawings
      (id,company_id,drawing_number,lifecycle_state,formal_drawing_number_id,part_root_id,purpose_code,purpose_description,
        sequence_no,is_primary_manufacturing,owner_id,rule_version_id,created_by)
    VALUES ('qc-single-canonical','qc-company','A0064-M01','drawing_preparation','qc-single-drawing','qc-single-root','M',
      'Target drawing',1,1,'qc-owner','numbering-rule-v3-alpha-root','qc-owner');
    INSERT INTO ai_pdm_core.drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by)
    VALUES ('qc-single-link','qc-single-drawing','qc-single-sibling','primary_manufacturing','qc-owner');`)
  const { canonicalNumberingSequenceKey } = await import(pathToFileURL(path.join(root, 'src/lib/numbering-sequence-utils.ts')).href)
  await admin.query(`INSERT INTO ai_pdm_core.numbering_sequences (sequence_key,company_id,next_value) VALUES ($1,$2,2)`,
    [canonicalNumberingSequenceKey(owner.companyId, 'drawing:A0064:M'), owner.companyId])
  const partTarget = { kind: 'part', code: 'A0064-P01' }
  const drawingTarget = { kind: 'drawing', code: 'A0064-M01' }
  const singlePreview = target => numbering.readDraftNumberingDeleteBasis(owner.companyId, 'A0064', target)
  const deleteSingle = (target, preview) => database.transaction(tx => deleteVerifiedDraftNumberingBundleInClient(tx, {
    companyId: owner.companyId, rootCode: 'A0064', target, actor: ownerDeleteActor, verified,
    fingerprint: policy.draftNumberingDeleteFingerprint(preview, ownerDeleteActor)
  }), { isolationLevel: 'serializable' })
  const blockedSingle = await singlePreview(drawingTarget)
  assert.ok(blockedSingle.blockers.some(reason => reason.includes('A0064-P02')))
  await assert.rejects(deleteSingle(drawingTarget, blockedSingle), /NUMBERING_DRAFT_DELETE_BLOCKED/)
  assert.equal(await numbering.readDraftNumberingDeleteBasis(owner.companyId, 'A0063', drawingTarget), null)
  const partPreview = await singlePreview(partTarget)
  assert.equal(policy.checkDraftNumberingDelete(partPreview, ownerDeleteActor), null)
  assert.deepEqual(partPreview.numberReuse, [{ code: 'A0064-P01', kind: 'part', status: 'reusable' }])
  await assert.rejects(deleteSingle(drawingTarget, partPreview), /NUMBERING_DRAFT_DELETE_STALE/)
  assert.deepEqual((await deleteSingle(partTarget, partPreview)).partNumbers, ['A0064-P01'])
  await admin.query("DELETE FROM ai_pdm_core.drawing_part_links WHERE id='qc-single-link'")
  const drawingPreview = await singlePreview(drawingTarget)
  assert.equal(policy.checkDraftNumberingDelete(drawingPreview, ownerDeleteActor), null)
  assert.deepEqual(drawingPreview.numberReuse, [{ code: 'A0064-M01', kind: 'drawing', status: 'reusable' }])
  assert.deepEqual((await deleteSingle(drawingTarget, drawingPreview)).drawingNumbers, ['A0064-M01'])
  assert.deepEqual((await admin.query(`SELECT part_number FROM ai_pdm_core.part_numbers WHERE part_root_id='qc-single-root'`)).rows,
    [{ part_number: 'A0064-P02' }])
  assert.equal((await admin.query(`SELECT id FROM ai_pdm_core.part_roots WHERE id='qc-single-root'`)).rowCount, 1)
  assert.equal((await admin.query(`SELECT id FROM ai_pdm_core.drawings WHERE id='qc-single-canonical'`)).rowCount, 0)
  mark('single part/drawing deletion preserves the root and sibling, binds scope, blocks live links and reports allocator reuse')
  const allocation = { companyId: owner.companyId, rootCode: 'A0064', createdBy: owner.userId, reason: 'isolated reuse test' }
  const allocationRepository = new AsyncNumberingRepository(database, undefined, undefined, undefined, verified)
  const { previewMemberNumber } = await import(pathToFileURL(path.join(root, 'src/lib/numbering-member-allocation.ts')).href)
  const { previewAppendNumbersAsync, previewNewBundleNumbersAsync } = await import(pathToFileURL(path.join(root, 'src/lib/numbering-preview.ts')).href)
  const scope = { companyId: owner.companyId, rootCode: 'A0064', ruleVersionId: 'numbering-rule-v3-alpha-root' }
  const partScope = { ...scope, kind: 'part' }
  const drawingScope = { ...scope, kind: 'drawing', purposeCode: 'M' }
  const appendReuse = await previewAppendNumbersAsync(database, owner.companyId, allocation.rootCode, 'M')
  assert.equal(appendReuse.part, partPreview.numberReuse[0].code)
  assert.equal(appendReuse.drawing, drawingPreview.numberReuse[0].code)
  const reusedPart = (await allocationRepository.addPartNumberToRoot(allocation)).partNumber
  const reusedDrawing = (await allocationRepository.addDrawingNumberToRoot({ ...allocation, purposeCode: 'M' })).drawingNumber
  assert.equal(reusedPart.partNumber, appendReuse.part)
  assert.equal(reusedDrawing.drawingNumber, appendReuse.drawing)
  assert.notEqual(reusedPart.id, partPreview.parts[0].id)
  assert.notEqual(reusedDrawing.id, drawingPreview.drawings[0].id)
  await admin.query(`UPDATE ai_pdm_core.numbering_sequences SET next_value=4
    WHERE company_id='qc-company' AND sequence_key IN ($1,$2)`, [
    canonicalNumberingSequenceKey(owner.companyId, 'part:A0064'),
    canonicalNumberingSequenceKey(owner.companyId, 'drawing:A0064:M')
  ])
  const appendFresh = await previewAppendNumbersAsync(database, owner.companyId, allocation.rootCode, 'M')
  assert.equal(appendFresh.part, 'A0064-P04')
  assert.equal(appendFresh.drawing, 'A0064-M04')
  assert.equal((await allocationRepository.addPartNumberToRoot(allocation)).partNumber.partNumber, appendFresh.part)
  assert.equal((await allocationRepository.addDrawingNumberToRoot({ ...allocation, purposeCode: 'M' })).drawingNumber.drawingNumber, appendFresh.drawing)
  mark('both create and delete previews match actual reuse, then skip unproven gaps and advance the sequence')

  for (const target of [{ kind: 'part', code: 'A0064-P04' }, { kind: 'drawing', code: 'A0064-M04' }]) {
    const preview = await singlePreview(target)
    assert.equal(preview.numberReuse[0].status, 'reusable')
    await deleteSingle(target, preview)
  }
  const { AsyncNumberStateFlowRepository } = await import(pathToFileURL(path.join(root, 'src/lib/repositories/number-state-flow-async-repository.ts')).href)
  const workspace = await database.transaction(tx => new AsyncNumberStateFlowRepository(tx).createWorkspace({
    id: 'qc-shared-allocator', companyId: owner.companyId, draftMode: 'append_drawing_part',
    ownerId: owner.userId, createdBy: owner.userId, sourceRootId: 'qc-single-root',
    sourceDrawingNumberId: null, sourcePartNumberId: null, sourceLinkType: null, appendReason: 'isolated candidate test',
    root: null,
    parts: [{ id: 'qc-shared-part', partName: 'Candidate part', itemKind: 'manufactured', isUniversal: false,
      universalReason: null, customSpecification: null, seriesCode: null }],
    drawings: [{ id: 'qc-shared-drawing', purposeCode: 'M', purposeDescription: 'Candidate drawing', isPrimaryManufacturing: true }],
    relations: [{ id: 'qc-shared-relation', drawingDraftId: 'qc-shared-drawing', partDraftId: 'qc-shared-part',
      linkType: 'primary_manufacturing', isPrimary: true }]
  }))
  const held = await database.transaction(tx => new AsyncNumberStateFlowRepository(tx).acquireCandidates({
    companyId: owner.companyId, workspaceId: workspace.id, actorId: owner.userId, expectedRowVersion: workspace.rowVersion
  }))
  assert.deepEqual(held.reservations.map(entry => entry.candidateCode).sort(), ['A0064-M04', 'A0064-P04'])
  assert.equal((await previewMemberNumber(database, partScope)).code, 'A0064-P05')
  assert.equal((await previewMemberNumber(database, drawingScope)).code, 'A0064-M05')
  const [first, second] = await Promise.all([
    allocationRepository.addDrawingNumberToRoot({ ...allocation, purposeCode: 'M' }),
    allocationRepository.addDrawingNumberToRoot({ ...allocation, purposeCode: 'M' })
  ])
  assert.deepEqual([first.drawingNumber.drawingNumber, second.drawingNumber.drawingNumber].sort(), ['A0064-M05', 'A0064-M06'])
  assert.equal((await allocationRepository.addPartNumberToRoot(allocation)).partNumber.partNumber, 'A0064-P05')
  mark('candidate reservations share the released pool and concurrent workbench requests receive distinct fresh numbers')

  // Simulate a legacy cleanup that removes a reissued member without releasing it.
  await admin.query('DELETE FROM ai_pdm_core.canonical_workbench_states WHERE company_id=$1 AND canonical_entity_id=$2',
    [owner.companyId, reusedPart.id])
  await admin.query('DELETE FROM ai_pdm_core.pdm_workbench_aggregates WHERE company_id=$1 AND canonical_entity_id=$2',
    [owner.companyId, reusedPart.id])
  await admin.query('DELETE FROM ai_pdm_core.part_numbers WHERE company_id=$1 AND id=$2', [owner.companyId, reusedPart.id])
  assert.equal((await previewMemberNumber(database, partScope)).code, 'A0064-P06')
  mark('a prior release does not authorize reuse again after the number has been reissued')

  const occupied = await readV3OccupiedRootCodes(database, owner.companyId)
  assert.equal((await previewMemberNumber(database, { ...partScope, rootCode })).code, 'A0062-P01')
  assert.equal((await previewMemberNumber(database, { ...drawingScope, rootCode })).code, 'A0062-M01')
  assert.equal(occupied.includes(rootCode), false, `deleted root ${rootCode} must be released by the actual shared occupied-code reader`)
  mark(`real repository deletes root/part/drawing and Draft transfer; ${rootCode} is reusable by readV3OccupiedRootCodes`)

  const bundleInput = { companyId: owner.companyId, createdBy: owner.userId, itemKind: 'manufactured', drawingPurposeCode: 'M' }
  const firstBundle = await allocationRepository.createNumberingRecord({ ...bundleInput, coreName: 'Disposable original bundle' })
  const bundleCode = firstBundle.root.rootCode
  const bundleBasis = await numbering.readDraftNumberingDeleteBasis(owner.companyId, bundleCode)
  assert.equal(policy.checkDraftNumberingDelete(bundleBasis, ownerDeleteActor), null)
  assert.deepEqual(bundleBasis.numberReuse.map(({ code, kind, status }) => ({ code, kind, status })), [
    { code: bundleCode, kind: 'root', status: 'reusable' },
    { code: firstBundle.drawingNumber.drawingNumber, kind: 'drawing', status: 'reusable' },
    { code: firstBundle.partNumber.partNumber, kind: 'part', status: 'reusable' }
  ])
  await database.transaction(tx => deleteVerifiedDraftNumberingBundleInClient(tx, {
    companyId: owner.companyId, rootCode: bundleCode, actor: ownerDeleteActor, verified,
    fingerprint: policy.draftNumberingDeleteFingerprint(bundleBasis, ownerDeleteActor)
  }), { isolationLevel: 'serializable' })
  assert.equal(await numbering.readDraftNumberingDeleteBasis(owner.companyId, bundleCode), null)
  const newBundlePreview = await previewNewBundleNumbersAsync(database, owner.companyId, 'M')
  for (const { code, kind } of bundleBasis.numberReuse) assert.equal(newBundlePreview[kind], code)
  const reissued = await allocationRepository.createNumberingRecord({ ...bundleInput, coreName: 'Disposable reissued bundle' })
  assert.equal(reissued.root.rootCode, newBundlePreview.root)
  assert.equal(reissued.drawingNumber.drawingNumber, newBundlePreview.drawing)
  assert.equal(reissued.partNumber.partNumber, newBundlePreview.part)
  assert.notEqual(reissued.root.id, firstBundle.root.id)
  assert.notEqual(reissued.drawingNumber.id, firstBundle.drawingNumber.id)
  assert.notEqual(reissued.partNumber.id, firstBundle.partNumber.id)
  mark('create, preview permanent bundle deletion, delete, preview new numbering, and recreate match across all three codes')

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
