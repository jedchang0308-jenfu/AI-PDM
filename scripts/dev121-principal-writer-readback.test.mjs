import assert from 'node:assert/strict'
import test from 'node:test'
import { readPrincipalOnlyWriterSessions } from '../src/lib/jenfu-principal-only-writer-readback.ts'

function database(row) {
  const calls = []
  const snapshot = {
    execute: async (sql) => { calls.push(sql) },
    query: async (sql, params) => { calls.push({ sql, params }); return [row] },
  }
  return {
    calls,
    kind: 'postgres',
    transaction: async (fn, options) => {
      calls.push(options)
      return fn(snapshot)
    },
  }
}

test('writer readback uses a read-only owner snapshot and names only AI-PDM logins', async () => {
  const input = database({ runtime_sessions: 0, migrator_sessions: 0,
    hidden_sessions: 0, active_transactions: 0, non_idle_sessions: 0 })
  const result = await readPrincipalOnlyWriterSessions(input)
  assert.equal(result.ownerLoginSessionsAbsent, true)
  assert.deepEqual(input.calls[0], { isolationLevel: 'repeatable_read', readOnly: true })
  assert.equal(input.calls[1], 'SET LOCAL ROLE jenfu_ai_pdm_migrator')
  assert.deepEqual(input.calls[2].params, {
    runtime: 'aipdm-prod-runtime@jenfu-platform-prod.iam',
    migrator: 'aipdm-prod-migrator@jenfu-platform-prod.iam'
  })
  assert.match(input.calls[2].sql, /pg_catalog\.pg_stat_activity/u)
  assert.match(input.calls[2].sql, /pid<>pg_backend_pid\(\)/u)
})

test('writer readback never calls present sessions absent or hides unknown state', async () => {
  for (const row of [
    { runtime_sessions: 1, migrator_sessions: 0, hidden_sessions: 0,
      active_transactions: 0, non_idle_sessions: 0 },
    { runtime_sessions: 0, migrator_sessions: 1, hidden_sessions: 1,
      active_transactions: 0, non_idle_sessions: 1 },
  ]) {
    assert.equal((await readPrincipalOnlyWriterSessions(database(row))).ownerLoginSessionsAbsent, false)
  }
  await assert.rejects(readPrincipalOnlyWriterSessions(database({
    runtime_sessions: 0, migrator_sessions: 0, hidden_sessions: 1,
    active_transactions: 0, non_idle_sessions: 0
  })), /principal_only_writer_readback_invalid/u)
  await assert.rejects(readPrincipalOnlyWriterSessions(database({
    runtime_sessions: null, migrator_sessions: 0, hidden_sessions: 0,
    active_transactions: 0, non_idle_sessions: 0
  })), /principal_only_writer_readback_invalid/u)
  await assert.rejects(readPrincipalOnlyWriterSessions({ kind: 'sqlite' }),
    /principal_only_writer_readback_invalid/u)
})
