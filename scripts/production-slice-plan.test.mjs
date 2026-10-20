import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyProductionPath, createProductionSlicePlan, normalizeChangedPath } from './lib/production-slice-plan.mjs'

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

test('shared release control and unknown paths fail closed to the full gate', () => {
  for (const file of ['.github/workflows/ci.yml', 'scripts/plan-production-slice.mjs', 'scripts/unclassified-new-control.mjs']) {
    const plan = createProductionSlicePlan([file])
    assert.equal(plan.classification, 'FULL', file)
    assert.ok(Object.entries(plan.gates).filter(([gate]) => gate !== 'documentation').every(([, enabled]) => enabled), file)
  }
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
