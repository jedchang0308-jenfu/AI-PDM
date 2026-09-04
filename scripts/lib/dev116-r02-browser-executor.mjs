import path from 'node:path'

import { canonicalize, sha256 } from './dev116-r02-receipt.mjs'

const SHA256 = /^[0-9a-f]{64}$/u
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/u
const SOURCE_REVISION = /^[0-9a-f]{40}$/u
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/u
const CANDIDATE_URL = /^https:\/\/candidate---ai-pdm-prod-[a-z0-9-]+\.a\.run\.app$/u
const SENSITIVE = /(?:\bBearer\s+|password\s*=|private[ _-]?key|postgres(?:ql)?:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/iu

export const DEV116_R02_BROWSER_ACKNOWLEDGEMENT = 'DEV-116-R02-AUTHENTICATED-CANDIDATE-WRITE-APPROVED'
export const DEV116_R02_CREDENTIAL_ENV = Object.freeze({
  identifier: 'PDM_DEV116_R02_LOGIN_IDENTIFIER',
  password: 'PDM_DEV116_R02_LOGIN_PASSWORD',
})

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
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

function assertSelfHash(value, code) {
  const { evidenceSha256, ...core } = value
  assertHash(evidenceSha256, code, 'evidenceSha256')
  if (sha256(canonicalize(core)) !== evidenceSha256) fail(`${code}_HASH_MISMATCH`)
}

function assertCandidate(value, code, { includeBaseUrl }) {
  const keys = includeBaseUrl
    ? ['baseUrl', 'sourceRevision', 'imageDigest', 'cloudRunRevision']
    : ['sourceRevision', 'imageDigest', 'cloudRunRevision']
  assertExactKeys(value, keys, code, 'candidate')
  if (includeBaseUrl && !CANDIDATE_URL.test(value.baseUrl ?? '')) fail(code, 'candidate.baseUrl')
  if (!SOURCE_REVISION.test(value.sourceRevision ?? '')
    || !IMAGE_DIGEST.test(value.imageDigest ?? '')
    || !/^ai-pdm-prod-[a-z0-9-]{3,48}$/u.test(value.cloudRunRevision ?? '')) fail(code, 'candidate')
}

function assertTarget(value, code) {
  assertExactKeys(value, ['projectId', 'instance', 'database', 'region', 'environment', 'trafficPercent', 'databaseIdentitySha256'], code, 'target')
  if (value.projectId !== 'jenfu-platform-prod'
    || value.instance !== 'jenfu-platform-prod-pg'
    || value.database !== 'jenfu_prod'
    || value.region !== 'asia-east1'
    || value.environment !== 'production-candidate'
    || value.trafficPercent !== 0) fail(code, 'target')
  assertHash(value.databaseIdentitySha256, code, 'target.databaseIdentitySha256')
}

function assertActor(value, code) {
  assertExactKeys(value, ['subjectSha256', 'role', 'company'], code, 'actor')
  assertHash(value.subjectSha256, code, 'actor.subjectSha256')
  assertExactKeys(value.company, ['id', 'code', 'kind'], code, 'actor.company')
  if (value.role !== 'Engineer'
    || value.company.id !== 'company-smoke'
    || value.company.code !== 'SMOKE'
    || value.company.kind !== 'production_smoke') fail(code, 'actor')
}

function assertSideEffects(value, code) {
  assertExactKeys(value, ['gcsWriter', 'outboxConsumer', 'externalNotification'], code, 'sideEffects')
  if (Object.values(value).some((item) => item !== 'disabled')) fail(code, 'sideEffects')
}

function assertSafeList(value, code, label) {
  if (!Array.isArray(value) || value.length !== 3 || new Set(value).size !== 3
    || value.some((item) => !SAFE_ID.test(item ?? ''))) fail(code, label)
}

function assertNoSensitive(value, code) {
  if (SENSITIVE.test(JSON.stringify(value))) fail(code)
}

export function resolveProductionEvidencePath(root, raw, label) {
  if (!raw) fail(`DEV116_R02_${label}_REQUIRED`)
  const evidenceRoot = path.resolve(root, 'output', 'production-release')
  const target = path.resolve(root, raw)
  if (!target.startsWith(`${evidenceRoot}${path.sep}`)) fail('DEV116_R02_PATH_OUT_OF_SCOPE', label)
  return target
}

export function parseDev116R02BrowserArgs(argv, { root = process.cwd() } = {}) {
  const forbidden = new Set(['--identifier', '--email', '--password', '--token', '--cookie', '--totp', '--storage-state'])
  const allowed = new Set(['--preflight', '--candidate-context', '--output', '--screenshot', '--acknowledgement'])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    if (forbidden.has(name)) fail('DEV116_R02_CREDENTIAL_ARGUMENT_FORBIDDEN', name)
    if (!allowed.has(name)) fail('DEV116_R02_ARGUMENT_UNKNOWN', name)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail('DEV116_R02_ARGUMENT_VALUE_REQUIRED', name)
    if (values.has(name)) fail('DEV116_R02_ARGUMENT_DUPLICATE', name)
    values.set(name, value)
    index += 1
  }
  if (values.get('--acknowledgement') !== DEV116_R02_BROWSER_ACKNOWLEDGEMENT) fail('DEV116_R02_WRITE_ACKNOWLEDGEMENT_REQUIRED')
  return {
    preflightPath: resolveProductionEvidencePath(root, values.get('--preflight'), 'PREFLIGHT'),
    candidateContextPath: resolveProductionEvidencePath(root, values.get('--candidate-context'), 'CANDIDATE_CONTEXT'),
    outputPath: resolveProductionEvidencePath(root, values.get('--output'), 'OUTPUT'),
    screenshotPath: resolveProductionEvidencePath(root, values.get('--screenshot'), 'SCREENSHOT'),
  }
}

export function readDev116R02Credentials(env = process.env) {
  const identifier = env[DEV116_R02_CREDENTIAL_ENV.identifier]?.trim() ?? ''
  const password = env[DEV116_R02_CREDENTIAL_ENV.password] ?? ''
  if (!identifier || !identifier.includes('@') || identifier.length > 254) fail('DEV116_R02_LOGIN_IDENTIFIER_REQUIRED')
  if (!password || password.length > 1024) fail('DEV116_R02_LOGIN_PASSWORD_REQUIRED')
  return { identifier, password }
}

export function assertDev010R1PreflightForR02(preflight) {
  const code = 'DEV116_R02_PREFLIGHT_INVALID'
  assertObject(preflight, code, 'root')
  assertSelfHash(preflight, code)
  if (preflight.schemaVersion !== 'jenfu.dev010.r1.preflight.evidence.v3'
    || preflight.slice !== '010-R1A'
    || preflight.status !== 'READY_FOR_R1_REHEARSAL'
    || !Array.isArray(preflight.blockers) || preflight.blockers.length !== 0
    || preflight.productionWrites !== false || preflight.cloudMutations !== 0 || preflight.trafficChanges !== 0) fail(code, 'status')
  assertHash(preflight.releaseSourceLockEvidenceSha256, code, 'releaseSourceLockEvidenceSha256')
  if (preflight.target?.preferredNeutralProjectId !== 'jenfu-platform-prod'
    || preflight.target?.neutralInstance !== 'jenfu-platform-prod-pg'
    || preflight.target?.neutralDatabase !== 'jenfu_prod'
    || preflight.target?.region !== 'asia-east1'
    || preflight.target?.availabilityProfile !== 'ZONAL_DEDICATED'
    || preflight.target?.databaseTier !== 'db-custom-1-3840') fail(code, 'target')
  const aiPdm = preflight.components?.find((item) => item?.id === 'ai-pdm')
  if (!aiPdm || !SOURCE_REVISION.test(aiPdm.head ?? '') || aiPdm.stagedSourceDirtyEntryCount !== 0
    || aiPdm.stagedUnknownRiskEntryCount !== 0 || aiPdm.missingTrackedN2Files?.length !== 0
    || aiPdm.missingCommands?.length !== 0) fail(code, 'ai-pdm-source')
  assertNoSensitive(preflight, 'DEV116_R02_PREFLIGHT_SENSITIVE_DATA')
  return preflight
}

export function buildDev116R02CandidateContext(input) {
  const core = {
    schemaVersion: 'jenfu.dev116.r02.candidate-context.v1',
    releaseId: input.releaseId,
    observedAt: input.observedAt,
    sourceLockSha256: input.sourceLockSha256,
    candidate: input.candidate,
    target: input.target,
    actor: input.actor,
    sideEffects: input.sideEffects,
    status: input.status,
    credentialMaterialPresent: false,
  }
  return assertDev116R02CandidateContext({ ...core, evidenceSha256: sha256(canonicalize(core)) })
}

export function assertDev116R02CandidateContext(context) {
  const code = 'DEV116_R02_CANDIDATE_CONTEXT_INVALID'
  assertExactKeys(context, ['schemaVersion', 'releaseId', 'observedAt', 'sourceLockSha256', 'candidate', 'target', 'actor', 'sideEffects', 'status', 'credentialMaterialPresent', 'evidenceSha256'], code, 'root')
  assertSelfHash(context, code)
  if (context.schemaVersion !== 'jenfu.dev116.r02.candidate-context.v1'
    || typeof context.releaseId !== 'string' || context.releaseId.length < 8
    || !ISO_INSTANT.test(context.observedAt ?? '') || context.status !== 'PASS'
    || context.credentialMaterialPresent !== false) fail(code, 'identity')
  assertHash(context.sourceLockSha256, code, 'sourceLockSha256')
  assertCandidate(context.candidate, code, { includeBaseUrl: true })
  assertTarget(context.target, code)
  assertActor(context.actor, code)
  assertSideEffects(context.sideEffects, code)
  assertNoSensitive(context, 'DEV116_R02_CANDIDATE_CONTEXT_SENSITIVE_DATA')
  return context
}

export function assertPreflightMatchesCandidate(preflightInput, candidateInput) {
  const preflight = assertDev010R1PreflightForR02(preflightInput)
  const candidate = assertDev116R02CandidateContext(candidateInput)
  const aiPdm = preflight.components.find((item) => item.id === 'ai-pdm')
  if (preflight.releaseId !== candidate.releaseId
    || preflight.releaseSourceLockEvidenceSha256 !== candidate.sourceLockSha256
    || aiPdm.head !== candidate.candidate.sourceRevision) fail('DEV116_R02_PREFLIGHT_CANDIDATE_MISMATCH')
  return { preflight, candidate }
}

export function buildDev116R02BrowserObservation(input) {
  const core = {
    schemaVersion: 'jenfu.dev116.r02.browser-observation.v1',
    releaseId: input.releaseId,
    observedAt: input.observedAt,
    sourceLockSha256: input.sourceLockSha256,
    candidate: input.candidate,
    target: input.target,
    actor: input.actor,
    flow: input.flow,
    readback: input.readback,
    sideEffects: input.sideEffects,
    result: input.result,
    credentialMaterialPresent: false,
  }
  return assertDev116R02BrowserObservation({ ...core, evidenceSha256: sha256(canonicalize(core)) })
}

export function assertDev116R02BrowserObservation(observation) {
  const code = 'DEV116_R02_BROWSER_OBSERVATION_INVALID'
  assertExactKeys(observation, ['schemaVersion', 'releaseId', 'observedAt', 'sourceLockSha256', 'candidate', 'target', 'actor', 'flow', 'readback', 'sideEffects', 'result', 'credentialMaterialPresent', 'evidenceSha256'], code, 'root')
  assertSelfHash(observation, code)
  if (observation.schemaVersion !== 'jenfu.dev116.r02.browser-observation.v1'
    || typeof observation.releaseId !== 'string' || observation.releaseId.length < 8
    || !ISO_INSTANT.test(observation.observedAt ?? '') || observation.result !== 'BROWSER_PASS'
    || observation.credentialMaterialPresent !== false) fail(code, 'identity')
  assertHash(observation.sourceLockSha256, code, 'sourceLockSha256')
  assertCandidate(observation.candidate, code, { includeBaseUrl: true })
  assertTarget(observation.target, code)
  assertActor(observation.actor, code)
  assertExactKeys(observation.flow, ['entryRoute', 'createRoute', 'committedObjectIds', 'committedCodes', 'normalNavigation'], code, 'flow')
  if (observation.flow.entryRoute !== '/numbering/drawings'
    || observation.flow.createRoute !== '/numbering/create'
    || observation.flow.normalNavigation !== true) fail(code, 'flow')
  assertSafeList(observation.flow.committedObjectIds, code, 'flow.committedObjectIds')
  assertSafeList(observation.flow.committedCodes, code, 'flow.committedCodes')
  assertExactKeys(observation.readback, ['api', 'browserReload', 'search', 'reloadReadbackSha256'], code, 'readback')
  if (observation.readback.api !== 'PASS' || observation.readback.browserReload !== 'PASS'
    || observation.readback.search !== 'PASS') fail(code, 'readback')
  assertHash(observation.readback.reloadReadbackSha256, code, 'readback.reloadReadbackSha256')
  assertSideEffects(observation.sideEffects, code)
  assertNoSensitive(observation, 'DEV116_R02_BROWSER_OBSERVATION_SENSITIVE_DATA')
  return observation
}

export function buildDev116R02ProviderObservation(input) {
  const core = {
    schemaVersion: 'jenfu.dev116.r02.provider-observation.v1',
    releaseId: input.releaseId,
    observedAt: input.observedAt,
    sourceLockSha256: input.sourceLockSha256,
    candidate: input.candidate,
    target: input.target,
    actor: input.actor,
    flow: input.flow,
    readback: input.readback,
    jenfuInvariant: input.jenfuInvariant,
    sideEffects: input.sideEffects,
    result: input.result,
    credentialMaterialPresent: false,
  }
  return assertDev116R02ProviderObservation({ ...core, evidenceSha256: sha256(canonicalize(core)) })
}

export function assertDev116R02ProviderObservation(observation) {
  const code = 'DEV116_R02_PROVIDER_OBSERVATION_INVALID'
  assertExactKeys(observation, ['schemaVersion', 'releaseId', 'observedAt', 'sourceLockSha256', 'candidate', 'target', 'actor', 'flow', 'readback', 'jenfuInvariant', 'sideEffects', 'result', 'credentialMaterialPresent', 'evidenceSha256'], code, 'root')
  assertSelfHash(observation, code)
  if (observation.schemaVersion !== 'jenfu.dev116.r02.provider-observation.v1'
    || typeof observation.releaseId !== 'string' || observation.releaseId.length < 8
    || !ISO_INSTANT.test(observation.observedAt ?? '') || observation.result !== 'PROVIDER_PASS'
    || observation.credentialMaterialPresent !== false) fail(code, 'identity')
  assertHash(observation.sourceLockSha256, code, 'sourceLockSha256')
  assertCandidate(observation.candidate, code, { includeBaseUrl: false })
  assertTarget(observation.target, code)
  assertActor(observation.actor, code)
  assertExactKeys(observation.flow, ['committedObjectIds', 'committedCodes'], code, 'flow')
  assertSafeList(observation.flow.committedObjectIds, code, 'flow.committedObjectIds')
  assertSafeList(observation.flow.committedCodes, code, 'flow.committedCodes')
  assertExactKeys(observation.readback, ['databaseCommit', 'reloadReadbackSha256'], code, 'readback')
  if (observation.readback.databaseCommit !== 'PASS') fail(code, 'readback.databaseCommit')
  assertHash(observation.readback.reloadReadbackSha256, code, 'readback.reloadReadbackSha256')
  assertExactKeys(observation.jenfuInvariant, ['beforeSha256', 'afterSha256', 'zeroLeakCount'], code, 'jenfuInvariant')
  assertHash(observation.jenfuInvariant.beforeSha256, code, 'jenfuInvariant.beforeSha256')
  assertHash(observation.jenfuInvariant.afterSha256, code, 'jenfuInvariant.afterSha256')
  if (observation.jenfuInvariant.beforeSha256 !== observation.jenfuInvariant.afterSha256
    || observation.jenfuInvariant.zeroLeakCount !== 0) fail(code, 'jenfuInvariant')
  assertSideEffects(observation.sideEffects, code)
  assertNoSensitive(observation, 'DEV116_R02_PROVIDER_OBSERVATION_SENSITIVE_DATA')
  return observation
}

export function joinDev116R02Evidence(browserInput, providerInput) {
  const browser = assertDev116R02BrowserObservation(browserInput)
  const provider = assertDev116R02ProviderObservation(providerInput)
  const browserCandidate = { ...browser.candidate }
  delete browserCandidate.baseUrl
  const pairs = [
    ['releaseId', browser.releaseId, provider.releaseId],
    ['sourceLockSha256', browser.sourceLockSha256, provider.sourceLockSha256],
    ['candidate', browserCandidate, provider.candidate],
    ['target', browser.target, provider.target],
    ['actor', browser.actor, provider.actor],
    ['committedObjectIds', browser.flow.committedObjectIds, provider.flow.committedObjectIds],
    ['committedCodes', browser.flow.committedCodes, provider.flow.committedCodes],
    ['reloadReadbackSha256', browser.readback.reloadReadbackSha256, provider.readback.reloadReadbackSha256],
    ['sideEffects', browser.sideEffects, provider.sideEffects],
  ]
  for (const [label, left, right] of pairs) {
    if (canonicalize(left) !== canonicalize(right)) fail('DEV116_R02_BROWSER_PROVIDER_MISMATCH', label)
  }
  return {
    releaseId: browser.releaseId,
    observedAt: provider.observedAt,
    sourceLockSha256: browser.sourceLockSha256,
    candidate: provider.candidate,
    target: provider.target,
    actor: provider.actor,
    flow: {
      entryRoute: browser.flow.entryRoute,
      committedObjectIds: browser.flow.committedObjectIds,
      committedCodes: browser.flow.committedCodes,
    },
    readback: {
      api: browser.readback.api,
      browserReload: browser.readback.browserReload,
      databaseCommit: provider.readback.databaseCommit,
      reloadReadbackSha256: browser.readback.reloadReadbackSha256,
    },
    jenfuInvariant: provider.jenfuInvariant,
    sideEffects: provider.sideEffects,
    result: 'PASS',
  }
}
