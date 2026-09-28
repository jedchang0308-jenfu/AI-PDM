import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { assertPrincipalOnlySourceReceipt } from './dev121-principal-only-source-receipt.mjs'

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const hashBytes = (value) => createHash('sha256').update(value).digest('hex')
const operationRef = 'gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/dev121/principal-inventory/source.json'
const operationSha256 = 'a'.repeat(64)
const sourceRevision = 'b'.repeat(40)

function fixture() {
  const selected = { pdmUserId: 'profile-1', companyId: 'company-1',
    lifecycleVersion: 2, systemRoleEnabled: true,
    markerStatus: 'legacy_compatible', markerPrincipalId: 'principal-1',
    markerRowVersion: 3 }
  const withheld = { pdmUserId: 'profile-2', companyId: 'company-1',
    lifecycleVersion: 1, systemRoleEnabled: false,
    markerStatus: 'missing', markerPrincipalId: null, markerRowVersion: 0 }
  const verified = { pdmUserId: 'profile-1', companyId: 'company-1',
    principalId: 'principal-1', employeeId: 'employee-1',
    identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod',
    identitySubject: 'firebase-subject-1', sourceKind: 'firebase_mapping',
    mappingVersion: 4, publishedAt: '2026-09-28T00:00:00.000Z',
    accountType: 'human_privileged', lifecycleVersion: 2,
    accountStatus: 'active', systemRoleEnabled: true,
    sessionInvalidBefore: null }
  const activeProfiles = [selected, withheld]
  const outcome = {
    contractVersion: 'ai-pdm.principal-only-cohort-source.v1',
    cohortHash: digest(['ai-pdm.principal-only-cohort.v1',
      activeProfiles.map((row) => row.pdmUserId)]),
    sourceHash: digest(['ai-pdm.principal-only-cohort-source.v1', activeProfiles,
      [verified.pdmUserId, verified.companyId, verified.principalId,
        verified.employeeId, verified.identityIssuer, verified.identitySubject,
        verified.sourceKind, verified.mappingVersion, verified.publishedAt,
        verified.accountType, verified.lifecycleVersion, verified.accountStatus,
        verified.systemRoleEnabled, verified.sessionInvalidBefore]]),
    verified, activeProfiles, withheld: [withheld]
  }
  return { schemaVersion: 'ai-pdm.principal-inventory-receipt.v1',
    operationId: 'DEV121-COHORT-SOURCE-TEST', mode: 'principal_only_source',
    sourceRevision, operationRef, operationSha256,
    operationGeneration: '42',
    target: { database: 'jenfu_prod',
      login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17 },
    outcome }
}

function validate(value, options = {}) {
  const bytes = Buffer.from(JSON.stringify(value))
  return assertPrincipalOnlySourceReceipt(value, {
    bytes, receiptSha256: hashBytes(bytes), receiptGeneration: '43',
    sourceRevision, operationRef, operationSha256, operationGeneration: '42',
    ...options
  })
}

test('accepts one verified profile and an exact withheld set', () => {
  const value = fixture()
  const result = validate(value)
  assert.equal(result.source.activeProfiles.length, 2)
  assert.equal(result.source.withheld.length, 1)
  assert.equal(result.source.cohortHash, value.outcome.cohortHash)
  assert.equal(result.source.sourceHash, value.outcome.sourceHash)
})

test('rejects receipt metadata, source and cohort drift before constructing an operation', () => {
  const changes = [
    (value) => { value.outcome.sourceHash = '0'.repeat(64) },
    (value) => { value.outcome.cohortHash = '0'.repeat(64) },
    (value) => { value.outcome.withheld = [] },
    (value) => { value.outcome.activeProfiles[1].pdmUserId = 'other-profile' },
    (value) => { value.outcome.verified.identitySubject = 'other-subject' },
    (value) => { value.outcome.verified.principalId = 'pdm:legacy' },
    (value) => { value.outcome.verified.accountType = 'service_account' },
    (value) => { value.target.database = 'jenfu_stg' },
    (value) => { value.extra = 'unreviewed' },
  ]
  for (const change of changes) {
    const value = fixture()
    change(value)
    assert.throws(() => validate(value), /DEV121_COHORT_SOURCE_RECEIPT_INVALID/u)
  }
  assert.throws(() => validate(fixture(), { receiptSha256: '0'.repeat(64) }),
    /DEV121_COHORT_SOURCE_RECEIPT_INVALID/u)
  assert.throws(() => validate(fixture(), { operationGeneration: '41' }),
    /DEV121_COHORT_SOURCE_RECEIPT_INVALID/u)
})

test('rejects a parsed value that differs from the immutable receipt bytes', () => {
  const original = fixture()
  const bytes = Buffer.from(JSON.stringify(original))
  const substituted = fixture()
  substituted.operationId = 'DEV121-COHORT-SOURCE-OTHER'
  assert.throws(() => assertPrincipalOnlySourceReceipt(substituted, {
    bytes, receiptSha256: hashBytes(bytes), receiptGeneration: '43',
    sourceRevision, operationRef, operationSha256, operationGeneration: '42'
  }), /DEV121_COHORT_SOURCE_RECEIPT_INVALID/u)
})
