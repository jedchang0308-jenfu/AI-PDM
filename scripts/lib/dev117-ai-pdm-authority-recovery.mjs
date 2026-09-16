import { createHash } from 'node:crypto'
import { canonicalize } from './dev012-owner-release-runtime.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

export const AUTHORITY_RECOVERY_SCHEMA = 'jenfu.dev117.ai-pdm-authority-recovery.v1'
export const AUTHORITY_RECOVERY_RECEIPT_SCHEMA = 'jenfu.dev117.ai-pdm-authority-recovery-receipt.v1'
export const AUTHORITY_RECOVERY_INCIDENT_ID = 'AIPDM-AUTHORITY-20260916'
export const AUTHORITY_RECOVERY_WORKFLOW = '.github/workflows/recover-ai-pdm-workbench-authority.yml'
export const AUTHORITY_RECOVERY_TARGET = Object.freeze({
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  serviceName: 'ai-pdm-prod',
  canonicalOrigin: 'https://ai-pdm-prod-9536592944.asia-east1.run.app',
  databaseInstance: 'jenfu-platform-prod-pg',
  database: 'jenfu_prod',
})
export const AUTHORITY_RECOVERY_BASELINE = Object.freeze({
  previousRevision: 'ai-pdm-prod-29a4a765563c',
  runtimeCommit: '91de3a65df58dc60ddde88aab5263e9470a84565',
  artifactDigest: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm@sha256:a79ff49747342dc33c7aec7c189cf220540c3851f5614667d64ec97e18dd844e',
})

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort())) fail(code)
}

function assertImmutableReceiptRef(ref, bucket = 'jenfu-platform-prod-aipdm-release') {
  exactKeys(ref, ['uri', 'sha256'], 'AUTHORITY_RECOVERY_EVIDENCE_REF_INVALID')
  if (!H64.test(ref.sha256 ?? '')
    || !new RegExp(`^gs://${bucket}/receipts/[A-Za-z0-9._/-]+\\.json$`, 'u').test(ref.uri ?? '')
    || ref.uri.includes('..')) fail('AUTHORITY_RECOVERY_EVIDENCE_REF_INVALID')
  return ref
}

export function assertAuthorityRecoveryCapsule(value, profile, now = Date.now()) {
  exactKeys(value, [
    'schemaVersion', 'incidentId', 'controllerSourceRevision', 'createdAt', 'deadlineAt',
    'target', 'baseline', 'authority', 'backup', 'evidence', 'activationPolicy', 'databaseAction',
  ], 'AUTHORITY_RECOVERY_CAPSULE_INVALID')
  exactKeys(value.target, Object.keys(AUTHORITY_RECOVERY_TARGET), 'AUTHORITY_RECOVERY_TARGET_INVALID')
  exactKeys(value.baseline, Object.keys(AUTHORITY_RECOVERY_BASELINE), 'AUTHORITY_RECOVERY_BASELINE_INVALID')
  exactKeys(value.authority, ['mode', 'schemaHash', 'expectedCommit', 'drawingRows', 'partRows', 'aggregateRows'], 'AUTHORITY_RECOVERY_AUTHORITY_INVALID')
  exactKeys(value.backup, ['projectId', 'instance', 'backupId', 'status', 'type', 'completedAt'], 'AUTHORITY_RECOVERY_BACKUP_INVALID')
  exactKeys(value.evidence, ['cutoverImportRef', 'releaseTerminalRef'], 'AUTHORITY_RECOVERY_EVIDENCE_INVALID')
  if (value.schemaVersion !== AUTHORITY_RECOVERY_SCHEMA
    || value.incidentId !== AUTHORITY_RECOVERY_INCIDENT_ID
    || !H40.test(value.controllerSourceRevision ?? '')
    || value.activationPolicy !== 'MANUAL_ENVIRONMENT_APPROVAL_REQUIRED'
    || value.databaseAction !== 'VERIFY_ONLY_NO_DATA_WRITE') fail('AUTHORITY_RECOVERY_CAPSULE_INVALID')
  if (canonicalize(value.target) !== canonicalize(AUTHORITY_RECOVERY_TARGET)) fail('AUTHORITY_RECOVERY_TARGET_INVALID')
  if (canonicalize(value.baseline) !== canonicalize(AUTHORITY_RECOVERY_BASELINE)) fail('AUTHORITY_RECOVERY_BASELINE_INVALID')
  if (profile?.target?.projectId !== value.target.projectId
    || profile?.target?.region !== value.target.region
    || profile?.target?.serviceName !== value.target.serviceName
    || profile?.target?.canonicalOrigin !== value.target.canonicalOrigin
    || profile?.artifact?.releaseBucket !== 'jenfu-platform-prod-aipdm-release') fail('AUTHORITY_RECOVERY_PROFILE_MISMATCH')
  if (value.authority.mode !== 'canonical_only'
    || value.authority.schemaHash !== 'dev090-v1'
    || value.authority.expectedCommit !== value.baseline.runtimeCommit
    || value.authority.drawingRows !== 50
    || value.authority.partRows !== 59
    || value.authority.aggregateRows !== 109
    || value.authority.drawingRows + value.authority.partRows !== value.authority.aggregateRows) fail('AUTHORITY_RECOVERY_AUTHORITY_INVALID')
  if (value.backup.projectId !== value.target.projectId
    || value.backup.instance !== value.target.databaseInstance
    || value.backup.backupId !== '1789532631908'
    || value.backup.status !== 'SUCCESSFUL'
    || value.backup.type !== 'ON_DEMAND'
    || !Number.isFinite(Date.parse(value.backup.completedAt))) fail('AUTHORITY_RECOVERY_BACKUP_INVALID')
  assertImmutableReceiptRef(value.evidence.cutoverImportRef)
  assertImmutableReceiptRef(value.evidence.releaseTerminalRef)
  const createdAt = Date.parse(value.createdAt)
  const deadlineAt = Date.parse(value.deadlineAt)
  if (!Number.isFinite(createdAt) || !Number.isFinite(deadlineAt)
    || deadlineAt <= createdAt || deadlineAt - createdAt > 48 * 60 * 60_000
    || deadlineAt <= now) fail('AUTHORITY_RECOVERY_DEADLINE_INVALID')
  return value
}

export function assertAuthorityRecoveryGitHubContext(capsule, environment = process.env) {
  const expectedWorkflowRef = `jedchang0308-jenfu/AI-PDM/${AUTHORITY_RECOVERY_WORKFLOW}@refs/heads/main`
  if (environment.GITHUB_ACTIONS !== 'true'
    || !environment.ACTIONS_ID_TOKEN_REQUEST_URL
    || !environment.GOOGLE_OAUTH_ACCESS_TOKEN
    || environment.GITHUB_REPOSITORY !== 'jedchang0308-jenfu/AI-PDM'
    || environment.GITHUB_SHA !== capsule.controllerSourceRevision
    || environment.GITHUB_WORKFLOW_SHA !== capsule.controllerSourceRevision
    || environment.GITHUB_WORKFLOW_REF !== expectedWorkflowRef
    || environment.GITHUB_REF !== 'refs/heads/main'
    || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || !/^[1-9][0-9]*$/u.test(environment.GITHUB_RUN_ID ?? '')) fail('AUTHORITY_RECOVERY_PROTECTED_WORKFLOW_REQUIRED')
  return true
}

export function recoveryFingerprint(capsuleSha256) {
  if (!H64.test(capsuleSha256 ?? '')) fail('AUTHORITY_RECOVERY_CAPSULE_HASH_INVALID')
  return sha256(`authority-recovery:${AUTHORITY_RECOVERY_INCIDENT_ID}:${capsuleSha256}`)
}

export function recoveryPaths(profile, capsuleSha256) {
  const fingerprint = recoveryFingerprint(capsuleSha256)
  const root = `gs://${profile.artifact.releaseBucket}/receipts/incidents/${AUTHORITY_RECOVERY_INCIDENT_ID}/${capsuleSha256}`
  return {
    fingerprint,
    candidateRevision: `${AUTHORITY_RECOVERY_TARGET.serviceName}-${fingerprint.slice(0, 12)}`,
    candidateTag: `candidate-${fingerprint.slice(0, 12)}`,
    candidate: `${root}/candidate.json`,
    verify: `${root}/verify.json`,
    activate: `${root}/activate.json`,
    canonical: `${root}/canonical.json`,
    finalize: `${root}/finalize.json`,
    rollback: `${root}/rollback.json`,
    terminal: `${root}/terminal.json`,
  }
}

function environmentMap(container) {
  return new Map((container?.env ?? []).map((row) => [row.name, row]))
}

function upsertPlainEnvironment(container, name, value) {
  const retained = (container.env ?? []).filter((row) => row?.name !== name)
  container.env = [...retained, { name, value }]
}

function normalizedTemplate(template, profile) {
  const value = structuredClone(template)
  delete value.revision
  const app = value.containers?.find((container) => container.name === profile.runtime.containerName)
  if (!app) fail('AUTHORITY_RECOVERY_APP_CONTAINER_MISSING')
  app.env = (app.env ?? []).filter((row) => !['PDM_BUILD_COMMIT', profile.environment.candidateOriginEnvironmentName].includes(row.name))
  return value
}

export function buildAuthorityRecoveryCandidateTemplate({ beforeTemplate, profile, capsule, candidateRevision, candidateOrigin }) {
  if (!candidateRevision?.startsWith(`${capsule.target.serviceName}-`) || !candidateOrigin?.startsWith('https://candidate-')) fail('AUTHORITY_RECOVERY_CANDIDATE_ID_INVALID')
  const template = structuredClone(beforeTemplate)
  template.revision = candidateRevision
  const app = template.containers?.find((container) => container.name === profile.runtime.containerName)
  if (!app || app.image !== capsule.baseline.artifactDigest) fail('AUTHORITY_RECOVERY_ARTIFACT_MISMATCH')
  upsertPlainEnvironment(app, 'PDM_BUILD_COMMIT', capsule.baseline.runtimeCommit)
  upsertPlainEnvironment(app, profile.environment.candidateOriginEnvironmentName, candidateOrigin)
  if (canonicalize(normalizedTemplate(template, profile)) !== canonicalize(normalizedTemplate(beforeTemplate, profile))) fail('AUTHORITY_RECOVERY_TEMPLATE_SCOPE_DRIFT')
  return template
}

export function assertAuthorityRecoveryRevision({ revision, profile, capsule, candidateRevision, candidateOrigin }) {
  const app = revision?.containers?.find((container) => container.name === profile.runtime.containerName)
  const env = environmentMap(app)
  const buildCommit = env.get('PDM_BUILD_COMMIT')
  const origin = env.get(profile.environment.candidateOriginEnvironmentName)
  if (!String(revision?.name ?? '').endsWith(`/revisions/${candidateRevision}`)
    || app?.image !== capsule.baseline.artifactDigest
    || buildCommit?.value !== capsule.baseline.runtimeCommit || buildCommit?.valueSource
    || origin?.value !== candidateOrigin || origin?.valueSource) fail('AUTHORITY_RECOVERY_REVISION_READBACK_MISMATCH')
  return true
}

export function decodeWorkbenchContractToken(token) {
  const [payload, signature, extra] = String(token ?? '').split('.')
  if (!payload || !signature || extra) fail('AUTHORITY_RECOVERY_CONTRACT_TOKEN_INVALID')
  let value
  try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { fail('AUTHORITY_RECOVERY_CONTRACT_TOKEN_INVALID') }
  exactKeys(value, ['version', 'companyId', 'actorId', 'schemaHash', 'expectedCommit', 'mode', 'issuedAt'], 'AUTHORITY_RECOVERY_CONTRACT_TOKEN_INVALID')
  if (value.mode !== 'canonical_only' || value.schemaHash !== 'dev090-v1' || !H40.test(value.expectedCommit ?? '')
    || !value.companyId || !value.actorId || !Number.isFinite(value.issuedAt)) fail('AUTHORITY_RECOVERY_CONTRACT_TOKEN_INVALID')
  return value
}

export function assertWorkbenchRecoveryPayload(body, expected) {
  const totalRows = Number(body?.data?.totalRows)
  const token = decodeWorkbenchContractToken(body?.meta?.contractToken)
  if (totalRows !== expected.rows
    || token.expectedCommit !== expected.expectedCommit
    || token.schemaHash !== expected.schemaHash
    || token.mode !== expected.mode) fail('AUTHORITY_RECOVERY_WORKBENCH_PAYLOAD_MISMATCH', expected.id)
  return { id: expected.id, status: 200, totalRows, authority: { mode: token.mode, schemaHash: token.schemaHash, expectedCommit: token.expectedCommit }, companyId: token.companyId, actorId: token.actorId }
}

export function buildRecoveryReceipt({ stage, capsule, capsuleSha256, previousReceiptRef = null, facts, observedAt }) {
  if (!['candidate', 'verify', 'activate', 'canonical', 'finalize', 'rollback', 'terminal'].includes(stage)
    || !Number.isFinite(Date.parse(observedAt))) fail('AUTHORITY_RECOVERY_RECEIPT_INVALID')
  if (previousReceiptRef) assertImmutableReceiptRef(previousReceiptRef)
  const core = {
    schemaVersion: AUTHORITY_RECOVERY_RECEIPT_SCHEMA,
    incidentId: capsule.incidentId,
    capsuleSha256,
    controllerSourceRevision: capsule.controllerSourceRevision,
    stage,
    previousReceiptRef,
    facts,
    observedAt,
    status: 'PASS',
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function assertRecoveryReceipt(value, { stage, capsule, capsuleSha256 }) {
  exactKeys(value, ['schemaVersion', 'incidentId', 'capsuleSha256', 'controllerSourceRevision', 'stage', 'previousReceiptRef', 'facts', 'observedAt', 'status', 'receiptSha256'], 'AUTHORITY_RECOVERY_RECEIPT_INVALID')
  const { receiptSha256, ...core } = value
  if (value.schemaVersion !== AUTHORITY_RECOVERY_RECEIPT_SCHEMA
    || value.incidentId !== capsule.incidentId
    || value.capsuleSha256 !== capsuleSha256
    || value.controllerSourceRevision !== capsule.controllerSourceRevision
    || value.stage !== stage
    || value.status !== 'PASS'
    || !Number.isFinite(Date.parse(value.observedAt))
    || receiptSha256 !== sha256(canonicalize(core))) fail('AUTHORITY_RECOVERY_RECEIPT_INVALID')
  return value
}

export function receiptRef(uri, bytes) {
  return { uri, sha256: sha256(bytes) }
}
