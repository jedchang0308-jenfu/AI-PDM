import assert from 'node:assert/strict'
import test from 'node:test'
import { createDev126LocalResetRuntimeTargetReader } from './dev126-local-reset-runtime-target.mjs'

const environment = { NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1',
  JENFU_LOCAL_SANDBOX_ID: 'dev126-reader', JENFU_LOCAL_SANDBOX_ORIGIN: 'http://localhost:12020',
  JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://localhost:12000', JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
  JENFU_LOCAL_SANDBOX_DATABASE_URL: 'postgresql://local_pdm_runtime:fake-only@127.0.0.1:5432/jenfu_local_dev126_reader',
  JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_pdm_runtime' }
const input = { target: { sandboxId: 'dev126-reader', databaseName: 'jenfu_local_dev126_reader' },
  expectedDatabase: { runtimeRole: 'local_pdm_runtime', databaseName: 'jenfu_local_dev126_reader' } }
function harness(overrides = {}) {
  const calls = []
  let opened = 0
  const metadata = { application_id: 'ai-pdm', sandbox_id: 'dev126-reader', database_name: input.target.databaseName,
    sandbox_root: 'owned-root', data_directory: 'owned-data', repository_directory: 'owned-repository',
    generation: '00000000-0000-4000-8000-000000000126', fixture_version: 'fixture.v2', fixture_hash: 'f'.repeat(64),
    native_session_contract_version: 'jenfu.ai-pdm-session.v2', target_fingerprint: 'a'.repeat(64), status: 'ready' }
  class Pool {
    constructor() { opened++ }
    async connect() { return { release() { calls.push('release') }, async query(sql) {
      calls.push(sql)
      if (sql.includes('FROM pg_catalog.pg_roles')) return { rows: [{ database_name: input.target.databaseName,
        current_user: 'local_pdm_runtime', session_user: 'local_pdm_runtime', server_address: '127.0.0.1',
        server_port: 5432, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false,
        owns_schema: false, ...overrides }] }
      if (sql.includes('FROM ai_pdm_core.local_sandbox_target_metadata')) return { rows: [metadata] }
      return { rows: [] }
    } } }
    async end() { calls.push('end') }
  }
  return { Pool, calls, opened: () => opened, metadata }
}
test('observes the actual runtime identity and metadata in a read-only snapshot', async () => {
  const h = harness()
  const value = await createDev126LocalResetRuntimeTargetReader({ environment, Pool: h.Pool }).readCurrentTarget(input)
  assert.equal(value.connection.currentUser, 'local_pdm_runtime')
  assert.equal(value.targetMetadata.targetFingerprint, h.metadata.target_fingerprint)
  assert.equal(h.calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.ok(h.calls.includes('COMMIT'))
  assert.equal(h.calls.at(-1), 'end')
  assert.equal(h.calls.some(sql => /^(INSERT|UPDATE|DELETE|TRUNCATE)/u.test(sql)), false)
})
test('an owner-capable login or mismatched observed endpoint cannot become runtime evidence', async () => {
  for (const overrides of [{ owns_schema: true }, { rolsuper: true }, { current_user: 'jenfu_ai_pdm_migrator' },
    { server_port: 5433 }, { server_address: '10.0.0.8' }]) {
    const h = harness(overrides)
    await assert.rejects(createDev126LocalResetRuntimeTargetReader({ environment, Pool: h.Pool }).readCurrentTarget(input),
      { code: 'dev126_reset_runtime_target_invalid' })
    assert.ok(h.calls.includes('ROLLBACK'))
    assert.equal(h.calls.some(sql => sql.includes('FROM ai_pdm_core.local_sandbox_target_metadata')), false)
  }
})
test('target drift is rejected before opening any database connection', async () => {
  const h = harness()
  await assert.rejects(createDev126LocalResetRuntimeTargetReader({ environment, Pool: h.Pool }).readCurrentTarget({
    ...input, target: { ...input.target, databaseName: 'jenfu_local_some_other_task' } }),
    { code: 'dev126_reset_runtime_target_invalid' })
  assert.equal(h.opened(), 0)
})
