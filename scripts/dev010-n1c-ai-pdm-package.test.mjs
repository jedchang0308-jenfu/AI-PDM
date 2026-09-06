import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertN1cAiPdmTarget, buildAiPdmPackage, deriveAiPdmMigration, loadN1cAiPdmConfig } from './dev010-n1c-ai-pdm-package.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadN1cAiPdmConfig()
const environment = {
  PDM_DEPLOYMENT_ENV: 'staging',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-nonprod',
  GOOGLE_CLOUD_REGION: 'asia-east1',
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
  PDM_CLOUD_SQL_DATABASE: 'jenfu_stg',
  PDM_CLOUD_SQL_USER: 'dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam',
  PDM_DATABASE_ENVIRONMENT_MARKER: 'JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C',
}

test('N1C-AI-01 target guard rejects dev, production, old staging, and runtime login for migration', () => {
  assert.equal(assertN1cAiPdmTarget(environment).status, 'PASS')
  assert.throws(() => assertN1cAiPdmTarget({ ...environment, PDM_CLOUD_SQL_DATABASE: 'jenfu_dev' }), /DEV010_N1C_AI_PDM_WRONG_TARGET/u)
  assert.throws(() => assertN1cAiPdmTarget({ ...environment, GOOGLE_CLOUD_PROJECT: 'jenfu-ai-pdm-prod' }), /DEV010_N1C_AI_PDM_WRONG_TARGET/u)
  assert.throws(() => assertN1cAiPdmTarget({ ...environment, GOOGLE_CLOUD_PROJECT: 'jenfu-ai-pdm-stg-361825' }), /DEV010_N1C_AI_PDM_WRONG_TARGET/u)
  assert.throws(() => assertN1cAiPdmTarget({ ...environment, PDM_CLOUD_SQL_USER: config.target.runtimeLogin }), /DEV010_N1C_AI_PDM_WRONG_TARGET/u)
})

test('N1C-AI-02 package fixes 063 before 062 and excludes retired 054', () => {
  const value = buildAiPdmPackage(config)
  assert.deepEqual(value.entries.map((entry) => path.basename(entry.sourcePath).slice(0, 3)), ['001', '003', '042', '047', '048', '049', '050', '051', '052', '053', '055', '056', '063', '062'])
  assert.ok(value.entries.findIndex((entry) => entry.sourcePath.includes('/063_')) < value.entries.findIndex((entry) => entry.sourcePath.includes('/062_')))
  assert.ok(!value.entries.some((entry) => entry.sourcePath.includes('/054_')))
  assert.equal(value.manifest.sourceTraceOnly.path, 'db/postgres/002_supabase_rls_plan.sql')
})

test('N1C-AI-03 every derived output is content-addressed and transaction-owned by the runner', () => {
  const value = buildAiPdmPackage(config)
  for (const entry of value.entries) {
    assert.match(entry.sourceSha256, /^[0-9a-f]{64}$/u)
    assert.match(entry.outputSha256, /^[0-9a-f]{64}$/u)
    assert.doesNotMatch(entry.sql, /^BEGIN;|\nCOMMIT;\s*$/u)
  }
  const roleCatalog = value.entries.find((entry) => entry.sourcePath.includes('/055_'))
  assert.ok(roleCatalog)
  assert.doesNotMatch(roleCatalog.sql, /jenfu_platform_migrator/u)
  assert.match(roleCatalog.sql, /jenfu_ai_pdm_migrator/u)
})

test('N1C-AI-04 062 derived output grants only read access to the OrgMaster migrator role', () => {
  const boundary = buildAiPdmPackage(config).entries.at(-1)
  assert.match(boundary.sql, /GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator/u)
  assert.match(boundary.sql, /GRANT SELECT ON TABLE ai_pdm_contract\.v_application_role_catalog_v1, ai_pdm_contract\.v_contract_manifest_v1 TO jenfu_orgmaster_migrator/u)
  assert.doesNotMatch(boundary.sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE|CREATE)[^;]+jenfu_orgmaster_migrator/u)
})

test('N1C-AI-05 malformed mixed transaction envelope fails closed', () => {
  assert.throws(() => deriveAiPdmMigration('db/postgres/001_bad.sql', 'BEGIN;\nSELECT 1;'), /DEV010_N1C_AI_PDM_TRANSACTION_SHAPE_MISMATCH/u)
})

test('N1C-AI-06 fixture is synthetic, attachment-free, and not cleanup-dependent', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'dev-010', 'n1c', 'fixtures', 'ai-pdm-staging-v1.json'), 'utf8'))
  assert.equal(fixture.tenantId, 'company-staging-smoke')
  assert.equal(fixture.productionRows, 0)
  assert.equal(fixture.credentials, 0)
  assert.equal(fixture.attachmentsAllowed, false)
  assert.equal(fixture.externalDeliveries, 0)
  assert.equal(fixture.cleanupRequiredForPass, false)
})

test('N1C-AI-07 fresh replay uses the foundation scratch schema and leaves public closed', () => {
  const value = buildAiPdmPackage()
  for (const entry of value.entries) {
    assert.doesNotMatch(entry.sql, /\bpublic\./u)
    assert.doesNotMatch(entry.sql, /CREATE SCHEMA IF NOT EXISTS ai_pdm_contract|ALTER SCHEMA ai_pdm_contract OWNER/u)
  }
  const boundary = value.entries.find((entry) => entry.sourcePath.includes('/062_'))
  assert.ok(boundary)
  assert.match(boundary.sql, /DROP SCHEMA ai_pdm_legacy_stage;/u)
})
