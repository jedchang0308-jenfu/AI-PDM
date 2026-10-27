import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'
import { executePrerequisiteProducer, readGitAuthority } from './dev012-owner-prerequisite-producer.mjs'
import { assertStageReceipt } from './dev012-production-migration-runner.mjs'
import { assertForwardAppliedMigrationContinuation } from './dev122-applied-migration-continuation.mjs'

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
  entrypointSnapshot: 'verifier',
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

async function forwardBindingFromTemplate({ template, templateRef, profile, transport }) {
  if (template.forwardAppliedMigrationContinuation) return assertForwardAppliedMigrationContinuation(template.forwardAppliedMigrationContinuation, profile.artifact.releaseBucket)
  const root = `gs://${profile.artifact.releaseBucket}/receipts/releases/${template.releaseId}/${templateRef.sha256}`
  let row
  try { row = await transport.readBytes(`${root}/migration-admission.json`, { prefixes: ['receipts'] }) }
  catch (error) { if (error?.code === 'MISSING') return null; throw error }
  let admission
  try { admission = JSON.parse(row.bytes.toString('utf8')) } catch { fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID') }
  assertStageReceipt(admission, { ownerApplicationId: 'ai-pdm', releaseId: template.releaseId, sourceRevision: template.sourceRevision, stage: 'migrate' })
  if (admission.facts?.disposition !== 'FORWARD_APPLIED') return null
  const nativeRef = admission.facts.migrationReceiptRef
  if (nativeRef?.uri !== `${root}/migrate.json` || !H64.test(nativeRef.sha256 ?? '')) fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
  const native = await transport.readJson(nativeRef, profile.artifact.releaseBucket, ['receipts'])
  if (native.value?.ledgerCount !== 38) return null
  const prepare = await transport.readBytes(`${root}/prepare.json`, { prefixes: ['receipts'] })
  // This is an index, not migration authority. The fresh prepare/migrate/source
  // observer resolves the complete prior opaque graph before any runtime write.
  return assertForwardAppliedMigrationContinuation({ schemaVersion: 'aipdm.forward-applied-migration-continuation.v1',
    priorIntentRef: templateRef, priorPrepareRef: prepare.ref, priorMigrationAdmissionRef: row.ref }, profile.artifact.releaseBucket)
}

export async function refreshAppliedContinuationCapsule({
  templateRef,
  profile,
  root,
  transport,
  environment,
  createSourceIdentity,
  buildMigrationBundle,
  readSource,
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
  const currentTemplate = { ...template }
  delete currentTemplate.openswxWorkerRef
  validateIntent(currentTemplate, profile)
  const git = gitReader(root, profile)
  const releaseId = assertAppliedContinuationRefreshEnvironment(environment, git.sourceRevision)
  const remaining = Date.parse(template.deadlineAt) - now().getTime()
  if (template.sourceRevision === git.sourceRevision && remaining >= 30 * 60 * 1000) {
    return { ref: templateRef, refreshed: false, releaseId: template.releaseId, sourceRevision: git.sourceRevision }
  }
  if (!currentTemplate.appliedMigrationContinuation || !currentTemplate.postAbortLedgerReadbackRef
    || !currentTemplate.principalOnlyFenceRef || !currentTemplate.principalOnlyRecovery) fail('APPLIED_CONTINUATION_REFRESH_TEMPLATE_INVALID')
  if (!H40.test(currentTemplate.sourceRevision ?? '') || !H40.test(git.sourceRevision ?? '') || !readSource.isAncestor?.(currentTemplate.sourceRevision, git.sourceRevision)) fail('APPLIED_CONTINUATION_REFRESH_SOURCE_DIVERGED')
  const forwardAppliedMigrationContinuation = await forwardBindingFromTemplate({ template: currentTemplate, templateRef, profile, transport })
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
  })

  const sourceLock = await producer('source-freeze', null)
  const templateRuntime = await transport.readJson(currentTemplate.runtimeConfigRef, BUCKET, ['receipts'])
  const runtimeConfig = templateRuntime.value?.runtimeConfig ?? templateRuntime.value
  const plainEnvironment = { ...runtimeConfig.plainEnvironment }
  const secretVersions = { ...runtimeConfig.secretVersions }
  delete plainEnvironment.PDM_OPENSWX_DISPATCH_ENABLED
  delete secretVersions.PDM_WORKLOAD_AUTH_CREDENTIALS
  const runtime = await producer('runtime-config', {
    sourceLockRef: sourceLock.ref,
    plainEnvironment,
    secretVersions,
  })
  const infra = await producer('infra-reuse', {
    schemaVersion: 'jenfu.dev012.app-infra-reuse-input.v1',
    sourceLockRef: sourceLock.ref,
    foundationReceiptRef: currentTemplate.foundationReceiptRef,
    existingInfraReceiptRef: currentTemplate.infraReceiptRef,
  })
  const continuation = {
    postAbortLedgerReadbackRef: currentTemplate.postAbortLedgerReadbackRef,
    principalOnlyFenceRef: currentTemplate.principalOnlyFenceRef,
    principalOnlyRecovery: currentTemplate.principalOnlyRecovery,
    appliedMigrationContinuation: currentTemplate.appliedMigrationContinuation,
    ...(forwardAppliedMigrationContinuation ? { forwardAppliedMigrationContinuation } : {}),
  }
  const authority = await producer('routine-authority', {
    schemaVersion: 'jenfu.dev012.routine-owner-authority-input.v1',
    sourceLockRef: sourceLock.ref,
    runtimeConfigRef: runtime.ref,
    baselineIntentRef: currentTemplate.baselineIntentRef,
    expiresAt: releaseDeadlineAt,
    ...continuation,
  })
  const intent = await producer('release-intent', {
    sourceLockRef: sourceLock.ref,
    runtimeConfigRef: runtime.ref,
    authorizationPolicyRef: authority.refs.authorizationPolicyRef,
    readinessReceiptRef: authority.refs.readinessReceiptRef,
    foundationReceiptRef: currentTemplate.foundationReceiptRef,
    infraReceiptRef: infra.ref,
    baselineIntentRef: authority.baselineIntentRef,
    previousRevision: authority.previousRevision,
    deadlineAt: releaseDeadlineAt,
    ...continuation,
  })
  if (!H64.test(intent.ref?.sha256 ?? '')) fail('APPLIED_CONTINUATION_REFRESH_RESULT_INVALID')
  return { ref: intent.ref, refreshed: true, releaseId, sourceRevision: git.sourceRevision, releaseDeadlineAt, templateRef }
}
