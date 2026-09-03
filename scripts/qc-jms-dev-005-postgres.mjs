#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { AiPdmRoleCatalogPublicationError, publishRoleCatalog, readRoleCatalog } from './lib/jms-dev-005-role-catalog.mjs'

const root = process.cwd()
const platformCandidates = [
  process.env.JENFU_MANAGEMENT_SYSTEM_ROOT?.trim(),
  path.resolve(root, '..', 'Jenfu-Management-system'),
  path.resolve(root, '..', '..', '..', 'Jenfu-Management-system'),
  path.resolve(root, '..', '..', '..', '..', 'Jenfu-Management-system'),
].filter(Boolean)
const platformRoot = platformCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'qa', 'dev-004', 'postgres', '000_bootstrap_roles.sql'))) ?? platformCandidates[0]
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pdm-dev005-postgres-'))
const dataDir = path.join(taskRoot, 'data')
const repositoryDir = path.join(taskRoot, 'repository')
const clusterDir = path.join(taskRoot, 'cluster')
const postgresLog = path.join(taskRoot, 'postgres.log')
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const dbName = `dev005_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`
const checks = []
let client
let port
let started = false
let firstFailure = null
let cleanup = { clusterStopped: false, portReleased: false, tempRemoved: false }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`)
  return result
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const selected = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(selected))
    })
  })
}

async function isPortReleased(selectedPort) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: selectedPort })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

async function check(id, label, task) {
  try {
    const detail = await task()
    checks.push({ id, label, status: 'PASS', detail: detail ?? null })
    console.log(`PASS ${id} ${label}`)
  } catch (error) {
    checks.push({ id, label, status: 'FAIL', message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

async function queryAs(role, sql) {
  await client.query('BEGIN')
  try {
    await client.query(`SET LOCAL ROLE ${role}`)
    const result = await client.query(sql)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function expectDenied(role, sql) {
  let blockedCode = null
  try {
    await queryAs(role, sql)
  } catch (error) {
    blockedCode = error?.code ?? 'UNKNOWN_DATABASE_ERROR'
  }
  assert.match(blockedCode ?? '', /^(42501|55000)$/u, `${role} unexpectedly executed: ${sql}`)
}

async function setPublicationState(sql, values = []) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE jenfu_platform_migrator')
    await client.query(sql, values)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function expectPublicationCode(catalog, expectedCode) {
  let code = null
  try {
    await publishRoleCatalog(client, catalog, { activate: true, publishedBy: 'dev-005-qc', activationReason: 'DEV-005 isolated negative case' })
  } catch (error) {
    if (error instanceof AiPdmRoleCatalogPublicationError) code = error.code
    else throw error
  }
  assert.equal(code, expectedCode)
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(repositoryDir, { recursive: true })
  process.env.PDM_DATA_DIR = dataDir
  process.env.PDM_REPOSITORY_DIR = repositoryDir
  port = await getFreePort()
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: 'DEV-005 S1 isolated PostgreSQL publication, replay, ACL, tamper and retirement validation',
    port,
    owningProcessTree: 'qc-jms-dev-005-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'client closed, task-owned cluster stopped, port released, task temp removed',
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot,
    primaryDataWrites: false,
  } }))
  run(path.join(postgresBin, 'initdb.exe'), ['-D', clusterDir, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-l', postgresLog, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  run(path.join(postgresBin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', dbName])
  client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${dbName}`, application_name: 'ai-pdm-dev005-postgres-qc' })
  await client.connect()
  const bootstrapSql = fs.readFileSync(path.join(platformRoot, 'qa', 'dev-004', 'postgres', '000_bootstrap_roles.sql'), 'utf8')
  const migrationSql = fs.readFileSync(path.join(root, 'db', 'postgres', '055_jenfu_role_catalog_publication.sql'), 'utf8')
  const catalog = await readRoleCatalog(path.join(root, 'config', 'access-control', 'jenfu-role-catalog.v1.json'))
  await client.query(bootstrapSql)
  await check('QA-005-S1-001', 'migration applies fresh and replays', async () => {
    await client.query(migrationSql)
    await client.query(migrationSql)
  })
  await check('QA-005-S1-002', 'publisher atomically activates exact catalog and replays idempotently', async () => {
    const first = await publishRoleCatalog(client, catalog, { activate: true, publishedBy: 'dev-005-qc', activationReason: 'DEV-005 isolated publication' })
    const activationBeforeReplay = await client.query('SELECT activated_at, activated_by, activation_reason FROM ai_pdm_contract.active_role_catalog WHERE application_id = $1', ['ai-pdm'])
    const replay = await publishRoleCatalog(client, catalog, { activate: true, publishedBy: 'dev-005-qc', activationReason: 'DEV-005 isolated replay' })
    const activationAfterReplay = await client.query('SELECT activated_at, activated_by, activation_reason FROM ai_pdm_contract.active_role_catalog WHERE application_id = $1', ['ai-pdm'])
    assert.equal(first.status, 'published')
    assert.equal(replay.status, 'replayed')
    assert.equal(first.catalogSha256, catalog.catalogSha256)
    assert.deepEqual(activationAfterReplay.rows, activationBeforeReplay.rows)
  })
  await check('QA-005-S1-003', 'OrgMaster and AI-PDM runtimes can read only the active projection', async () => {
    const orgMasterRows = await queryAs('jenfu_orgmaster_runtime', 'SELECT * FROM ai_pdm_contract.v_application_role_catalog_v1 ORDER BY display_order')
    const aiPdmRows = await queryAs('jenfu_ai_pdm_runtime', 'SELECT * FROM ai_pdm_contract.v_application_role_catalog_v1 ORDER BY display_order')
    assert.equal(orgMasterRows.rowCount, 9)
    assert.equal(aiPdmRows.rowCount, 9)
    assert.equal(orgMasterRows.rows[0].catalog_sha256, catalog.catalogSha256)
    assert.deepEqual(orgMasterRows.rows.map((row) => row.stable_role_id), catalog.roles.map((role) => role.stableRoleId))
  })
  await check('QA-005-S1-004', 'private tables and publication DML are denied to normal runtimes', async () => {
    await expectDenied('jenfu_orgmaster_runtime', 'SELECT * FROM ai_pdm_contract.role_catalog_publications')
    await expectDenied('jenfu_ai_pdm_runtime', "UPDATE ai_pdm_contract.role_catalog_publications SET status='retired'")
    await expectDenied('jenfu_orgmaster_runtime', 'DELETE FROM ai_pdm_contract.v_application_role_catalog_v1')
    await expectDenied('jenfu_platform_runtime', 'SELECT * FROM ai_pdm_contract.v_application_role_catalog_v1')
  })
  await check('QA-005-S1-005', 'same version with another payload hash fails closed', async () => {
    await setPublicationState('UPDATE ai_pdm_contract.role_catalog_publications SET catalog_sha256 = $1 WHERE catalog_version = $2', ['0'.repeat(64), catalog.catalogVersion])
    await expectPublicationCode(catalog, 'CATALOG_VERSION_PAYLOAD_CONFLICT')
    await setPublicationState('UPDATE ai_pdm_contract.role_catalog_publications SET catalog_sha256 = $1 WHERE catalog_version = $2', [catalog.catalogSha256, catalog.catalogVersion])
  })
  await check('QA-005-S1-006', 'retired publication disappears and cannot be resurrected', async () => {
    await setPublicationState("UPDATE ai_pdm_contract.role_catalog_publications SET status = 'retired', retired_at = now() WHERE catalog_version = $1", [catalog.catalogVersion])
    const retiredRows = await queryAs('jenfu_orgmaster_runtime', 'SELECT * FROM ai_pdm_contract.v_application_role_catalog_v1')
    assert.equal(retiredRows.rowCount, 0)
    await expectPublicationCode(catalog, 'CATALOG_VERSION_RETIRED')
  })
  await check('QA-005-S1-007', 'catalog schema remains referentially valid', async () => {
    const result = await client.query(`SELECT COUNT(*)::integer AS count
      FROM ai_pdm_contract.role_catalog_entries e
      LEFT JOIN ai_pdm_contract.role_catalog_publications p ON p.catalog_version = e.catalog_version
      WHERE p.catalog_version IS NULL`)
    assert.equal(result.rows[0].count, 0)
  })
}

try {
  await main()
} catch (error) {
  firstFailure = error instanceof Error ? error.stack ?? error.message : String(error)
} finally {
  if (client) await client.end().catch(() => undefined)
  if (started) {
    const stop = spawnSync(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-m', 'fast', '-w', 'stop'], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'ignore' })
    cleanup.clusterStopped = stop.status === 0
  }
  if (port) cleanup.portReleased = await isPortReleased(port)
  try {
    fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 })
    cleanup.tempRemoved = !fs.existsSync(taskRoot)
  } catch { cleanup.tempRemoved = false }
}

const status = !firstFailure && checks.every((item) => item.status === 'PASS') && Object.values(cleanup).every(Boolean) ? 'PASS' : 'FAIL'
console.log(JSON.stringify({ runner: 'DEV-005-S1-postgres', status, productionWrites: false, checks, cleanup, firstFailure }))
if (status !== 'PASS') process.exitCode = 1
