import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertDailyReleaseMode,
  classifyFailureFamily,
  classifyReleaseMode,
  evaluateRepeatedFailure,
  normalizeReleaseEvidence,
  profileForReleaseMode,
  requiresPrincipalOnlyMigrationFence,
  requiresPrincipalOnlyRuntimeAuthority,
} from './lib/dev117-release-control-policy.mjs'

const intent = {
  sourceRevision: 'a'.repeat(40),
  sourceSha256: 'b'.repeat(64),
  migrationManifestSha256: 'c'.repeat(64),
  deadlineAt: '2999-01-01T00:00:00.000Z',
}
const source = { sourceRevision: intent.sourceRevision, sourceSha256: intent.sourceSha256, migrationRunnerRevision: 'd'.repeat(40) }
const receipts = Object.fromEntries(['sourceLock', 'authorization', 'readiness', 'foundation', 'infra', 'runtimeConfig'].map(name => [name, {
  schemaVersion: `${name}.v1`, evidenceScope: name === 'infra' ? 'PRODUCTION_PROVIDER_REUSE' : 'PRODUCTION_BOUND', releaseAuthority: true, status: 'PASS', expiresAt: intent.deadlineAt,
}]))

test('daily full release accepts only ordinary modes and classifies special paths explicitly', () => {
  assert.equal(classifyReleaseMode({ intent }), 'full_release')
  assert.equal(classifyReleaseMode({ intent: { ...intent, programOnlyBaseline: {} } }), 'program_only')
  assert.equal(classifyReleaseMode({ intent: { ...intent, principalOnlyRecovery: {} } }), 'principal_only')
  const applied = { ...intent, principalOnlyRecovery: {}, principalOnlyFenceRef: {}, appliedMigrationContinuation: {} }
  assert.equal(classifyReleaseMode({ intent: applied }), 'special_recovery')
  assert.equal(requiresPrincipalOnlyMigrationFence(applied), false)
  assert.equal(requiresPrincipalOnlyRuntimeAuthority(applied), false)
  assert.equal(requiresPrincipalOnlyMigrationFence({ ...intent, principalOnlyRecovery: {}, principalOnlyFenceRef: {} }), true)
  assert.equal(requiresPrincipalOnlyRuntimeAuthority({ ...intent, principalOnlyRecovery: {}, principalOnlyFenceRef: {} }), true)
  assert.equal(classifyReleaseMode({ intent, executionMode: 'build_only' }), 'build_only')
  assert.throws(() => assertDailyReleaseMode({ mode: 'program_only', workflowRef: 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-independent-production.yml@refs/heads/main' }), /SPECIAL_RELEASE_MODE_OUTSIDE_DAILY_PATH/u)
  const requiredWorkflowRef = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-independent-production.yml@refs/heads/main'
  assert.throws(() => assertDailyReleaseMode({ mode: 'full_release', workflowRef: '', requiredWorkflowRef }), /DAILY_RELEASE_WORKFLOW_CONTEXT_INVALID/u)
  assert.throws(() => assertDailyReleaseMode({ mode: 'full_release', workflowRef: requiredWorkflowRef.replace('/main', '/feature'), requiredWorkflowRef }), /DAILY_RELEASE_WORKFLOW_CONTEXT_INVALID/u)
})

test('ordinary releases keep cutover history without consuming raw cutover receipts', () => {
  const profile = { dataCutover: { gateMode: 'CUTOVER_OR_LIVE_AUTHORITY', postLiveCleanupRequired: true } }
  assert.equal(profileForReleaseMode(profile, 'one_time_cutover'), profile)
  assert.equal(profileForReleaseMode(profile, 'full_release').dataCutover.gateMode, 'HISTORICAL_ONLY')
  assert.equal(profileForReleaseMode(profile, 'special_recovery').dataCutover.postLiveCleanupRequired, true)
})

test('one normalized model owns source, scope, deadline and migration disposition', () => {
  const model = normalizeReleaseEvidence({ intent, source, receipts, migration: { status: 'PASS', sourceRevision: intent.sourceRevision, manifestSha256: intent.migrationManifestSha256 }, now: '2026-10-21T00:00:00.000Z' })
  assert.equal(model.schemaVersion, 'jenfu.dev117.release-evidence.v1')
  assert.equal(model.mode, 'full_release')
  assert.equal(model.source.applicationRevision, intent.sourceRevision)
  assert.equal(model.migration.status, 'PASS')
  assert.equal(model.receipts.infra.evidenceScope, 'PRODUCTION_PROVIDER_REUSE')
  assert.throws(() => normalizeReleaseEvidence({ intent: { ...intent, sourceSha256: 'e'.repeat(64) }, source, receipts, now: '2026-10-21T00:00:00.000Z' }), /RELEASE_EVIDENCE_SOURCE_JOIN_INVALID/u)
})

test('the second failure in the same family requests AI COO review without becoming a release gate', () => {
  assert.equal(classifyFailureFamily('CHAIN_SOURCE_HASH_MISMATCH'), 'SOURCE_LINEAGE')
  assert.deepEqual(evaluateRepeatedFailure([], 'CHAIN_SOURCE_HASH_MISMATCH'), { family: 'SOURCE_LINEAGE', occurrences: 1, limit: 2, action: 'CONTINUE' })
  assert.deepEqual(evaluateRepeatedFailure([{ code: 'OPENSWX_SOURCE_JOIN_INVALID' }], 'CHAIN_SOURCE_HASH_MISMATCH'), {
    family: 'SOURCE_LINEAGE', occurrences: 2, limit: 2, action: 'TRIGGER_AI_COO_REVIEW',
  })
})
