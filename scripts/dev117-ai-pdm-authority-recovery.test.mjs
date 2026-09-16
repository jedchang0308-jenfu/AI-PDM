import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  AUTHORITY_RECOVERY_BASELINE,
  AUTHORITY_RECOVERY_INCIDENT_ID,
  AUTHORITY_RECOVERY_SCHEMA,
  AUTHORITY_RECOVERY_TARGET,
  assertAuthorityRecoveryCapsule,
  assertAuthorityRecoveryGitHubContext,
  assertAuthorityRecoveryRevision,
  assertRecoveryReceipt,
  assertWorkbenchRecoveryPayload,
  authorityRecoveryCandidateOrigin,
  buildAuthorityRecoveryCandidateTemplate,
  buildRecoveryReceipt,
  recoveryPaths,
} from './lib/dev117-ai-pdm-authority-recovery.mjs'

const controllerSourceRevision = '0'.repeat(40)
const capsuleSha256 = '1'.repeat(64)
const evidenceSha = '2'.repeat(64)
const profile = {
  target: AUTHORITY_RECOVERY_TARGET,
  artifact: { releaseBucket: 'jenfu-platform-prod-aipdm-release' },
  runtime: { containerName: 'ai-pdm' },
  environment: { candidateOriginEnvironmentName: 'PDM_RELEASE_CANDIDATE_ORIGIN' },
}

function capsule() {
  const createdAt = new Date(Date.now() - 60_000).toISOString()
  const deadlineAt = new Date(Date.now() + 60 * 60_000).toISOString()
  return {
    schemaVersion: AUTHORITY_RECOVERY_SCHEMA,
    incidentId: AUTHORITY_RECOVERY_INCIDENT_ID,
    controllerSourceRevision,
    createdAt,
    deadlineAt,
    target: { ...AUTHORITY_RECOVERY_TARGET },
    baseline: { ...AUTHORITY_RECOVERY_BASELINE },
    authority: { mode: 'canonical_only', schemaHash: 'dev090-v1', expectedCommit: AUTHORITY_RECOVERY_BASELINE.runtimeCommit, drawingRows: 50, partRows: 59, aggregateRows: 109 },
    backup: { projectId: 'jenfu-platform-prod', instance: 'jenfu-platform-prod-pg', backupId: '1789532631908', status: 'SUCCESSFUL', type: 'ON_DEMAND', completedAt: '2026-09-16T04:25:23.173Z' },
    evidence: {
      cutoverImportRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/data-cutover/DEV012-REL-20260915-R78/import-receipt.json', sha256: evidenceSha },
      releaseTerminalRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV012-REL-20260915-R78/hash/terminal.json', sha256: evidenceSha },
    },
    activationPolicy: 'MANUAL_ENVIRONMENT_APPROVAL_REQUIRED',
    databaseAction: 'VERIFY_ONLY_NO_DATA_WRITE',
  }
}

test('recovery capsule pins the exact production target, R78 artifact, backup and no-write boundary', () => {
  assert.equal(assertAuthorityRecoveryCapsule(capsule(), profile).baseline.runtimeCommit, AUTHORITY_RECOVERY_BASELINE.runtimeCommit)
  assert.throws(() => assertAuthorityRecoveryCapsule({ ...capsule(), target: { ...AUTHORITY_RECOVERY_TARGET, projectId: 'wrong' } }, profile), /AUTHORITY_RECOVERY_TARGET_INVALID/u)
  assert.throws(() => assertAuthorityRecoveryCapsule({ ...capsule(), databaseAction: 'CAS_UPDATE' }, profile), /AUTHORITY_RECOVERY_CAPSULE_INVALID/u)
  assert.throws(() => assertAuthorityRecoveryCapsule({ ...capsule(), backup: { ...capsule().backup, status: 'RUNNING' } }, profile), /AUTHORITY_RECOVERY_BACKUP_INVALID/u)
})

test('recovery may execute only from the protected main workflow at the capsule controller commit', () => {
  const environment = {
    GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token', GOOGLE_OAUTH_ACCESS_TOKEN: 'token',
    GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM', GITHUB_SHA: controllerSourceRevision,
    GITHUB_WORKFLOW_SHA: controllerSourceRevision,
    GITHUB_WORKFLOW_REF: 'jedchang0308-jenfu/AI-PDM/.github/workflows/recover-ai-pdm-workbench-authority.yml@refs/heads/main',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '123',
  }
  assert.equal(assertAuthorityRecoveryGitHubContext(capsule(), environment), true)
  assert.throws(() => assertAuthorityRecoveryGitHubContext(capsule(), { ...environment, GITHUB_REF: 'refs/heads/feature' }), /PROTECTED_WORKFLOW_REQUIRED/u)
})

test('candidate template changes only revision, runtime commit and task-owned candidate origin', () => {
  const paths = recoveryPaths(profile, capsuleSha256)
  const service = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod', uri: AUTHORITY_RECOVERY_TARGET.providerOrigin, urls: [AUTHORITY_RECOVERY_TARGET.canonicalOrigin, AUTHORITY_RECOVERY_TARGET.providerOrigin] }
  const candidateOrigin = authorityRecoveryCandidateOrigin(service, capsule(), paths.candidateTag)
  assert.equal(candidateOrigin, `https://${paths.candidateTag}---ai-pdm-prod-56gnizku7q-de.a.run.app`)
  assert.throws(() => authorityRecoveryCandidateOrigin({ ...service, uri: AUTHORITY_RECOVERY_TARGET.canonicalOrigin }, capsule(), paths.candidateTag), /PROVIDER_ORIGIN_INVALID/u)
  const beforeTemplate = {
    serviceAccount: 'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
    containers: [
      { name: 'ai-pdm', image: AUTHORITY_RECOVERY_BASELINE.artifactDigest, env: [{ name: 'NODE_ENV', value: 'production' }, { name: 'PDM_RELEASE_CANDIDATE_ORIGIN', value: 'https://old.example' }] },
      { name: 'cloud-sql-proxy', image: 'proxy@sha256:' + 'a'.repeat(64) },
    ],
  }
  const template = buildAuthorityRecoveryCandidateTemplate({ beforeTemplate, profile, capsule: capsule(), candidateRevision: paths.candidateRevision, candidateOrigin })
  assert.equal(template.revision, paths.candidateRevision)
  const env = Object.fromEntries(template.containers[0].env.map((row) => [row.name, row.value]))
  assert.equal(env.PDM_BUILD_COMMIT, AUTHORITY_RECOVERY_BASELINE.runtimeCommit)
  assert.equal(env.PDM_RELEASE_CANDIDATE_ORIGIN, candidateOrigin)
  assert.equal(env.NODE_ENV, 'production')
  const revision = { name: `projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod/revisions/${paths.candidateRevision}`, containers: template.containers }
  assert.equal(assertAuthorityRecoveryRevision({ revision, profile, capsule: capsule(), candidateRevision: paths.candidateRevision, candidateOrigin }), true)
  assert.throws(() => buildAuthorityRecoveryCandidateTemplate({ beforeTemplate: { ...beforeTemplate, containers: [{ ...beforeTemplate.containers[0], image: 'wrong' }, beforeTemplate.containers[1]] }, profile, capsule: capsule(), candidateRevision: paths.candidateRevision, candidateOrigin }), /ARTIFACT_MISMATCH/u)
})

test('workbench response proves counts and reads authority through its signed contract payload', () => {
  const payload = { version: 'dev087-v1', companyId: 'company-jenfu', actorId: 'user-admin', schemaHash: 'dev090-v1', expectedCommit: AUTHORITY_RECOVERY_BASELINE.runtimeCommit, mode: 'canonical_only', issuedAt: Date.now() }
  const token = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
  const observation = assertWorkbenchRecoveryPayload({ data: { totalRows: 50 }, meta: { contractToken: token } }, { id: 'drawing-workbench', rows: 50, mode: 'canonical_only', schemaHash: 'dev090-v1', expectedCommit: AUTHORITY_RECOVERY_BASELINE.runtimeCommit })
  assert.equal(observation.totalRows, 50)
  assert.equal(observation.authority.expectedCommit, AUTHORITY_RECOVERY_BASELINE.runtimeCommit)
  assert.throws(() => assertWorkbenchRecoveryPayload({ data: { totalRows: 0 }, meta: { contractToken: token } }, { id: 'drawing-workbench', rows: 50, mode: 'canonical_only', schemaHash: 'dev090-v1', expectedCommit: AUTHORITY_RECOVERY_BASELINE.runtimeCommit }), /PAYLOAD_MISMATCH/u)
})

test('stage receipts are self-hashed and bound to the incident capsule', () => {
  const value = buildRecoveryReceipt({ stage: 'candidate', capsule: capsule(), capsuleSha256, facts: { candidatePercent: 0 }, observedAt: new Date().toISOString() })
  assert.equal(assertRecoveryReceipt(value, { stage: 'candidate', capsule: capsule(), capsuleSha256 }).status, 'PASS')
  assert.throws(() => assertRecoveryReceipt({ ...value, facts: { candidatePercent: 100 } }, { stage: 'candidate', capsule: capsule(), capsuleSha256 }), /RECEIPT_INVALID/u)
})

test('workflow exposes one immutable capsule input and pauses activation in its own environment', () => {
  const source = fs.readFileSync('.github/workflows/recover-ai-pdm-workbench-authority.yml', 'utf8')
  const inputBlock = source.match(/workflow_dispatch:\s*\n\s*inputs:\s*\n([\s\S]*?)\n\s*concurrency:/u)?.[1] ?? ''
  assert.deepEqual([...inputBlock.matchAll(/^\s{6}([A-Za-z0-9_-]+):/gmu)].map((match) => match[1]), ['releaseCapsuleRef'])
  assert.match(source, /group: production-release-ai-pdm-prod/u)
  assert.match(source, /name: production-activation/u)
  assert.match(source, /Verify authority and both workbenches on candidate/u)
  assert.doesNotMatch(source, /inputs:\s*[\s\S]*?(?:project|service|stage|command|sql):/u)
})
