import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyProductionPath, createProductionSlicePlan, isRdPermissionDatabasePath, normalizeChangedPath } from './lib/production-slice-plan.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('normalizes Windows paths before classification', () => {
  assert.equal(normalizeChangedPath('.\\src\\lib\\permissions.ts'), 'src/lib/permissions.ts')
})

test('documentation-only changes keep product gates closed', () => {
  const plan = createProductionSlicePlan(['AGENTS.md', '.ai-doc/documentation_map.md'])
  assert.equal(plan.classification, 'DOCUMENTATION_ONLY')
  assert.equal(plan.gates.planner, true)
  assert.equal(plan.gates.application, false)
  assert.equal(plan.gates.worker, false)
  assert.equal(plan.gates.database, false)
  assert.deepEqual(plan.releasePhases, [])
  assert.deepEqual(plan.evidenceRequirements, ['documentation-contract'])
})

test('RD catalog and migration route their explicit responsibilities without worker history', () => {
  const plan = createProductionSlicePlan([
    'config/access-control/jenfu-role-catalog.v7.json',
    'db/postgres/085_dev121_principal_role_catalog_v7.sql',
    'src/lib/jenfu-rd-capabilities.ts',
  ])
  assert.equal(plan.classification, 'AFFECTED_SLICES')
  assert.equal(plan.gates.authorization, true)
  assert.equal(plan.gates.database, true)
  assert.equal(plan.gates.migration, true)
  assert.equal(plan.gates.nativePostgres, true)
  assert.equal(plan.gates.application, true)
  assert.equal(plan.gates.worker, false)
  assert.equal(plan.gates.preview, false)
  assert.equal(plan.gates.releaseCore, false)
  assert.ok(plan.releasePhases.includes('migrate-if-needed'))
})

test('RD database regressions are selected only for the RD permission evidence boundary', () => {
  assert.equal(isRdPermissionDatabasePath('db/postgres/085_dev121_principal_role_catalog_v7.sql'), true)
  assert.equal(isRdPermissionDatabasePath('scripts/lib/dev122-applied-migration-continuation.mjs'), true)
  assert.equal(isRdPermissionDatabasePath('scripts/dev122-rd-permission-ledger-readback.test.mjs'), true)
  assert.equal(isRdPermissionDatabasePath('db/postgres/086_unrelated_business_feature.sql'), false)
})

test('authorization-only changes do not imply database or migration work', () => {
  const plan = createProductionSlicePlan(['config/access-control/jenfu-role-catalog.v7.json'])
  assert.equal(plan.gates.authorization, true)
  assert.equal(plan.gates.application, true)
  assert.equal(plan.gates.database, false)
  assert.equal(plan.gates.dbBoundary, false)
  assert.equal(plan.gates.nativePostgres, false)
  assert.equal(plan.gates.migration, false)
  assert.deepEqual(plan.releasePhases, ['preflight', 'build', 'candidate-smoke', 'activate-readback'])
  assert.deepEqual(plan.evidenceRequirements, ['actor-grant-allow-deny'])
})

test('PDF preview remains independent from worker and authorization gates', () => {
  const plan = createProductionSlicePlan(['src/components/pdf-document-viewport.tsx'])
  assert.equal(plan.gates.preview, true)
  assert.equal(plan.gates.application, true)
  assert.equal(plan.gates.worker, false)
  assert.equal(plan.gates.authorization, false)
  assert.equal(plan.gates.database, false)
  assert.equal(plan.gates.desktopUi, true)
  assert.equal(plan.gates.migration, false)
  assert.deepEqual(plan.evidenceRequirements, ['version-bytes-desktop'])
})

test('worker source selects worker evidence without unrelated app build', () => {
  const plan = createProductionSlicePlan(['scripts/lib/openswx-reader/reader.cc'])
  assert.equal(plan.gates.worker, true)
  assert.equal(plan.gates.releaseCore, false)
  assert.equal(plan.gates.application, false)
  assert.equal(plan.gates.database, false)
})

test('shared release control selects its own safety boundary without unrelated product gates', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    'scripts/plan-production-slice.mjs',
    'scripts/lib/dev121-owner-release-proof.mjs',
    'scripts/lib/dev121-preactivation-abort-continuation.mjs',
    'scripts/dev121-principal-owner-recovery.test.mjs',
    'scripts/dev122-applied-continuation-capsule-refresh.mjs',
  ]) {
    const plan = createProductionSlicePlan([file])
    assert.equal(plan.classification, 'AFFECTED_SLICES', file)
    assert.deepEqual(plan.slices, ['release-control'], file)
    assert.equal(plan.gates.releaseCore, true, file)
    for (const gate of ['application', 'authorization', 'database', 'preview', 'recognition', 'worker', 'infrastructure', 'abortController', 'dependencyAudit', 'lint', 'dbBoundary', 'nativePostgres', 'migration', 'isolatedBuild', 'desktopUi']) {
      assert.equal(plan.gates[gate], false, `${file}:${gate}`)
    }
  }
})

test('RD retry release-state changes do not inherit unrelated product gates', () => {
  const plan = createProductionSlicePlan([
    '.ai-doc/dev_task.md',
    '.ai-doc/specs/DEV-122-ai-pdm-internal-function-issues.md',
    'scripts/dev121-principal-owner-recovery.test.mjs',
    'scripts/dev122-applied-continuation-capsule-refresh.test.mjs',
    'scripts/lib/dev012-owner-prerequisite-producer.mjs',
    'scripts/lib/dev012-owner-stage-executor.mjs',
    'scripts/lib/dev121-preactivation-abort-continuation.mjs',
    'scripts/lib/dev122-applied-continuation-capsule-refresh.mjs',
  ])
  assert.equal(plan.classification, 'AFFECTED_SLICES')
  assert.deepEqual(plan.slices, ['documentation', 'release-control'])
  assert.equal(plan.gates.releaseCore, true)
  for (const gate of ['full', 'application', 'authorization', 'database', 'preview', 'recognition', 'worker', 'infrastructure', 'abortController', 'dependencyAudit', 'lint', 'dbBoundary', 'nativePostgres', 'migration', 'isolatedBuild', 'desktopUi']) {
    assert.equal(plan.gates[gate], false, gate)
  }
  assert.deepEqual(plan.evidenceRequirements, ['source-image-revision-traffic-rollback'])
})

test('only unknown paths retain the cross-product full fallback', () => {
  const plan = createProductionSlicePlan(['scripts/unclassified-new-control.mjs'])
  assert.equal(plan.classification, 'FULL')
  assert.ok(Object.entries(plan.gates).filter(([gate]) => gate !== 'documentation').every(([, enabled]) => enabled))
})

test('abort, dependency and build gates follow their own changed responsibility', () => {
  const abort = createProductionSlicePlan(['tools/dev-117/abort-controller/server.mjs'])
  assert.equal(abort.gates.releaseCore, true)
  assert.equal(abort.gates.abortController, true)
  assert.equal(abort.gates.application, false)
  const dependency = createProductionSlicePlan(['package-lock.json'])
  assert.equal(dependency.gates.releaseCore, true)
  assert.equal(dependency.gates.application, true)
  assert.equal(dependency.gates.dependencyAudit, true)
  assert.equal(dependency.gates.isolatedBuild, true)
})

test('required CI does not couple release control to unrelated product gates', () => {
  const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
  assert.match(source, /Reject high or critical production dependency findings[\s\S]*?if: steps\.slice\.outputs\.dependency_audit == 'true'/u)
  assert.match(source, /- name: Lint\s+if: steps\.slice\.outputs\.lint == 'true'/u)
  assert.match(source, /- name: Verify release and infrastructure slice\s+if: steps\.slice\.outputs\.infrastructure == 'true'/u)
  assert.match(source, /- name: Verify shared release package contracts\s+if: steps\.slice\.outputs\.infrastructure == 'true'/u)
  assert.match(source, /- name: Verify abort controller\s+if: steps\.slice\.outputs\.abort_controller == 'true'/u)
  const runner = fs.readFileSync(path.join(root, 'scripts/run-production-slice-tests.mjs'), 'utf8')
  assert.match(runner, /if \(plan\.gates\.releaseCore\) groups\.push/u)
  assert.doesNotMatch(runner, /profile === 'owner' \|\| plan\.gates\.releaseCore/u)
  assert.match(source, /steps\.slice\.outputs\.database == 'true'/u)
  assert.match(runner, /const RD_PERMISSION_DATABASE_TESTS = \[[\s\S]*dev122-rd-permission-ledger-readback\.test\.mjs[\s\S]*dev122-applied-migration-continuation\.test\.mjs/u)
  assert.match(runner, /plan\.files\.some\(isRdPermissionDatabasePath\)/u)
})

test('historical worker fixtures stay in the worker responsibility', () => {
  assert.deepEqual(classifyProductionPath('scripts/dev122-openswx-worker-artifact-reuse.test.mjs'), ['worker'])
})

test('runtime-copied management policy is application input, not docs-only', () => {
  const plan = createProductionSlicePlan(['.ai-doc/reference/pdm-management-policy-draft.md'])
  assert.equal(plan.gates.application, true)
  assert.equal(plan.classification, 'AFFECTED_SLICES')
})

test('DEV-122 self-use acceptance keeps 7/29 while exposing four focused capabilities', () => {
  const acceptance = JSON.parse(fs.readFileSync(path.join(root, '.ai-doc/specs/DEV-122-self-use-acceptance.v1.json'), 'utf8'))
  assert.equal(acceptance.originalAcceptance.isActiveAcceptanceDenominator, true)
  assert.equal(acceptance.originalAcceptance.issues, 7)
  assert.equal(acceptance.originalAcceptance.groups, 29)
  assert.equal(acceptance.capabilitiesDoNotReplaceOriginalDenominator, true)
  assert.equal(acceptance.activeCapabilities.length, 4)
  assert.equal(acceptance.activeCapabilities.flatMap(capability => capability.caseIds).length, 11)
  assert.equal(acceptance.gatePolicy.authorizationImpliesDatabase, false)
})

test('required CI owns affected-slice validation and protected workflows reuse exact results', () => {
  for (const file of [
    '.github/workflows/deploy-ai-pdm-independent-production.yml',
    '.github/workflows/deploy-ai-pdm-principal-migrations-production.yml',
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /test:production-slice:affected/u, file)
    assert.doesNotMatch(source, /npm run test:dev-117:continuous/u, file)
    assert.match(source, /checks: read/u, file)
    assert.match(source, /dev012-verify-official-source\.mjs/u, file)
    assert.match(source, /fetch-depth: 0/u, file)
  }
})

test('planner requests AI COO review for the second failure without adding a release gate', () => {
  const plan = createProductionSlicePlan(['scripts/lib/dev117-ai-pdm-continuous-release.mjs'], {
    failureHistory: [{ code: 'OPENSWX_SOURCE_JOIN_INVALID' }],
    currentFailureCode: 'CHAIN_SOURCE_HASH_MISMATCH',
  })
  assert.deepEqual(plan.failurePolicy, {
    family: 'SOURCE_LINEAGE',
    occurrences: 2,
    limit: 2,
    action: 'TRIGGER_AI_COO_REVIEW',
  })
})
