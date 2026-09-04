import crypto from 'node:crypto'

const SHA256 = /^[0-9a-f]{64}$/u
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/u
const SOURCE_REVISION = /^[0-9a-f]{40}$/u
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/u
const SENSITIVE = /(?:\bBearer\s+|password\s*=|private[ _-]?key|postgres(?:ql)?:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/iu

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertObject(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label)
}

function assertExactKeys(value, expected, code, label) {
  assertObject(value, code, label)
  if (canonicalize(Object.keys(value).sort()) !== canonicalize([...expected].sort())) fail(code, label)
}

function assertHash(value, code, label) {
  if (!SHA256.test(value ?? '')) fail(code, label)
}

export function assertDev116R02Receipt(receipt) {
  const code = 'DEV116_R02_RECEIPT_INVALID'
  assertExactKeys(receipt, [
    'schemaVersion', 'releaseId', 'platformCaseId', 'pdmCaseId', 'claimLevel', 'observedAt', 'sourceLockSha256',
    'candidate', 'target', 'actor', 'flow', 'readback', 'jenfuInvariant', 'sideEffects',
    'result', 'credentialMaterialPresent', 'evidenceSha256',
  ], code, 'root')
  const { evidenceSha256, ...core } = receipt
  assertHash(evidenceSha256, code, 'evidenceSha256')
  if (evidenceSha256 !== sha256(canonicalize(core))) fail('DEV116_R02_RECEIPT_HASH_MISMATCH')
  if (receipt.schemaVersion !== 'jenfu.dev116.r02.production-candidate-receipt.v1'
    || typeof receipt.releaseId !== 'string' || receipt.releaseId.length < 8
    || receipt.platformCaseId !== 'QA-010-R1-07' || receipt.pdmCaseId !== 'QA-116-R02'
    || receipt.claimLevel !== 'production-candidate-level4'
    || !ISO_INSTANT.test(receipt.observedAt ?? '') || receipt.result !== 'PASS'
    || receipt.credentialMaterialPresent !== false) fail(code, 'identity')
  assertHash(receipt.sourceLockSha256, code, 'sourceLockSha256')

  assertExactKeys(receipt.candidate, ['sourceRevision', 'imageDigest', 'cloudRunRevision'], code, 'candidate')
  if (!SOURCE_REVISION.test(receipt.candidate.sourceRevision ?? '') || !IMAGE_DIGEST.test(receipt.candidate.imageDigest ?? '')
    || !/^ai-pdm-prod-[a-z0-9-]{3,48}$/u.test(receipt.candidate.cloudRunRevision ?? '')) fail(code, 'candidate')

  assertExactKeys(receipt.target, ['projectId', 'instance', 'database', 'region', 'environment', 'trafficPercent', 'databaseIdentitySha256'], code, 'target')
  for (const key of ['projectId', 'instance', 'database']) {
    if (!SAFE_ID.test(receipt.target[key] ?? '')) fail(code, `target.${key}`)
  }
  if (receipt.target.region !== 'asia-east1' || receipt.target.environment !== 'production-candidate'
    || receipt.target.trafficPercent !== 0) fail(code, 'target')
  assertHash(receipt.target.databaseIdentitySha256, code, 'target.databaseIdentitySha256')

  assertExactKeys(receipt.actor, ['subjectSha256', 'role', 'company'], code, 'actor')
  assertHash(receipt.actor.subjectSha256, code, 'actor.subjectSha256')
  if (receipt.actor.role !== 'Engineer') fail(code, 'actor.role')
  assertExactKeys(receipt.actor.company, ['id', 'code', 'kind'], code, 'actor.company')
  if (receipt.actor.company.id !== 'company-smoke' || receipt.actor.company.code !== 'SMOKE'
    || receipt.actor.company.kind !== 'production_smoke') fail(code, 'actor.company')

  assertExactKeys(receipt.flow, ['entryRoute', 'committedObjectIds', 'committedCodes'], code, 'flow')
  if (receipt.flow.entryRoute !== '/numbering/drawings') fail(code, 'flow.entryRoute')
  for (const key of ['committedObjectIds', 'committedCodes']) {
    const values = receipt.flow[key]
    if (!Array.isArray(values) || values.length < 3 || new Set(values).size !== values.length
      || values.some((item) => !SAFE_ID.test(item ?? ''))) fail(code, `flow.${key}`)
  }

  assertExactKeys(receipt.readback, ['api', 'browserReload', 'databaseCommit', 'reloadReadbackSha256'], code, 'readback')
  if (receipt.readback.api !== 'PASS' || receipt.readback.browserReload !== 'PASS' || receipt.readback.databaseCommit !== 'PASS') fail(code, 'readback')
  assertHash(receipt.readback.reloadReadbackSha256, code, 'readback.reloadReadbackSha256')

  assertExactKeys(receipt.jenfuInvariant, ['beforeSha256', 'afterSha256', 'zeroLeakCount'], code, 'jenfuInvariant')
  assertHash(receipt.jenfuInvariant.beforeSha256, code, 'jenfuInvariant.beforeSha256')
  assertHash(receipt.jenfuInvariant.afterSha256, code, 'jenfuInvariant.afterSha256')
  if (receipt.jenfuInvariant.beforeSha256 !== receipt.jenfuInvariant.afterSha256 || receipt.jenfuInvariant.zeroLeakCount !== 0) fail(code, 'jenfuInvariant')

  assertExactKeys(receipt.sideEffects, ['gcsWriter', 'outboxConsumer', 'externalNotification'], code, 'sideEffects')
  if (Object.values(receipt.sideEffects).some((value) => value !== 'disabled')) fail(code, 'sideEffects')
  if (SENSITIVE.test(JSON.stringify(receipt))) fail('DEV116_R02_RECEIPT_SENSITIVE_DATA')
  return receipt
}

export function buildDev116R02Receipt(observation) {
  const core = {
    schemaVersion: 'jenfu.dev116.r02.production-candidate-receipt.v1',
    releaseId: observation.releaseId,
    platformCaseId: 'QA-010-R1-07',
    pdmCaseId: 'QA-116-R02',
    claimLevel: 'production-candidate-level4',
    observedAt: observation.observedAt,
    sourceLockSha256: observation.sourceLockSha256,
    candidate: observation.candidate,
    target: observation.target,
    actor: observation.actor,
    flow: observation.flow,
    readback: observation.readback,
    jenfuInvariant: observation.jenfuInvariant,
    sideEffects: observation.sideEffects,
    result: observation.result,
    credentialMaterialPresent: false,
  }
  return assertDev116R02Receipt({ ...core, evidenceSha256: sha256(canonicalize(core)) })
}

export function buildPlatformR107Link(receiptInput) {
  const receipt = assertDev116R02Receipt(structuredClone(receiptInput))
  return {
    schemaVersion: 'jenfu.dev010.r1.r07-dev116-r02-link.v1',
    dev116CaseId: receipt.pdmCaseId,
    dev116ReceiptSha256: receipt.evidenceSha256,
    dev116Receipt: receipt,
    candidateImageDigest: receipt.candidate.imageDigest,
    candidateRevision: receipt.candidate.cloudRunRevision,
    databaseIdentitySha256: receipt.target.databaseIdentitySha256,
    actorSha256: receipt.actor.subjectSha256,
    company: receipt.actor.company,
    committedObjectIds: receipt.flow.committedObjectIds,
    reloadReadbackSha256: receipt.readback.reloadReadbackSha256,
    jenfuInvariant: receipt.jenfuInvariant,
    sideEffects: receipt.sideEffects,
  }
}
