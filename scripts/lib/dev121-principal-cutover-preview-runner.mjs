import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const OWNERS = ['platform', 'orgmaster', 'aiPdm']
// The source-bound Production preview uses the current firebase_bff entry.
// Historical local Google OAuth rows are retained for audit, not re-admitted.
const SOURCE_KINDS = new Set(['firebase_mapping'])

function fail(code) { throw new Error(`DEV121_CUTOVER_PREVIEW_${code}`) }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}
function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
}
function exactTime(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

export function assertCutoverPreviewOperation(value, { bytes, operationSha256, sourceRevision }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256) fail('HASH_MISMATCH')
  const keys = ['schemaVersion', 'operationId', 'sourceRevision', 'projectId',
    'region', 'database', 'applicationId', 'firebaseProjectId', 'sourceSets',
    'sourceRevisions', 'contractManifestHashes']
  if (!exactKeys(value, keys) ||
      value.schemaVersion !== 'ai-pdm.principal-cutover-preview-operation.v1' ||
      value.projectId !== 'jenfu-platform-prod' || value.region !== 'asia-east1' ||
      value.database !== 'jenfu_prod' || value.applicationId !== 'ai-pdm' ||
      value.sourceRevision !== sourceRevision || !H40.test(sourceRevision ?? '') ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/u.test(value.operationId ?? '') ||
      !/^[a-z][a-z0-9-]{0,62}$/u.test(value.firebaseProjectId ?? '') ||
      !exactKeys(value.sourceRevisions, OWNERS) ||
      !exactKeys(value.contractManifestHashes, OWNERS) ||
      OWNERS.some((owner) => !H40.test(value.sourceRevisions[owner]) ||
        !H64.test(value.contractManifestHashes[owner])) ||
      value.sourceRevisions.aiPdm !== sourceRevision ||
      !Array.isArray(value.sourceSets) || value.sourceSets.length < 1 ||
      value.sourceSets.length > 32) fail('OPERATION_INVALID')

  const sourceKeys = ['pdmUserId', 'companyId', 'principalId', 'employeeId',
    'sourceKind', 'identityIssuer', 'identitySubject', 'mappingVersion', 'publishedAt']
  const profiles = new Set()
  const principals = new Set()
  const aliases = new Set()
  for (const set of value.sourceSets) {
    if (!Array.isArray(set) || set.length !== 1) fail('SOURCE_INVALID')
    const first = set[0]
    if (profiles.has(first?.pdmUserId) || principals.has(first?.principalId)) fail('SOURCE_INVALID')
    profiles.add(first.pdmUserId)
    principals.add(first.principalId)
    const kinds = new Set()
    for (const source of set) {
      if (!exactKeys(source, sourceKeys) || !SOURCE_KINDS.has(source.sourceKind) ||
        kinds.has(source.sourceKind) || source.pdmUserId !== first.pdmUserId ||
        source.companyId !== first.companyId || source.principalId !== first.principalId ||
        source.employeeId !== first.employeeId ||
        !exactText(source.pdmUserId) || !exactText(source.companyId) ||
        !exactText(source.principalId) || source.principalId.startsWith('pdm:') ||
        !exactText(source.employeeId) || !exactText(source.identitySubject) ||
        source.identityIssuer !== `https://securetoken.google.com/${value.firebaseProjectId}` ||
        !Number.isSafeInteger(source.mappingVersion) || source.mappingVersion < 1 ||
        !exactTime(source.publishedAt)) fail('SOURCE_INVALID')
      const alias = JSON.stringify([source.identityIssuer, source.identitySubject])
      if (aliases.has(alias)) fail('SOURCE_INVALID')
      aliases.add(alias)
      kinds.add(source.sourceKind)
    }
  }
  return value
}

export function summarizeCutoverPreview(envelope) {
  if (!envelope || !H64.test(envelope.sourceHash ?? '') ||
      !H64.test(envelope.cohortHash ?? '') || !H64.test(envelope.inputHash ?? '') ||
      !H64.test(envelope.localSourceHash ?? '') ||
      !H64.test(envelope.producerSourceHash ?? '') ||
      !H64.test(envelope.graphCheck?.graphHash ?? '') ||
      !H64.test(envelope.plan?.planHash ?? '') ||
      !H64.test(envelope.workspaceShadow?.shadowHash ?? '') ||
      !['pass', 'mismatch', 'requires_resource_adapter']
        .includes(envelope.workspaceShadow?.status)) fail('OUTCOME_INVALID')
  return {
    cutoverAt: envelope.cutoverAt,
    cohort: envelope.cohort,
    cohortHash: envelope.cohortHash,
    sourceHash: envelope.sourceHash,
    inputHash: envelope.inputHash,
    localSourceHash: envelope.localSourceHash,
    producerSourceHash: envelope.producerSourceHash,
    graphHash: envelope.graphCheck.graphHash,
    workspaceShadow: envelope.workspaceShadow,
    planHash: envelope.plan.planHash,
    sourceBindingsAttested: false,
    applyAllowed: false,
  }
}
