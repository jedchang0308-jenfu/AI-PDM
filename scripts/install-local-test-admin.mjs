import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

// This owner entrypoint installs only the two fixed PDM local-test migrations.
// It never initializes a database or takes a caller-entered SQL/migration path.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paths = ['db/postgres/098_dev126_local_test_admin.sql', 'db/postgres/099_dev126_local_test_admin_policy.sql']
const args = process.argv.slice(2)
assert.ok(args.length === 0 || args.length === 1 && args[0] === '--install', 'LOCAL_TEST_ADMIN_ARGUMENTS_INVALID')
assert.ok(process.env.NODE_ENV !== 'production' && !['K_SERVICE','K_REVISION','FUNCTION_TARGET','FUNCTION_NAME','FIREBASE_CONFIG']
  .some(key => process.env[key]), 'LOCAL_TEST_ADMIN_DEVELOPMENT_REQUIRED')
const sandboxRoot = process.env.JENFU_LOCAL_SANDBOX_ROOT
assert.ok(sandboxRoot && path.isAbsolute(sandboxRoot), 'JENFU_LOCAL_SANDBOX_ROOT_REQUIRED')
const profilePath = path.join(sandboxRoot, 'control', 'ai-pdm-runtime.json')
for (const candidate of [sandboxRoot, path.dirname(profilePath), profilePath]) {
  const stat = await lstat(candidate)
  assert.ok(!stat.isSymbolicLink() && path.resolve(candidate).toLowerCase() === (await realpath(candidate)).toLowerCase(),
    'LOCAL_TEST_ADMIN_PROFILE_LINK_FORBIDDEN')
}
assert.ok((await lstat(profilePath)).size <= 64 * 1024, 'LOCAL_TEST_ADMIN_PROFILE_INVALID')
let profile
try { profile = JSON.parse(await readFile(profilePath, 'utf8')) }
catch { throw new Error('LOCAL_TEST_ADMIN_PROFILE_INVALID') }
assert.equal(profile.applicationId, 'ai-pdm')
assert.match(profile.sandboxId, /^[a-z][a-z0-9-]{2,63}$/u)
assert.equal(path.resolve(profile.sandboxRoot).toLowerCase(), path.resolve(sandboxRoot).toLowerCase())
let endpoint, runtimeEndpoint
try {
  assert.ok(process.env.PDM_LOCAL_TEST_ADMIN_INSTALL_URL)
  endpoint = new URL(process.env.PDM_LOCAL_TEST_ADMIN_INSTALL_URL)
  runtimeEndpoint = new URL(profile.databaseUrl)
} catch { throw new Error('LOCAL_TEST_ADMIN_INSTALL_URL_REQUIRED_OR_INVALID') }
assert.ok(['postgres:','postgresql:'].includes(endpoint.protocol) && ['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname),
  'LOCAL_TEST_ADMIN_INSTALL_TARGET_INVALID')
assert.equal(endpoint.username, 'postgres', 'LOCAL_TEST_ADMIN_LOCAL_OWNER_REQUIRED')
assert.ok(!endpoint.search && !endpoint.hash && endpoint.hostname === runtimeEndpoint.hostname &&
  (endpoint.port || '5432') === (runtimeEndpoint.port || '5432') && endpoint.pathname === runtimeEndpoint.pathname,
  'LOCAL_TEST_ADMIN_PROFILE_TARGET_MISMATCH')
assert.equal(endpoint.pathname, '/jenfu_local_' + profile.sandboxId.replaceAll('-', '_'))

const connect = async () => {
  const client = new Client({ connectionString: endpoint.href, connectionTimeoutMillis: 5000,
    statement_timeout: 10000, application_name: 'ai-pdm-local-test-admin-install' })
  await client.connect()
  return client
}
const client = await connect()
try {
  const { rows: [target] } = await client.query(`SELECT target.*,current_user AS owner,
    host(inet_server_addr()) AS server_address,
    pg_catalog.shobj_description(db.oid,'pg_database') AS marker
    FROM ai_pdm_core.local_sandbox_target_metadata target
    JOIN pg_catalog.pg_database db ON db.datname=current_database()
    WHERE target.application_id='ai-pdm' AND target.sandbox_id=$1
      AND target.database_name=current_database()`, [profile.sandboxId])
  assert.ok(target && target.owner === 'postgres' && target.status === 'ready' &&
    ['127.0.0.1','::1'].includes(target.server_address), 'LOCAL_TEST_ADMIN_READY_TARGET_REQUIRED')
  assert.equal(target.marker, `jenfu.local-principal-bootstrap.v1:${profile.sandboxId}:${target.generation}`)
  for (const [column, field] of [['sandbox_root','sandboxRoot'],['data_directory','dataDirectory'],['repository_directory','repositoryDirectory']]) {
    assert.equal(path.resolve(target[column]).toLowerCase(), path.resolve(profile[field]).toLowerCase())
  }
  const receiptExists = async () => (await client.query(`SELECT to_regclass('ai_pdm_core.local_test_admin_install_receipts') IS NOT NULL AS present`)).rows[0].present
  const results = []
  for (const migrationPath of paths) {
    const source = await readFile(path.join(root, migrationPath), 'utf8')
    const checksum = createHash('sha256').update(source).digest('hex')
    const prior = await receiptExists() ? (await client.query(`SELECT source_sha256 FROM ai_pdm_core.local_test_admin_install_receipts WHERE migration_path=$1`, [migrationPath])).rows[0] : null
    if (prior) {
      assert.equal(prior.source_sha256, checksum, 'LOCAL_TEST_ADMIN_INSTALLED_SOURCE_MISMATCH')
      results.push({ path: migrationPath, state: 'already_installed' })
      continue
    }
    if (!args.includes('--install')) {
      results.push({ path: migrationPath, state: 'planned' })
      continue
    }
    // Only remove the verified file's outer transaction; the source and its
    // receipt commit together, including when the connection loses its reply.
    assert.equal((source.match(/^BEGIN;\r?$/gmu) ?? []).length, 1)
    assert.equal((source.match(/^COMMIT;\r?$/gmu) ?? []).length, 1)
    const body = source.replace(/^BEGIN;\r?\n/mu, '').replace(/^COMMIT;\s*$/mu, '')
    await client.query('BEGIN')
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS ai_pdm_core.local_test_admin_install_receipts(
        migration_path text PRIMARY KEY,source_sha256 char(64) NOT NULL,installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
        ALTER TABLE ai_pdm_core.local_test_admin_install_receipts OWNER TO jenfu_ai_pdm_migrator;
        REVOKE ALL ON ai_pdm_core.local_test_admin_install_receipts FROM PUBLIC,jenfu_ai_pdm_runtime`)
      await client.query(body)
      await client.query('RESET ROLE')
      await client.query(`INSERT INTO ai_pdm_core.local_test_admin_install_receipts(migration_path,source_sha256) VALUES($1,$2)`, [migrationPath, checksum])
      await client.query('COMMIT')
      results.push({ path: migrationPath, state: 'installed' })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      // Do not replay an uncertain write. A fresh owner connection may only
      // establish whether the same immutable receipt was committed.
      let readback
      try { readback = await connect() } catch (readbackError) {
        throw new AggregateError([error,readbackError], 'LOCAL_TEST_ADMIN_COMMIT_READBACK_UNAVAILABLE')
      }
      try {
        let record
        try {
          record = (await readback.query(`SELECT source_sha256 FROM ai_pdm_core.local_test_admin_install_receipts WHERE migration_path=$1`, [migrationPath])).rows[0]
        } catch { throw error }
        if (record?.source_sha256 !== checksum) throw error
        results.push({ path: migrationPath, state: 'committed_readback' })
      } finally { await readback.end() }
    }
  }
  console.log(JSON.stringify({ status: args.includes('--install') ? 'installed' : 'planned', migrations: results }))
} finally { await client.end() }
