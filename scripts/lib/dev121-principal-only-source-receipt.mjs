import { createHash } from 'node:crypto'
import { sha256 } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const GENERATION = /^[1-9][0-9]*$/u
const SOURCE_CONTRACT = 'ai-pdm.principal-only-cohort-source.v1'

function fail() { throw new Error('DEV121_COHORT_SOURCE_RECEIPT_INVALID') }
function keys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}
function id(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function exactProfile(value) {
  if (!keys(value, ['pdmUserId', 'companyId', 'lifecycleVersion',
    'systemRoleEnabled', 'markerStatus', 'markerPrincipalId', 'markerRowVersion']) ||
    !id(value.pdmUserId) || !id(value.companyId) ||
    !Number.isSafeInteger(value.lifecycleVersion) || value.lifecycleVersion < 1 ||
    typeof value.systemRoleEnabled !== 'boolean' ||
    !['missing', 'legacy_compatible'].includes(value.markerStatus) ||
    !Number.isSafeInteger(value.markerRowVersion) || value.markerRowVersion < 0 ||
    (value.markerStatus === 'missing'
      ? value.markerPrincipalId !== null || value.markerRowVersion !== 0
      : !id(value.markerPrincipalId) || value.markerRowVersion < 1)) fail()
  return {
    pdmUserId: value.pdmUserId, companyId: value.companyId,
    lifecycleVersion: value.lifecycleVersion,
    systemRoleEnabled: value.systemRoleEnabled,
    markerStatus: value.markerStatus,
    markerPrincipalId: value.markerPrincipalId,
    markerRowVersion: value.markerRowVersion,
  }
}
function exactVerified(value, selected, firebaseProjectId) {
  if (!keys(value, ['pdmUserId', 'companyId', 'principalId', 'employeeId',
    'identityIssuer', 'identitySubject', 'sourceKind', 'mappingVersion',
    'publishedAt', 'accountType', 'lifecycleVersion', 'accountStatus',
    'systemRoleEnabled', 'sessionInvalidBefore']) ||
    ![value.pdmUserId, value.companyId, value.principalId, value.employeeId,
      value.identitySubject].every(id) ||
    value.pdmUserId !== selected.pdmUserId ||
    value.companyId !== selected.companyId ||
    value.identityIssuer !== `https://securetoken.google.com/${firebaseProjectId}` ||
    value.sourceKind !== 'firebase_mapping' ||
    !Number.isSafeInteger(value.mappingVersion) || value.mappingVersion < 1 ||
    !Number.isSafeInteger(value.lifecycleVersion) ||
    value.lifecycleVersion !== selected.lifecycleVersion ||
    value.accountStatus !== 'active' || value.systemRoleEnabled !== true ||
    selected.systemRoleEnabled !== true ||
    (selected.markerStatus === 'legacy_compatible' &&
      selected.markerPrincipalId !== value.principalId) ||
    value.principalId.startsWith('pdm:') ||
    !['human_personal', 'human_privileged'].includes(value.accountType) ||
    typeof value.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.publishedAt)) ||
    value.sessionInvalidBefore !== null &&
      (typeof value.sessionInvalidBefore !== 'string' ||
        !Number.isFinite(Date.parse(value.sessionInvalidBefore)))) fail()
  return value
}

/** Validate a restricted, immutable owner receipt before it can seed any write operation. */
export function assertPrincipalOnlySourceReceipt(value, {
  bytes, receiptSha256, receiptGeneration, sourceRevision,
  operationRef, operationSha256, operationGeneration,
  firebaseProjectId = 'jenfu-platform-prod',
} = {}) {
  let parsedBytes
  try { parsedBytes = JSON.parse(bytes.toString('utf8')) }
  catch { fail() }
  if (!Buffer.isBuffer(bytes) ||
    JSON.stringify(parsedBytes) !== JSON.stringify(value) ||
    !H64.test(receiptSha256 ?? '') ||
    sha256(bytes) !== receiptSha256 ||
    !GENERATION.test(receiptGeneration ?? '') ||
    !H40.test(sourceRevision ?? '') || !H64.test(operationSha256 ?? '') ||
    !GENERATION.test(operationGeneration ?? '') ||
    !keys(value, ['schemaVersion', 'operationId', 'mode', 'sourceRevision',
      'operationRef', 'operationSha256', 'operationGeneration', 'target', 'outcome']) ||
    value.schemaVersion !== 'ai-pdm.principal-inventory-receipt.v1' ||
    value.mode !== 'principal_only_source' ||
    value.sourceRevision !== sourceRevision ||
    value.operationRef !== operationRef ||
    value.operationSha256 !== operationSha256 ||
    value.operationGeneration !== operationGeneration ||
    !id(value.operationId) ||
    !keys(value.target, ['database', 'login', 'major']) ||
    value.target.database !== 'jenfu_prod' ||
    value.target.login !== 'aipdm-prod-migrator@jenfu-platform-prod.iam' ||
    value.target.major !== 17) fail()

  const source = value.outcome
  if (!keys(source, ['contractVersion', 'cohortHash', 'sourceHash',
    'verified', 'activeProfiles', 'withheld']) ||
    source.contractVersion !== SOURCE_CONTRACT ||
    !H64.test(source.cohortHash ?? '') || !H64.test(source.sourceHash ?? '') ||
    !Array.isArray(source.activeProfiles) ||
    source.activeProfiles.length < 1 || source.activeProfiles.length > 32 ||
    !Array.isArray(source.withheld) ||
    source.withheld.length !== source.activeProfiles.length - 1) fail()
  const activeProfiles = source.activeProfiles.map(exactProfile)
  if (new Set(activeProfiles.map((row) => row.pdmUserId)).size !== activeProfiles.length ||
    activeProfiles.some((row, index) => index > 0 &&
      activeProfiles[index - 1].pdmUserId >= row.pdmUserId)) fail()
  const selected = activeProfiles.find((row) => row.pdmUserId === source.verified?.pdmUserId)
  if (!selected) fail()
  const verified = exactVerified(source.verified, selected, firebaseProjectId)
  const withheld = source.withheld.map(exactProfile)
  if (JSON.stringify(withheld) !== JSON.stringify(activeProfiles.filter(
    (row) => row.pdmUserId !== verified.pdmUserId))) fail()
  const cohortHash = digest(["ai-pdm.principal-only-cohort.v1",
    activeProfiles.map((row) => row.pdmUserId)])
  const sourceHash = digest([SOURCE_CONTRACT, activeProfiles,
    [verified.pdmUserId, verified.companyId, verified.principalId,
      verified.employeeId, verified.identityIssuer, verified.identitySubject,
      verified.sourceKind, verified.mappingVersion, verified.publishedAt,
      verified.accountType, verified.lifecycleVersion, verified.accountStatus,
      verified.systemRoleEnabled, verified.sessionInvalidBefore]])
  if (source.cohortHash !== cohortHash || source.sourceHash !== sourceHash) fail()
  return { operationId: value.operationId, sourceRevision,
    receiptSha256, receiptGeneration, operationRef, operationSha256,
    operationGeneration, source: { contractVersion: SOURCE_CONTRACT,
      cohortHash, sourceHash, verified, activeProfiles, withheld } }
}
