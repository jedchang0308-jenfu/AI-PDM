import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyProductionPath, createProductionSlicePlan, createProductionSliceTestGroups, normalizeChangedPath } from './lib/production-slice-plan.mjs'

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
  assert.ok(plan.releasePhases.includes('migrate-if-needed'))
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
  assert.equal(plan.gates.releaseCore, true)
  assert.equal(plan.gates.application, false)
  assert.equal(plan.gates.database, false)
})

test('shared release control selects its own safety boundary without unrelated product gates', () => {
  for (const file of ['.github/workflows/ci.yml', 'scripts/plan-production-slice.mjs', 'scripts/lib/dev121-owner-release-proof.mjs', 'scripts/dev122-applied-continuation-capsule-refresh.mjs']) {
    const plan = createProductionSlicePlan([file])
    assert.equal(plan.classification, 'AFFECTED_SLICES', file)
    assert.equal(plan.gates.releaseCore, true, file)
    for (const gate of ['application', 'authorization', 'database', 'preview', 'recognition', 'worker', 'infrastructure', 'abortController', 'dependencyAudit', 'lint', 'dbBoundary', 'nativePostgres', 'migration', 'isolatedBuild', 'desktopUi']) {
      assert.equal(plan.gates[gate], false, `${file}:${gate}`)
    }
  }
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
  const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').replaceAll('\r\n', '\n')
  for (const [name, gate] of [
    ['Reject high or critical production dependency findings', 'dependency_audit'], ['Lint', 'lint'],
    ['Verify release and infrastructure slice', 'infrastructure'], ['Verify shared release package contracts', 'infrastructure'],
    ['Verify abort controller', 'abort_controller'],
  ]) assert.ok(source.split(`- name: ${name}\n`)[1]?.split('\n')[0].includes(`steps.slice.outputs.${gate} == 'true'`), name)
  const runner = fs.readFileSync(path.join(root, 'scripts/run-production-slice-tests.mjs'), 'utf8')
  assert.match(runner, /const groups = plan\.testGroups/u)
  assert.doesNotMatch(runner, /profile === 'owner' \|\| plan\.gates\.releaseCore/u)
})

test('CI continues selected independent checks after a test failure but requires successful setup', () => {
  const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').replaceAll('\r\n', '\n')
  const checks = [...source.matchAll(/- name: ([^\n]+)\n(.*?)(?=\n      - name:|$)/gsu)]
  for (const [, name, body] of checks.filter(([, name]) => name.startsWith('Verify ') && !name.includes('routing'))) {
    const condition = body.match(/^        if: (.+)$/mu)?.[1]
    assert.ok(condition?.includes('!cancelled()'), name)
    assert.ok(condition.includes("steps.dependencies.outcome == 'success'"), name)
    assert.doesNotMatch(condition, /\bsuccess\(\)/u, name)
    assert.doesNotMatch(body, /continue-on-error:/u, name)
  }
  assert.match(source, /Preserve slice results including failures\n        if: \$\{\{ !cancelled\(\) \}\}/u)
})

test('planner selects explicit independent test groups with only the routing prerequisite', () => {
  const plan = createProductionSlicePlan(['scripts/dev012-example.mjs', 'config/access-control/test.json', 'db/postgres/999_test.sql'])
  const groups = createProductionSliceTestGroups(plan)
  assert.deepEqual(groups.map(group => group.name), ['planner', 'release-core', 'database', 'authorization'])
  assert.deepEqual(groups[0].dependsOn, [])
  assert.ok(groups.slice(1).every(group => JSON.stringify(group.dependsOn) === JSON.stringify(['planner'])))
  assert.deepEqual(createProductionSliceTestGroups(createProductionSlicePlan(['README.md'])).map(group => group.name), ['planner'])
  const full = createProductionSliceTestGroups(createProductionSlicePlan(['unclassified-input']), 'node --test scripts/first.test.mjs scripts/second.test.mjs')
  assert.deepEqual(full.map(group => group.tests), [['scripts/production-slice-plan.test.mjs'], ['scripts/first.test.mjs'], ['scripts/second.test.mjs']])
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
