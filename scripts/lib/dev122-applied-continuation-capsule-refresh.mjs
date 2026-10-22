import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'
import { executePrerequisiteProducer, readGitAuthority } from './dev012-owner-prerequisite-producer.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const WORKFLOW = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main'

function fail(code) { throw Object.assign(new Error(code), { code }) }

export function bindAppliedContinuationTemplateRef(value) {
  const match = /^(gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/[A-Za-z0-9._/-]+\.json)#sha256=([a-f0-9]{64})$/u.exec(value ?? '')
  if (!match || match[1].includes('/../') || match[1].includes('//', 5)) fail('APPLIED_CONTINUATION_TEMPLATE_REF_INVALID')
  return { uri: match[1], sha256: match[2] }
}

export function assertAppliedContinuationRefreshEnvironment(environment, sourceRevision) {
  if (environment?.GITHUB_ACTIONS !== 'true' || environment.GITHUB_REPOSITORY !== 'jedchang0308-jenfu/AI-PDM'
    || environment.GITHUB_WORKFLOW_REF !== WORKFLOW || environment.GITHUB_REF !== 'refs/heads/main'
    || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' || environment.GITHUB_SHA !== sourceRevision
    || environment.PDM_APPLIED_MIGRATION_CONTINUATION_RELEASE !== 'true'
    || !/^[0-9]+$/u.test(environment.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/u.test(environment.GITHUB_RUN_ATTEMPT ?? '')) fail('APPLIED_CONTINUATION_REFRESH_WORKFLOW_REQUIRED')
  return `DEV122-RD-WIF-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}`
}

export const APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES = Object.freeze({
  readBytes: 'verifier',
  readJson: 'verifier',
  readOwnerSourceProof: 'verifier',
  readOwnerRun: 'verifier',
  getService: 'verifier',
  getRevision: 'verifier',
  assertServiceSettled: 'verifier',
  assertRevisionReady: 'verifier',
  assertCanonicalEntrypoint: 'verifier',
  effectiveRevision: 'verifier',
  now: 'verifier',
  putBytes: 'builder',
  putJson: 'builder',
  request: 'verifier',
})

export function createAppliedContinuationRefreshTransport({ verifier, builder }) {
  const roles = { verifier, builder }
  if (Object.values(roles).some(value => !value)) fail('APPLIED_CONTINUATION_REFRESH_TRANSPORT_INVALID')
  const routes = Object.entries(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES).map(([method, role]) => {
    const source = roles[role]
    if (typeof source[method] !== 'function') throw Object.assign(new Error(`APPLIED_CONTINUATION_REFRESH_TRANSPORT_INVALID:${role}:${method}`), { code: 'APPLIED_CONTINUATION_REFRESH_TRANSPORT_INVALID' })
    return [method, (...args) => source[method](...args)]
  })
  return Object.freeze(Object.fromEntries(routes))
}

export async function refreshAppliedContinuationCapsule({
  templateRef,
  profile,
  root,
  transport,
  environment,
  createSourceIdentity,
  buildMigrationBundle,
  readWorkerSource,
  validateIntent = assertDev117ReleaseIntent,
  gitReader = readGitAuthority,
  producePrerequisite = executePrerequisiteProducer,
  now = () => new Date(),
}) {
  const templateRow = await transport.readJson(templateRef, profile.artifact.releaseBucket, ['receipts'])
  const template = templateRow.value
  if (template?.schemaVersion !== profile.schemas.releaseIntent) {
    return { ref: templateRef, refreshed: false, releaseId: null, sourceRevision: null }
  }
  validateIntent(template, profile)
  const git = gitReader(root, profile)
  const releaseId = assertAppliedContinuationRefreshEnvironment(environment, git.sourceRevision)
  const remaining = Date.parse(template.deadlineAt) - now().getTime()
  if (template.sourceRevision === git.sourceRevision && remaining >= 30 * 60 * 1000) {
    return { ref: templateRef, refreshed: false, releaseId: template.releaseId, sourceRevision: git.sourceRevision }
  }
  if (!template.appliedMigrationContinuation || !template.openswxWorkerRef || !template.postAbortLedgerReadbackRef
    || !template.principalOnlyFenceRef || !template.principalOnlyRecovery) fail('APPLIED_CONTINUATION_REFRESH_TEMPLATE_INVALID')
  if (!H40.test(template.sourceRevision ?? '') || !H40.test(git.sourceRevision ?? '') || !readWorkerSource.isAncestor?.(template.sourceRevision, git.sourceRevision)) fail('APPLIED_CONTINUATION_REFRESH_SOURCE_DIVERGED')
  const releaseDeadlineAt = new Date(now().getTime() + 2 * 60 * 60 * 1000).toISOString()
  const producer = (stage, input) => producePrerequisite({
    stage,
    releaseId,
    input,
    profile,
    root,
    transport,
    validateIntent,
    createSourceIdentity,
    buildMigrationBundle,
    readWorkerSource,
  })

  const sourceLock = await producer('source-freeze', null)
  const templateRuntime = await transport.readJson(template.runtimeConfigRef, BUCKET, ['receipts'])
  const runtimeConfig = templateRuntime.value?.runtimeConfig ?? templateRuntime.value
  const runtime = await producer('runtime-config', {
    sourceLockRef: sourceLock.ref,
    plainEnvironment: runtimeConfig.plainEnvironment,
    secretVersions: runtimeConfig.secretVersions,
    openswxWorkerRef: template.openswxWorkerRef,
  })
  const infra = await producer('infra-reuse', {
    schemaVersion: 'jenfu.dev012.app-infra-reuse-input.v1',
    sourceLockRef: sourceLock.ref,
    foundationReceiptRef: template.foundationReceiptRef,
    existingInfraReceiptRef: template.infraReceiptRef,
  })
  const continuation = {
    postAbortLedgerReadbackRef: template.postAbortLedgerReadbackRef,
    principalOnlyFenceRef: template.principalOnlyFenceRef,
    principalOnlyRecovery: template.principalOnlyRecovery,
    appliedMigrationContinuation: template.appliedMigrationContinuation,
  }
  const authority = await producer('routine-authority', {
    schemaVersion: 'jenfu.dev012.routine-owner-authority-input.v1',
    sourceLockRef: sourceLock.ref,
    runtimeConfigRef: runtime.ref,
    baselineIntentRef: template.baselineIntentRef,
    expiresAt: releaseDeadlineAt,
    ...continuation,
  })
  const intent = await producer('release-intent', {
    sourceLockRef: sourceLock.ref,
    runtimeConfigRef: runtime.ref,
    authorizationPolicyRef: authority.refs.authorizationPolicyRef,
    readinessReceiptRef: authority.refs.readinessReceiptRef,
    foundationReceiptRef: template.foundationReceiptRef,
    infraReceiptRef: infra.ref,
    baselineIntentRef: template.baselineIntentRef,
    openswxWorkerRef: template.openswxWorkerRef,
    previousRevision: authority.previousRevision,
    deadlineAt: releaseDeadlineAt,
    ...continuation,
  })
  if (!H64.test(intent.ref?.sha256 ?? '')) fail('APPLIED_CONTINUATION_REFRESH_RESULT_INVALID')
  return { ref: intent.ref, refreshed: true, releaseId, sourceRevision: git.sourceRevision, releaseDeadlineAt,
    reusedWorkerDescriptorRef: template.openswxWorkerRef, templateRef }
}
