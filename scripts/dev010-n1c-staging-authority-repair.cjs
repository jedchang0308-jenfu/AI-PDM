'use strict'

const pg = require('pg')

const TARGET = Object.freeze({
  project: 'jenfu-platform-nonprod',
  region: 'asia-east1',
  job: 'ai-pdm-stg-migration-runner',
  connectionName: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
  database: 'jenfu_stg',
  databaseUser: 'dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam',
  marker: 'JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C',
})
const SOURCE_PATTERN = /^[a-f0-9]{40}$/u

function assertStagingAuthorityEnvironment(env = process.env) {
  if (env.DEV010_N1C_AUTHORITY_EXECUTION_ACK !== 'AI_PDM_STAGING_AUTHORITY_REPAIR') {
    throw new Error('DEV010_N1C_AUTHORITY_ACK_REQUIRED')
  }
  if (
    env.PDM_DEPLOYMENT_ENV !== 'staging' ||
    env.GOOGLE_CLOUD_PROJECT !== TARGET.project ||
    env.GOOGLE_CLOUD_REGION !== TARGET.region ||
    env.CLOUD_RUN_JOB !== TARGET.job ||
    env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME !== TARGET.connectionName ||
    env.PDM_CLOUD_SQL_DATABASE !== TARGET.database ||
    env.PDM_CLOUD_SQL_USER !== TARGET.databaseUser ||
    env.PDM_DATABASE_ENVIRONMENT_MARKER !== TARGET.marker
  ) throw new Error('DEV010_N1C_AUTHORITY_TARGET_MISMATCH')
  if (env.PDM_POSTGRES_URL?.trim() || env.PDM_POSTGRES_ADMIN_URL?.trim() || env.PDM_CLOUD_SQL_PASSWORD?.trim() || env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error('DEV010_N1C_AUTHORITY_STATIC_SECRET_FORBIDDEN')
  }
  const sourceRevision = env.DEV010_N1C_SOURCE_REVISION?.trim() ?? ''
  if (!SOURCE_PATTERN.test(sourceRevision)) throw new Error('DEV010_N1C_AUTHORITY_SOURCE_REVISION_INVALID')
  return { sourceRevision }
}

function planAuthorityTransition(row, sourceRevision) {
  if (!row || !SOURCE_PATTERN.test(sourceRevision)) throw new Error('DEV010_N1C_AUTHORITY_UNEXPECTED_STATE')
  if (row.mode === 'canonical_only' && row.schema_hash === 'dev090-v1' && row.expected_commit === sourceRevision) return []
  if (row.mode === 'canonical_only' && row.schema_hash === 'dev090-v1' && row.expected_commit === '') return ['bind_commit']
  if (row.mode === 'legacy_only' && row.schema_hash === 'dev087-v1' && row.expected_commit === '') return ['cutover_window', 'canonical_only']
  throw new Error('DEV010_N1C_AUTHORITY_UNEXPECTED_STATE')
}

function projectAuthority(row) {
  return {
    id: Number(row.id),
    mode: String(row.mode),
    expectedCommit: String(row.expected_commit ?? ''),
    schemaHash: String(row.schema_hash),
    rowVersion: Number(row.row_version),
  }
}

async function main(env = process.env) {
  const { sourceRevision } = assertStagingAuthorityEnvironment(env)
  const client = new pg.Client({
    host: env.PDM_CLOUD_SQL_HOST || '127.0.0.1',
    port: Number(env.PDM_CLOUD_SQL_PORT || 5432),
    database: TARGET.database,
    user: TARGET.databaseUser,
    password: undefined,
    ssl: false,
    application_name: 'dev010-n1c-staging-authority-repair',
    connectionTimeoutMillis: 60_000,
    query_timeout: 65_000,
    statement_timeout: 60_000,
  })
  await client.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dev010-n1c-authority'), hashtext(current_database()))")
    const target = (await client.query(`SELECT current_database() AS database, current_user AS db_user,
      current_setting('server_version_num')::integer / 10000 AS postgres_major,
      pg_catalog.shobj_description(database.oid, 'pg_database') AS environment_marker
      FROM pg_catalog.pg_database AS database WHERE database.datname=current_database()`)).rows[0]
    if (target.database !== TARGET.database || target.db_user !== TARGET.databaseUser || Number(target.postgres_major) !== 17 || target.environment_marker !== TARGET.marker) {
      throw new Error('DEV010_N1C_AUTHORITY_DATABASE_READBACK_MISMATCH')
    }
    const productionBefore = (await client.query(`SELECT jsonb_build_object(
      'companies',(SELECT count(*) FROM ai_pdm_core.companies WHERE id='company-jenfu'),
      'users',(SELECT count(*) FROM ai_pdm_core.users WHERE company_id='company-jenfu'),
      'sequences',(SELECT count(*) FROM ai_pdm_core.numbering_sequences WHERE company_id='company-jenfu'),
      'roots',(SELECT count(*) FROM ai_pdm_core.part_roots WHERE company_id='company-jenfu'),
      'drawings',(SELECT count(*) FROM ai_pdm_core.drawings WHERE company_id='company-jenfu'),
      'audits',(SELECT count(*) FROM ai_pdm_core.audit_logs WHERE company_id='company-jenfu'))::text AS fingerprint`)).rows[0].fingerprint
    const current = (await client.query(`SELECT id, mode, expected_commit, schema_hash, row_version
      FROM ai_pdm_core.pdm_workbench_state_authority_control WHERE id=1 FOR UPDATE`)).rows[0]
    const before = projectAuthority(current)
    const steps = planAuthorityTransition(current, sourceRevision)
    for (const step of steps) {
      if (step === 'cutover_window') {
        await client.query(`UPDATE ai_pdm_core.pdm_workbench_state_authority_control
          SET mode='cutover_window', expected_commit=$1, schema_hash='dev090-v1', row_version=row_version+1, switched_at=now()
          WHERE id=1 AND mode='legacy_only' AND expected_commit='' AND schema_hash='dev087-v1'`, [sourceRevision])
      } else if (step === 'canonical_only') {
        await client.query(`UPDATE ai_pdm_core.pdm_workbench_state_authority_control
          SET mode='canonical_only', expected_commit=$1, schema_hash='dev090-v1', row_version=row_version+1, switched_at=now()
          WHERE id=1 AND mode='cutover_window' AND expected_commit=$1 AND schema_hash='dev090-v1'`, [sourceRevision])
      } else {
        await client.query(`UPDATE ai_pdm_core.pdm_workbench_state_authority_control
          SET expected_commit=$1, row_version=row_version+1, switched_at=now()
          WHERE id=1 AND mode='canonical_only' AND expected_commit='' AND schema_hash='dev090-v1'`, [sourceRevision])
      }
    }
    const afterRow = (await client.query(`SELECT id, mode, expected_commit, schema_hash, row_version
      FROM ai_pdm_core.pdm_workbench_state_authority_control WHERE id=1`)).rows[0]
    const after = projectAuthority(afterRow)
    if (after.id !== 1 || after.mode !== 'canonical_only' || after.expectedCommit !== sourceRevision || after.schemaHash !== 'dev090-v1' || after.rowVersion !== before.rowVersion + steps.length) {
      throw new Error('DEV010_N1C_AUTHORITY_READBACK_MISMATCH')
    }
    const productionAfter = (await client.query(`SELECT jsonb_build_object(
      'companies',(SELECT count(*) FROM ai_pdm_core.companies WHERE id='company-jenfu'),
      'users',(SELECT count(*) FROM ai_pdm_core.users WHERE company_id='company-jenfu'),
      'sequences',(SELECT count(*) FROM ai_pdm_core.numbering_sequences WHERE company_id='company-jenfu'),
      'roots',(SELECT count(*) FROM ai_pdm_core.part_roots WHERE company_id='company-jenfu'),
      'drawings',(SELECT count(*) FROM ai_pdm_core.drawings WHERE company_id='company-jenfu'),
      'audits',(SELECT count(*) FROM ai_pdm_core.audit_logs WHERE company_id='company-jenfu'))::text AS fingerprint`)).rows[0].fingerprint
    if (productionBefore !== productionAfter) throw new Error('DEV010_N1C_AUTHORITY_PRODUCTION_FINGERPRINT_CHANGED')
    await client.query('COMMIT')
    const result = { status: 'PASS', target: TARGET, sourceRevision, steps, before, after, productionBefore, productionAfter }
    process.stdout.write(`DEV010_N1C_AUTHORITY=${JSON.stringify(result)}\n`)
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

module.exports = { TARGET, assertStagingAuthorityEnvironment, main, planAuthorityTransition, projectAuthority }

if (process.env.DEV010_N1C_AUTHORITY_EXECUTE === '1') {
  main().catch((error) => {
    process.stderr.write(`DEV010_N1C_AUTHORITY_ERROR=${error.stack || error}\n`)
    process.exitCode = 1
  })
}
