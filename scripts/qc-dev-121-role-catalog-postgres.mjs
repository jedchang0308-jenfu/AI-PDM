#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = fs.realpathSync(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-catalog-pg-'))
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const v3 = JSON.parse(fs.readFileSync(path.join(root, 'config/access-control/jenfu-role-catalog.v1.json'), 'utf8'))
const v4 = JSON.parse(fs.readFileSync(path.join(root, 'config/access-control/jenfu-role-catalog.v4.json'), 'utf8'))
const sql = fs.readFileSync(path.join(root, 'db/postgres/066_dev121_principal_role_catalog_v4.sql'), 'utf8')
let client
let port
let started = false
let stopped = false
let portReleased = false
let tempRemoved = false
const checks = []

function run(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args,
    { cwd: root, encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port
      server.close((error) => error ? reject(error) : resolve(selected))
    })
  })
}
async function isPortReleased(value) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: value })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}
async function check(name, action) {
  await action()
  checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}

try {
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-121 isolated PostgreSQL catalog v4 publication QC',
    port, owningProcessTree: 'qc-dev-121-role-catalog-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'client closed, cluster stopped, port released, task temp removed',
    mutationScope: taskRoot, productionWrites: false
  } })}\n`)
  run('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust',
    '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'],
    { stdio: 'ignore' })
  started = true
  client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
  await client.connect()
  await client.query(`
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    SET ROLE jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.role_catalog_publications (
      catalog_version text PRIMARY KEY, contract_version text NOT NULL,
      application_id text NOT NULL, published_at timestamptz NOT NULL,
      catalog_sha256 text NOT NULL, status text NOT NULL,
      published_by text, created_at timestamptz DEFAULT now(), retired_at timestamptz);
    CREATE UNIQUE INDEX role_catalog_one_active_version
      ON ai_pdm_core.role_catalog_publications (application_id) WHERE status='active';
    CREATE TABLE ai_pdm_core.role_catalog_entries (
      catalog_version text NOT NULL REFERENCES ai_pdm_core.role_catalog_publications(catalog_version),
      display_order integer NOT NULL, stable_role_id text NOT NULL, role_code text NOT NULL,
      display_name text NOT NULL, assignable boolean NOT NULL, risk text NOT NULL,
      subject_kind text NOT NULL, recommendation_allowed boolean NOT NULL,
      delegation_allowed boolean NOT NULL, allowed_scope_kinds jsonb NOT NULL,
      assignment_tier text NOT NULL, permissions jsonb NOT NULL,
      metadata jsonb, role_definition_hash text NOT NULL,
      PRIMARY KEY (catalog_version,stable_role_id));
    CREATE TABLE ai_pdm_core.active_role_catalog (
      application_id text PRIMARY KEY, catalog_version text NOT NULL
        REFERENCES ai_pdm_core.role_catalog_publications(catalog_version),
      activated_at timestamptz NOT NULL, activated_by text,
      activation_reason text NOT NULL);
    CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS
      SELECT publication.application_id,publication.catalog_version,
             publication.catalog_sha256,entry.stable_role_id
      FROM ai_pdm_core.active_role_catalog active
      JOIN ai_pdm_core.role_catalog_publications publication
        ON publication.application_id=active.application_id
       AND publication.catalog_version=active.catalog_version
       AND publication.status='active'
      JOIN ai_pdm_core.role_catalog_entries entry
        ON entry.catalog_version=publication.catalog_version;
    RESET ROLE;
  `)
  await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications
    (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
    VALUES ($1,$2,$3,$4,$5,'active','DEV-013 fixture')`,
  [v3.catalogVersion, v3.contractVersion, v3.applicationId, v3.publishedAt, v3.catalogSha256])
  for (const [order, role] of v3.roles.entries()) {
    await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries
      (catalog_version,display_order,stable_role_id,role_code,display_name,
       assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,
       allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`,
    [v3.catalogVersion, order, role.stableRoleId, role.roleCode, role.displayName,
      role.assignable, role.risk, role.subjectKind, role.recommendationAllowed,
      role.delegationAllowed, JSON.stringify(role.allowedScopeKinds), role.assignmentTier,
      JSON.stringify(role.permissions), JSON.stringify(role.metadata ?? null), role.roleDefinitionHash])
  }
  await client.query(`INSERT INTO ai_pdm_core.active_role_catalog
    (application_id,catalog_version,activated_at,activated_by,activation_reason)
    VALUES ('ai-pdm',$1,now(),'DEV-013 fixture','catalog baseline')`, [v3.catalogVersion])

  await check('corrupt v3 baseline rolls back with no v4 rows', async () => {
    await client.query(`UPDATE ai_pdm_core.role_catalog_publications
      SET catalog_sha256=repeat('0',64) WHERE catalog_version=$1`, [v3.catalogVersion])
    await assert.rejects(client.query(sql), /DEV121_CATALOG_V3_BASELINE_MISMATCH/u)
    await client.query('ROLLBACK')
    const state = await client.query(`SELECT count(*)::integer AS count
      FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=$1`, [v4.catalogVersion])
    assert.equal(state.rows[0].count, 0)
    await client.query(`UPDATE ai_pdm_core.role_catalog_publications
      SET catalog_sha256=$1 WHERE catalog_version=$2`, [v3.catalogSha256, v3.catalogVersion])
  })
  await check('v4 activation retains immutable v3 entries and exact grants', async () => {
    await client.query(sql)
    const state = await client.query(`SELECT publication.catalog_version,publication.catalog_sha256,
      publication.status,active.catalog_version AS active_version
      FROM ai_pdm_core.role_catalog_publications publication
      CROSS JOIN ai_pdm_core.active_role_catalog active ORDER BY publication.catalog_version`)
    assert.deepEqual(state.rows.map((row) => row.status), ['retired', 'active'])
    assert.ok(state.rows.every((row) => row.active_version === v4.catalogVersion))
    assert.equal(state.rows[1].catalog_sha256, v4.catalogSha256)
    const entries = await client.query(`SELECT catalog_version,stable_role_id,permissions,role_definition_hash
      FROM ai_pdm_core.role_catalog_entries ORDER BY catalog_version,stable_role_id`)
    assert.equal(entries.rows.length, 18)
    for (const role of v4.roles) {
      const observed = entries.rows.find((row) => row.catalog_version === v4.catalogVersion
        && row.stable_role_id === role.stableRoleId)
      assert.deepEqual(observed.permissions, role.permissions)
      assert.equal(observed.role_definition_hash, role.roleDefinitionHash)
    }
  })
  await check('exact replay creates no new publication or entries', async () => {
    const before = await client.query(`SELECT count(*)::integer AS count FROM ai_pdm_core.role_catalog_entries`)
    await client.query(sql)
    const after = await client.query(`SELECT count(*)::integer AS count FROM ai_pdm_core.role_catalog_entries`)
    assert.equal(after.rows[0].count, before.rows[0].count)
  })
  await check('tampered v4 entry fails closed on replay', async () => {
    await client.query(`UPDATE ai_pdm_core.role_catalog_entries SET permissions='[]'::jsonb
      WHERE catalog_version=$1 AND stable_role_id='role-rd'`, [v4.catalogVersion])
    await assert.rejects(client.query(sql), /DEV121_CATALOG_V4_READBACK_FAILED/u)
    await client.query('ROLLBACK')
  })
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
} finally {
  if (client) await client.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop'])
      stopped = true } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
  }
  if (port) portReleased = await isPortReleased(port)
  if (stopped && portReleased) {
    const resolvedTaskRoot = fs.realpathSync(taskRoot)
    if (!resolvedTaskRoot.startsWith(`${tempRoot}${path.sep}`)) throw new Error('unsafe task temp path')
    fs.rmSync(resolvedTaskRoot, { recursive: true, force: true })
    tempRemoved = !fs.existsSync(resolvedTaskRoot)
  }
  if (!portReleased || !tempRemoved) process.exitCode = 1
  process.stdout.write(`${JSON.stringify({ status: process.exitCode ? 'FAIL' : 'PASS',
    checks: checks.length, stopped, portReleased, tempRemoved, productionWrites: false })}\n`)
}
