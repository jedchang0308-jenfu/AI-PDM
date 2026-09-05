#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

import { canonicalize, sha256, sourceSha256 } from './lib/dev010-n2-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'config', 'platform', 'dev-010-n1c-ai-pdm.json')
const exactTarget = {
  environment: 'staging',
  projectId: 'jenfu-platform-nonprod',
  region: 'asia-east1',
  instance: 'jenfu-platform-nonprod-pg',
  connectionName: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
  database: 'jenfu_stg',
  runtimeLogin: 'dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam',
  migratorLogin: 'dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam',
  environmentMarker: 'JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C',
  service: 'ai-pdm-stg',
  hostingSite: 'jenfu-platform-nonprod-pdm',
  canonicalOrigin: 'https://jenfu-platform-nonprod-pdm.web.app',
}

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  throw error
}

export function loadN1cAiPdmConfig() {
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const keys = Object.keys(value).sort().join(',')
  if (keys !== ['contractVersion', 'devId', 'fixture', 'migration', 'repository', 'runtime', 'safety', 'slice', 'sourceFreeze', 'target'].sort().join(',')) fail('DEV010_N1C_AI_PDM_UNKNOWN_KEY')
  if (value.contractVersion !== 'jenfu.dev010.n1c.ai-pdm.v1' || value.devId !== 'DEV-010' || value.slice !== '010-N1C') fail('DEV010_N1C_AI_PDM_INVALID_CONTRACT')
  if (canonicalize(value.target) !== canonicalize(exactTarget)) fail('DEV010_N1C_AI_PDM_WRONG_TARGET')
  const expectedVersions = ['001', '003', '042', '047', '048', '049', '050', '051', '052', '053', '055', '056', '063', '062']
  if (!Array.isArray(value.migration.order) || value.migration.order.map((item) => path.basename(item).slice(0, 3)).join(',') !== expectedVersions.join(',')) fail('DEV010_N1C_AI_PDM_INVALID_ORDER')
  if (value.migration.sourceTraceOnly !== 'db/postgres/002_supabase_rls_plan.sql' || value.migration.foldedVersions !== '004-041,043-046' || value.migration.retiredVersions.join(',') !== '054') fail('DEV010_N1C_AI_PDM_INVALID_FRESH_LANE')
  if (value.migration.transformationId !== 'jenfu.dev010.n1c.ai-foundation-scratch-schema.v2' || value.migration.ledger !== 'ai_pdm_core.schema_migrations') fail('DEV010_N1C_AI_PDM_INVALID_TRANSFORMATION')
  if (value.runtime.minInstances !== 0 || value.runtime.maxInstances !== 2 || value.runtime.maximumConcurrentRevisions !== 2 || value.runtime.poolMax !== 2 || value.runtime.containerConcurrency !== 20 || value.runtime.startupPath !== '/api/health/ready' || value.runtime.attachmentsAllowed !== false || value.runtime.externalDeliveries !== 0) fail('DEV010_N1C_AI_PDM_RUNTIME_BOUNDARY_INVALID')
  if (value.fixture.tenantId !== 'company-staging-smoke' || value.fixture.productionTenantId !== 'company-jenfu' || value.fixture.productionRows !== 0 || value.fixture.credentials !== 0 || value.safety.productionWrites !== false || value.safety.oldStagingMutations !== 0 || value.safety.billingChanges !== 0 || value.safety.externalDeliveries !== 0 || value.safety.defaultMode !== 'dry-run') fail('DEV010_N1C_AI_PDM_SAFETY_FAILED')
  return value
}

export function assertN1cAiPdmTarget(environment, readback = null, config = loadN1cAiPdmConfig(), kind = 'migrator') {
  const expectedUser = kind === 'runtime' ? config.target.runtimeLogin : config.target.migratorLogin
  const observed = {
    environment: environment.PDM_DEPLOYMENT_ENV,
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    connectionName: environment.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME,
    database: environment.PDM_CLOUD_SQL_DATABASE,
    user: environment.PDM_CLOUD_SQL_USER,
    marker: environment.PDM_DATABASE_ENVIRONMENT_MARKER,
  }
  const expected = { environment: config.target.environment, projectId: config.target.projectId, region: config.target.region, connectionName: config.target.connectionName, database: config.target.database, user: expectedUser, marker: config.target.environmentMarker }
  if (canonicalize(observed) !== canonicalize(expected)) fail('DEV010_N1C_AI_PDM_WRONG_TARGET')
  if (readback && (readback.database !== expected.database || readback.user !== expected.user || Number(readback.postgresMajor) !== 17 || readback.environmentMarker !== expected.marker || readback.schemaReady !== true)) fail('DEV010_N1C_AI_PDM_DATABASE_READBACK_MISMATCH')
  return { ...observed, status: 'PASS' }
}

function transactionEnvelope(normalized, relativePath) {
  const beginCount = normalized.match(/^BEGIN;\s*$/gmu)?.length ?? 0
  const commitCount = normalized.match(/^COMMIT;\s*$/gmu)?.length ?? 0
  if (beginCount === 0 && commitCount === 0) return normalized.endsWith('\n') ? normalized : `${normalized}\n`
  const envelope = /^(?<leading>(?:(?:--[^\n]*)?\n)*)BEGIN;\s*\n(?<body>[\s\S]*?)\nCOMMIT;\s*$/u.exec(normalized)
  if (!envelope || beginCount !== 1 || commitCount !== 1) fail('DEV010_N1C_AI_PDM_TRANSACTION_SHAPE_MISMATCH', relativePath)
  return `${envelope.groups?.leading ?? ''}${envelope.groups?.body ?? ''}\n`
}

export function deriveAiPdmMigration(relativePath, bytes, config = loadN1cAiPdmConfig()) {
  const normalized = String(bytes).replace(/\r\n/gu, '\n')
  let output = transactionEnvelope(normalized, relativePath)
  if (relativePath.includes('/055_')) output = output.replaceAll('jenfu_platform_migrator', 'jenfu_ai_pdm_migrator')
  output = output.replace(/\bpublic\b/gu, 'ai_pdm_legacy_stage')
  output = output
    .replace(/^CREATE SCHEMA IF NOT EXISTS ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;\s*$/gmu, '')
    .replace(/^ALTER SCHEMA ai_pdm_contract OWNER TO jenfu_ai_pdm_migrator;\s*$/gmu, '')
  if (relativePath.includes('/055_') && output.includes('jenfu_platform_migrator')) fail('DEV010_N1C_AI_PDM_OWNER_REBIND_FAILED')
  if (relativePath.includes('/062_')) {
    output += '\nGRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator;\n'
    output += 'GRANT SELECT ON TABLE ai_pdm_contract.v_application_role_catalog_v1, ai_pdm_contract.v_contract_manifest_v1 TO jenfu_orgmaster_migrator;\n'
    output += 'DROP SCHEMA ai_pdm_legacy_stage;\n'
  }
  if (/^BEGIN;|\nCOMMIT;\s*$/u.test(output)) fail('DEV010_N1C_AI_PDM_TRANSACTION_TRANSFORM_FAILED', relativePath)
  return { output, transformationId: config.migration.transformationId }
}

export function buildAiPdmPackage(config = loadN1cAiPdmConfig()) {
  const entries = config.migration.order.map((relativePath) => {
    const source = fs.readFileSync(path.join(root, ...relativePath.split('/')))
    const derived = deriveAiPdmMigration(relativePath, source, config)
    return {
      version: `dev010-n1c-ai-pdm-${path.basename(relativePath).slice(0, 3)}`,
      name: path.basename(relativePath, '.sql').slice(4),
      sourcePath: relativePath,
      sourceSha256: sourceSha256(source),
      transformationId: derived.transformationId,
      outputSha256: sha256(derived.output),
      sql: derived.output,
    }
  })
  const legacyLedger = entries.filter((entry) => !entry.sourcePath.includes('/042_') && !entry.sourcePath.includes('/062_')).map((entry) => ({ version: path.basename(entry.sourcePath).slice(0, 3), name: entry.name, checksum: entry.sourceSha256 }))
  const trace = fs.readFileSync(path.join(root, ...config.migration.sourceTraceOnly.split('/')))
  const manifestCore = {
    contractVersion: config.contractVersion,
    entries: entries.map(({ sql, ...entry }) => entry),
    foldedVersions: config.migration.foldedVersions,
    legacyLedger,
    requiredDependency: config.migration.requiredDependency,
    retiredVersions: config.migration.retiredVersions,
    sourceTraceOnly: { path: config.migration.sourceTraceOnly, sha256: sourceSha256(trace) },
    target: config.target,
  }
  return { entries, legacyLedger, manifest: { ...manifestCore, manifestSha256: sha256(canonicalize(manifestCore)) } }
}

function writePackage(value) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const runId = `PACKAGE-${new Date().toISOString().replace(/[-:.TZ]/gu, '')}-${process.pid}`
  const outputDir = path.join(root, 'output', 'dev-010', 'n1c', runId, 'migrations', 'ai-pdm')
  fs.mkdirSync(outputDir, { recursive: true })
  for (const entry of value.entries) fs.writeFileSync(path.join(outputDir, `${entry.version}.sql`), entry.sql, 'utf8')
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ ...value.manifest, sourceRevision: head }, null, 2)}\n`, 'utf8')
  return { outputDir: path.relative(root, outputDir).replaceAll('\\', '/'), sourceRevision: head }
}

async function prepareLegacyLedger(client, value) {
  await client.query(`CREATE TABLE ai_pdm_legacy_stage.pdm_schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`)
  for (const entry of value.legacyLedger) await client.query('INSERT INTO ai_pdm_legacy_stage.pdm_schema_migrations(version,name,checksum) VALUES ($1,$2,$3)', [entry.version, entry.name, entry.checksum])
}

async function executePackage(value, config) {
  assertN1cAiPdmTarget(process.env, null, config, 'migrator')
  if (process.env.DEV010_N1C_EXECUTION_ACK !== 'AI_PDM_STAGING_MIGRATION') fail('DEV010_N1C_AI_PDM_EXECUTION_ACK_REQUIRED')
  const sourceRevision = process.env.DEV010_N1C_SOURCE_REVISION ?? ''
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision)) fail('DEV010_N1C_AI_PDM_SOURCE_REVISION_REQUIRED')
  const client = new pg.Client({
    host: process.env.PDM_CLOUD_SQL_HOST ?? '127.0.0.1',
    port: Number(process.env.PDM_CLOUD_SQL_PORT ?? 5432),
    database: config.target.database,
    user: config.target.migratorLogin,
    password: undefined,
    ssl: false,
    application_name: 'dev010-n1c-ai-pdm-migrator',
    connectionTimeoutMillis: 60_000,
    query_timeout: 65_000,
    statement_timeout: 60_000,
  })
  await client.connect()
  try {
    const readbackRow = (await client.query(`SELECT current_database() AS database, current_user AS user,
      current_setting('server_version_num')::integer / 10000 AS "postgresMajor",
      to_regnamespace('ai_pdm_core') IS NOT NULL AS "schemaReady",
      pg_catalog.shobj_description(database.oid, 'pg_database') AS "environmentMarker"
      FROM pg_catalog.pg_database AS database WHERE database.datname=current_database()`)).rows[0]
    assertN1cAiPdmTarget(process.env, readbackRow, config, 'migrator')
    const dependency = (await client.query(`
      SELECT contract_id, contract_version, signature_sha256
      FROM platform_contract.v_contract_manifest_v1
      WHERE contract_id = $1
    `, [config.migration.requiredDependency.contractId])).rows[0]
    const expectedDependency = config.migration.requiredDependency
    if (!dependency || dependency.contract_id !== expectedDependency.contractId || dependency.contract_version !== expectedDependency.contractVersion || dependency.signature_sha256 !== expectedDependency.signatureSha256) {
      fail('DEV010_N1C_AI_PDM_DEPENDENCY_MISMATCH')
    }
    await client.query("SELECT pg_advisory_lock(hashtext('dev010-n1c-ai-pdm'), hashtext(current_database()))")
    await client.query('SET ROLE jenfu_ai_pdm_migrator')
    await client.query(`CREATE TABLE IF NOT EXISTS ai_pdm_core.schema_migrations (
      version text PRIMARY KEY, name text NOT NULL, checksum_sha256 char(64) NOT NULL,
      source_revision text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT n1c_ai_pdm_checksum_valid CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'))`)
    for (const entry of value.entries) {
      const existing = (await client.query('SELECT name, checksum_sha256, source_revision FROM ai_pdm_core.schema_migrations WHERE version=$1', [entry.version])).rows[0]
      if (existing) {
        if (existing.name !== entry.name || existing.checksum_sha256 !== entry.outputSha256 || existing.source_revision !== sourceRevision) fail('MIGRATION_CHECKSUM_MISMATCH', entry.version)
        continue
      }
      await client.query('BEGIN')
      try {
        if (entry.sourcePath.includes('/062_')) await prepareLegacyLedger(client, value)
        await client.query(entry.sql)
        await client.query('INSERT INTO ai_pdm_core.schema_migrations(version,name,checksum_sha256,source_revision) VALUES ($1,$2,$3,$4)', [entry.version, entry.name, entry.outputSha256, sourceRevision])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('RESET ROLE').catch(() => undefined)
    await client.query("SELECT pg_advisory_unlock(hashtext('dev010-n1c-ai-pdm'), hashtext(current_database()))").catch(() => undefined)
    await client.end()
  }
}

async function main() {
  const config = loadN1cAiPdmConfig()
  const value = buildAiPdmPackage(config)
  const args = process.argv.slice(2)
  if (args.includes('--execute')) {
    await executePackage(value, config)
    process.stdout.write(`${JSON.stringify({ entries: value.entries.length, manifestSha256: value.manifest.manifestSha256, status: 'PASS' })}\n`)
    return
  }
  const written = args.includes('--write') ? writePackage(value) : null
  process.stdout.write(`${JSON.stringify({ defaultMode: 'dry-run', entries: value.entries.length, manifestSha256: value.manifest.manifestSha256, output: written, status: 'PASS' })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 })
