import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV013_AI_PDM_FIXTURE_APPROVAL,
  DEV013_AI_PDM_FIXTURE_TARGET,
  assertDev013AiPdmFixtureEnvironment,
  buildDev013AiPdmFixture,
  readDev013AiPdmRoleCatalog,
  summarizeDev013AiPdmFixture,
  validateDev013AiPdmRoleCatalog,
} from './lib/dev013-ai-pdm-l3-fixture-bootstrap.mjs'

const uid = 'SyntheticUidDev013PBoth1234567890'

test('DEV-013 AI-PDM fixture is deterministic and least-privilege', () => {
  const first = buildDev013AiPdmFixture(uid)
  const second = buildDev013AiPdmFixture(uid)
  assert.equal(first.fixtureFingerprintSha256, second.fixtureFingerprintSha256)
  assert.equal(first.role, 'Engineer')
  assert.equal(first.companyId, 'company-dev013-l3')
  assert.equal(first.principalId, 'principal-dev013-p-both')
})

test('DEV-013 AI-PDM fixture binds the approved app-owned role catalog', () => {
  const catalog = readDev013AiPdmRoleCatalog()
  assert.equal(catalog.roles.length, 9)
  assert.equal(catalog.roles[0].stableRoleId, 'role-rd')
  assert.throws(() => validateDev013AiPdmRoleCatalog({ ...catalog, catalogSha256: '0'.repeat(64) }))
})

test('DEV-013 AI-PDM fixture environment rejects wrong lifecycle targets', () => {
  const env = {
    DEV013_L3_FIXTURE_APPROVAL: DEV013_AI_PDM_FIXTURE_APPROVAL,
    DEV013_TARGET_PROJECT_ID: DEV013_AI_PDM_FIXTURE_TARGET.projectId,
    DEV013_TARGET_REGION: DEV013_AI_PDM_FIXTURE_TARGET.region,
    DEV013_TARGET_CLOUD_SQL_INSTANCE: DEV013_AI_PDM_FIXTURE_TARGET.cloudSqlInstance,
    DEV013_TARGET_DATABASE: DEV013_AI_PDM_FIXTURE_TARGET.database,
    DEV013_DATABASE_USER: DEV013_AI_PDM_FIXTURE_TARGET.databaseUser,
    DEV013_FIXTURE_FIREBASE_UID: uid,
  }
  assert.equal(assertDev013AiPdmFixtureEnvironment(env).identitySubject, uid)
  assert.throws(() => assertDev013AiPdmFixtureEnvironment({ ...env, DEV013_TARGET_PROJECT_ID: 'jenfu-platform-prod' }), /DEV013_FIXTURE_TARGET_MISMATCH/u)
})

test('DEV-013 AI-PDM receipt excludes UID and email', () => {
  const fixture = buildDev013AiPdmFixture(uid)
  const receipt = summarizeDev013AiPdmFixture(fixture, { replayed: false, localAccountCount: 1, companyId: fixture.companyId, role: fixture.role, catalogCreated: true, catalogVersion: 'ai-pdm.role-catalog.2026-09-03.v3', catalogSha256: 'a'.repeat(64), catalogRoleCount: 9 })
  const serialized = JSON.stringify(receipt)
  assert.equal(serialized.includes(uid), false)
  assert.equal(serialized.includes(fixture.email), false)
  assert.equal(receipt.containsRawIdentity, false)
})
