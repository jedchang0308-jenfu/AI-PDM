#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { principalCatalog, requirePublishedPrincipalCatalog } from '../src/lib/jenfu-principal-role-catalog.ts'
import { buildDev117MigrationPackage, buildDev117MigrationBundle } from './lib/dev117-ai-pdm-continuous-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = fs.realpathSync(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-rd-v7-pg-'))
const cluster = path.join(taskRoot, 'cluster'), log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config/access-control/jenfu-role-catalog.v6.json'), 'utf8'))
const profile = JSON.parse(fs.readFileSync(path.join(root, 'config/release/dev117-ai-pdm-independent-production-v3.json'), 'utf8'))
const n1c = JSON.parse(fs.readFileSync(path.join(root, 'config/platform/dev-010-n1c-ai-pdm.json'), 'utf8'))
const { bundle } = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), 'a'.repeat(40))
const entry = bundle.entries[34]
assert.equal(entry.path, 'db/postgres/085_dev121_principal_role_catalog_v7.sql')
assert.equal(entry.appliedSha256, '80e7085085a3bf8d220917a4790224b52a54cc2af788a0775d7aaedd629ce65b')
const sql = 'BEGIN;\n'+Buffer.from(entry.sqlBase64, 'base64').toString('utf8')+'\nCOMMIT;'
const setup = fs.readFileSync(path.join(root, 'scripts/qc-dev-121-role-catalog-postgres.mjs'), 'utf8')
const checks = []
let client, port, pid, tracking, started = false, stopped = false, portReleased = false, tempRemoved = false
function native(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args, { cwd: taskRoot, encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${name}: ${(result.stderr || result.stdout || '').trim()}`)
}
async function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { const selected = server.address().port
      server.close(error => error ? reject(error) : resolve(selected)) }) })
}
async function check(name, work) { await work(); checks.push(name); console.log('PASS '+name) }
function track(action) {
  const session = process.env.PDM_QC_GOVERNOR_SESSION
  if (!session) return
  const governorRoot = process.env.PDM_QC_GOVERNOR_ROOT, python = process.env.PDM_QC_PYTHON
  assert.ok(governorRoot && python)
  const cli = path.join(governorRoot, 'scripts/resource_governor.py')
  if (action === 'register') {
    const result = spawnSync(python, ['-c', 'import sys,json; sys.path.insert(0,sys.argv[1]); from scripts.platforms import PlatformServices; print(json.dumps(PlatformServices().process_fingerprint(int(sys.argv[2]))))', governorRoot, String(pid)], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    tracking = JSON.parse(result.stdout)
  }
  const args = ['--agent-host', 'codex', '--format', 'json', 'session', 'runtime', action,
    '--session', session, '--pid', String(pid), '--start-token', tracking.start_token]
  if (action === 'register') args.push('--executable', tracking.executable, '--purpose', 'DEV-121 disposable RD catalog v7 PostgreSQL', '--cleanup-condition', 'exact cluster stopped and port released', '--parent-pid', String(process.pid), '--port', String(port))
  else args.push('--reason', 'stopped')
  const result = spawnSync(python, [cli, ...args], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
try {
  port = await freePort()
  process.env.PDM_DATA_DIR = path.join(taskRoot, 'data')
  process.env.PDM_REPOSITORY_DIR = path.join(taskRoot, 'repository')
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: 'synthetic RD v6 to v7 publication and permission checks', port,
    owningProcessTree: `${process.pid} -> task-owned PostgreSQL cluster`, cleanupCondition: 'exact cluster stopped, port released and temp removed',
    PDM_DATA_DIR: process.env.PDM_DATA_DIR, PDM_REPOSITORY_DIR: process.env.PDM_REPOSITORY_DIR, mutationScope: taskRoot, productionWrites: false } }))
  native('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
  native('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
  started = true; pid = Number(fs.readFileSync(path.join(cluster, 'postmaster.pid'), 'utf8').split('\n')[0]); track('register')
  client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' }); await client.connect()
  const schema = setup.slice(setup.indexOf('CREATE TABLE ai_pdm_core.role_catalog_publications'), setup.indexOf('RESET ROLE;'))
  await client.query(`CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN; CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator; SET ROLE jenfu_ai_pdm_migrator; ${schema} RESET ROLE;`)
  await client.query(`CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS
    SELECT p.application_id,p.catalog_version,p.catalog_sha256,e.stable_role_id,p.contract_version,e.display_order,e.role_definition_hash
    FROM ai_pdm_core.active_role_catalog a JOIN ai_pdm_core.role_catalog_publications p ON p.catalog_version=a.catalog_version AND p.status='active'
    JOIN ai_pdm_core.role_catalog_entries e ON e.catalog_version=p.catalog_version`)
  await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications (catalog_version,contract_version,application_id,published_at,catalog_sha256,status)
    VALUES ($1,$2,$3,$4,$5,'active')`, [baseline.catalogVersion, baseline.contractVersion, baseline.applicationId, baseline.publishedAt, baseline.catalogSha256])
  for (const [order, role] of baseline.roles.entries()) await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries
    (catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`,
    [baseline.catalogVersion, order, role.stableRoleId, role.roleCode, role.displayName, role.assignable, role.risk, role.subjectKind,
      role.recommendationAllowed, role.delegationAllowed, JSON.stringify(role.allowedScopeKinds), role.assignmentTier,
      JSON.stringify(role.permissions), role.metadata === undefined ? null : JSON.stringify(role.metadata), role.roleDefinitionHash])
  await client.query(`INSERT INTO ai_pdm_core.active_role_catalog VALUES ('ai-pdm',$1,now(),'synthetic','baseline')`, [baseline.catalogVersion])
  const snapshot = { kind: 'postgres', async query(query, params = {}) {
    const values = []; const prepared = query.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)/gu, (_, key) => { values.push(params[key]); return '$'+values.length })
    return (await client.query(prepared, values)).rows
  } }
  await check('v7 runtime rejects the still-active v6 publication', async () => {
    await assert.rejects(requirePublishedPrincipalCatalog(snapshot), error => error.code === 'principal_dependency_unavailable')
  })
  await check('tampered baseline rolls back with zero partial v7 rows', async () => {
    await client.query(`UPDATE ai_pdm_core.role_catalog_entries SET permissions='[]' WHERE stable_role_id='role-rd'`)
    await assert.rejects(client.query(sql), /DEV121_CATALOG_V6_BASELINE_MISMATCH/u); await client.query('ROLLBACK')
    assert.equal((await client.query(`SELECT count(*)::int n FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=$1`, [principalCatalog.catalogVersion])).rows[0].n, 0)
    await client.query(`UPDATE ai_pdm_core.role_catalog_entries SET permissions=$1::jsonb WHERE stable_role_id='role-rd'`, [JSON.stringify(baseline.roles[0].permissions)])
  })
  await check('parallel publication retains immutable history and exactly nine complete v7 roles', async () => {
    const concurrent = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    await concurrent.connect(); try { await Promise.all([client.query(sql), concurrent.query(sql)]) } finally { await concurrent.end() }
    await requirePublishedPrincipalCatalog(snapshot)
    const rows = (await client.query(`SELECT stable_role_id,permissions,role_definition_hash FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1`, [principalCatalog.catalogVersion])).rows
    assert.equal(rows.length, 9)
    for (const role of principalCatalog.roles) { const row = rows.find(value => value.stable_role_id === role.stableRoleId)
      assert.deepEqual(row.permissions, role.permissions); assert.equal(row.role_definition_hash, role.roleDefinitionHash) }
    assert.equal((await client.query(`SELECT count(*)::int n FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1`, [baseline.catalogVersion])).rows[0].n, 9)
  })
  await check('exact replay leaves one active publication and no duplicate entries', async () => {
    await client.query(sql); await client.query(sql)
    assert.equal((await client.query(`SELECT count(*)::int n FROM ai_pdm_core.role_catalog_entries`)).rows[0].n, 18)
    assert.equal((await client.query(`SELECT count(*)::int n FROM ai_pdm_core.role_catalog_publications WHERE status='active'`)).rows[0].n, 1)
  })
  await check('published RD policy adds view while retaining edit/submit and denying approval', async () => {
    const catalog = await requirePublishedPrincipalCatalog(snapshot)
    const rd = catalog.roles.find(role => role.roleCode === 'rd')
    for (const code of ['numbering.workspace.update', 'numbering.draft.update', 'numbering.candidate.review.submit']) assert.ok(rd.permissions.some(p => p.kind === 'action' && p.code === code && p.allowed))
    assert.ok(rd.permissions.some(p => p.kind === 'page' && p.code === 'numbering.drawings.view' && p.allowed))
    assert.ok(!rd.permissions.some(p => p.code === 'approval.request.decide' && p.allowed))
  })
  await check('tampered publication metadata rejects replay without repair or duplicate writes', async () => {
    await client.query(`UPDATE ai_pdm_core.role_catalog_publications SET published_at=published_at+interval '1 second' WHERE catalog_version=$1`, [principalCatalog.catalogVersion])
    await assert.rejects(client.query(sql), /DEV121_CATALOG_STATE_MISMATCH/u); await client.query('ROLLBACK')
    await client.query(`UPDATE ai_pdm_core.role_catalog_publications SET published_at=$1 WHERE catalog_version=$2`, [principalCatalog.publishedAt, principalCatalog.catalogVersion])
  })
  await check('tampered v7 role fails closed on replay', async () => {
    await client.query(`UPDATE ai_pdm_core.role_catalog_entries SET permissions='[]' WHERE catalog_version=$1 AND stable_role_id='role-rd'`, [principalCatalog.catalogVersion])
    await assert.rejects(client.query(sql), /DEV121_CATALOG_V7_READBACK_FAILED/u); await client.query('ROLLBACK')
  })
} catch (error) { console.error(error.stack || error); process.exitCode = 1 }
finally {
  if (client) await client.end().catch(() => undefined)
  if (started) { try { native('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop']); stopped = true
    if (tracking) track('release') } catch (error) { console.error(error.message); process.exitCode = 1 } }
  portReleased = !port || await new Promise(resolve => { const probe = net.createServer(); probe.once('error', () => resolve(false)); probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true))) })
  if ((!started || stopped) && portReleased) { const resolved = fs.realpathSync(taskRoot); assert.ok(resolved.startsWith(tempRoot+path.sep)); fs.rmSync(resolved, { recursive: true, force: true }); tempRemoved = !fs.existsSync(resolved) }
  if (!portReleased || !tempRemoved) process.exitCode = 1
  console.log(JSON.stringify({ status: process.exitCode ? 'FAIL' : 'PASS', checks: checks.length, stopped, portReleased, tempRemoved, productionWrites: false }))
}
