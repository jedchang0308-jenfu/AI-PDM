import assert from 'node:assert/strict'
import test from 'node:test'
import { readPrincipalOnlyWriterSessions } from '../src/lib/jenfu-principal-only-writer-readback.ts'

function database(row, authority = [{id:1,mode:'canonical_only',expected_commit:'local-dev',schema_hash:'dev090-v1',row_version:1}]) {
  const calls = []
  const snapshot = {
    execute: async (sql) => { calls.push(sql) },
    query: async (sql, params) => { calls.push({ sql, params }); return sql.includes('pdm_workbench_state_authority_control') ? authority : [row] },
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

test('writer readback uses a read-only owner snapshot and includes unexpected AI-PDM role members', async () => {
  const input = database({ runtime_sessions: 0, migrator_sessions: 0,
    other_owner_sessions: 0, hidden_sessions: 0, active_transactions: 0,
    non_idle_sessions: 0 })
  const result = await readPrincipalOnlyWriterSessions(input)
  assert.equal(result.ownerWriterSessionsAbsent, true)
  assert.equal(result.schemaVersion, 'ai-pdm.principal-only-writer-readback.v2')
  assert.deepEqual(input.calls[0], { isolationLevel: 'repeatable_read', readOnly: true })
  assert.equal(input.calls[1], 'SET LOCAL ROLE jenfu_ai_pdm_migrator')
  assert.deepEqual(input.calls[2].params, {
    runtime: 'aipdm-prod-runtime@jenfu-platform-prod.iam',
    migrator: 'aipdm-prod-migrator@jenfu-platform-prod.iam'
  })
  assert.match(input.calls[2].sql, /pg_catalog\.pg_stat_activity/u)
  assert.doesNotMatch(input.calls[2].sql, /backend_type/u)
  assert.match(input.calls[2].sql, /pg_catalog\.pg_has_role\(usename,'jenfu_ai_pdm_runtime','MEMBER'\)/u)
  assert.match(input.calls[2].sql, /pg_catalog\.pg_has_role\(usename,'jenfu_ai_pdm_migrator','MEMBER'\)/u)
  assert.match(input.calls[2].sql, /pid<>pg_backend_pid\(\)/u)
})

test('writer readback never calls present sessions absent or hides unknown state', async () => {
  for (const row of [
    { runtime_sessions: 1, migrator_sessions: 0, hidden_sessions: 0,
      other_owner_sessions: 0, active_transactions: 0, non_idle_sessions: 0 },
    { runtime_sessions: 0, migrator_sessions: 1, hidden_sessions: 1,
      other_owner_sessions: 0, active_transactions: 0, non_idle_sessions: 1 },
    { runtime_sessions: 0, migrator_sessions: 0, other_owner_sessions: 1,
      hidden_sessions: 0, active_transactions: 0, non_idle_sessions: 0 },
  ]) {
    assert.equal((await readPrincipalOnlyWriterSessions(database(row))).ownerWriterSessionsAbsent, false)
  }
  await assert.rejects(readPrincipalOnlyWriterSessions(database({
    runtime_sessions: 0, migrator_sessions: 0, hidden_sessions: 1,
    other_owner_sessions: 0, active_transactions: 0, non_idle_sessions: 0
  })), /principal_only_writer_readback_invalid/u)
  await assert.rejects(readPrincipalOnlyWriterSessions(database({
    runtime_sessions: null, migrator_sessions: 0, hidden_sessions: 0,
    other_owner_sessions: 0, active_transactions: 0, non_idle_sessions: 0
  })), /principal_only_writer_readback_invalid/u)
  await assert.rejects(readPrincipalOnlyWriterSessions(database({
    runtime_sessions: 0, migrator_sessions: 0, other_owner_sessions: null,
    hidden_sessions: 0, active_transactions: 0, non_idle_sessions: 0
  })), /principal_only_writer_readback_invalid/u)
  await assert.rejects(readPrincipalOnlyWriterSessions({ kind: 'sqlite' }),
    /principal_only_writer_readback_invalid/u)
})

test('writer census reports persisted business authority without inferring readiness or changing it',async()=>{
  const row={runtime_sessions:0,migrator_sessions:0,other_owner_sessions:0,hidden_sessions:0,active_transactions:0,non_idle_sessions:0};
  const persisted={id:1,mode:'legacy_only',expected_commit:'historical',schema_hash:'old-schema',row_version:'4'};
  const result=await readPrincipalOnlyWriterSessions(database(row,[persisted]));
  assert.equal(result.ownerWriterSessionsAbsent,true);
  assert.deepEqual(result.workbenchAuthority,{mode:'legacy_only',expectedCommit:'historical',schemaHash:'old-schema',rowVersion:4});
  assert.equal((await readPrincipalOnlyWriterSessions(database(row,[]))).workbenchAuthority,null);
  await assert.rejects(readPrincipalOnlyWriterSessions(database(row,[persisted,persisted])),/principal_only_writer_readback_invalid/u);
})
