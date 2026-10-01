import { assertImmutableRef, canonicalize, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertPrincipalOnlyRecoveryBinding, assertRecoveryProofReadback } from './dev121-principal-only-release.mjs'

const same = (a, b) => canonicalize(a) === canonicalize(b)
const fail = () => { throw new Error('DEV121_PREACTIVATION_CONTINUATION_INVALID') }
const traffic = (rows, revision) => Array.isArray(rows) && rows.length === 1
  && rows[0].revision === revision && Number(rows[0].percent) === 100 && !rows[0].tag

// A finalized abort is not a successful release or a maintenance rollback.
// Certify the cleaned, still-stopped original traffic before preparing a retry.
export async function readPreActivationAbortContinuation({ profile, transport, baselineIntentRef, service = null, control = null }) {
  const bucket = profile.artifact.releaseBucket
  assertImmutableRef(baselineIntentRef, bucket, ['receipts'])
  const baseline = await transport.readJson(baselineIntentRef, bucket, ['receipts'])
  const intent = baseline.value
  if (intent?.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(intent.sourceRevision ?? '')) fail()
  const paths = releasePaths(profile, intent, baselineIntentRef.sha256)
  const read = async (uri) => {
    const row = await transport.readBytes(uri, { prefixes: ['receipts'] })
    if (row.ref.uri !== uri || row.ref.sha256 !== sha256(row.bytes)) fail()
    return { ...row, value: JSON.parse(row.bytes.toString('utf8')) }
  }
  const seal = (row, stage) => {
    const { receiptSha256, ...core } = row.value ?? {}
    if (receiptSha256 !== sha256(canonicalize(core)) || core.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
      || core.ownerApplicationId !== profile.application.id || core.releaseId !== intent.releaseId
      || core.sourceRevision !== intent.sourceRevision || core.stage !== stage || core.status !== 'PASS') fail()
    return core.facts
  }
  const terminal = await read(paths.terminal)
  const terminalFacts = seal(terminal, 'terminal')
  if (['RELEASED', 'ROLLED_BACK'].includes(terminalFacts.result)) return null
  if (terminalFacts.result !== 'PRE_ACTIVATION_ABORTED') fail()
  if (!control) control = JSON.parse((await transport.readBytes(`gs://${bucket}/control/active.json`, { prefixes: ['control'] })).bytes)
  if (control.result !== 'PRE_ACTIVATION_ABORTED') fail()
  const binding = assertPrincipalOnlyRecoveryBinding(intent, bucket)
  if (!binding) fail()
  const [rollback, candidate, deployment, migration, source, proof, revision] = await Promise.all([
    read(paths.rollback), read(paths.candidate), read(paths.deployment), read(paths.migrate),
    transport.readJson(intent.sourceLockRef, bucket, ['receipts']), transport.readJson(binding.receiptRef, bucket, ['receipts']),
    transport.getRevision(profile, binding.revision),
  ])
  const rollbackFacts = seal(rollback, 'rollback'), candidateFacts = seal(candidate, 'candidate')
  if (terminalFacts.result !== 'PRE_ACTIVATION_ABORTED' || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || terminalFacts.databaseDisposition !== 'FORWARD_APPLIED' || rollbackFacts.databaseDisposition !== 'FORWARD_APPLIED'
    || terminalFacts.previousRevision !== binding.revision || rollbackFacts.previousRevision !== binding.revision
    || !same(terminal.value.previousReceiptRef, rollback.ref)
    || rollbackFacts.entrypointRecovery?.result !== 'BASELINE_ALREADY_ACTIVE' || rollbackFacts.entrypointRecovery.changed !== false
    || candidateFacts.previousRevision !== intent.previousRevision || !traffic(candidateFacts.beforeTraffic, intent.previousRevision)
    || !same(candidateFacts.deploymentCapsuleRef, deployment.ref) || !same(candidateFacts.migrationReceiptRef, migration.ref)
    || !same(deployment.value.releaseIntentRef, baselineIntentRef) || deployment.value.sourceRevision !== intent.sourceRevision
    || candidateFacts.artifactDigest !== deployment.value.artifactDigest
    || !deployment.value.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`)
    || source.value.status !== 'SOURCE_FROZEN' || source.value.clean !== true || source.value.releaseAuthority !== true
    || source.value.ownerApplicationId !== profile.application.id || source.value.sourceRevision !== intent.sourceRevision
    || source.value.migrationManifestSha256 !== intent.migrationManifestSha256) fail()
  if (migration.value.schemaVersion === 'jenfu.dev012.stage-receipt.v1') {
    const facts = seal(migration, 'migrate')
    if (facts.disposition !== 'UNCHANGED_VERIFIED' || facts.manifestSha256 !== intent.migrationManifestSha256) fail()
  } else if (migration.value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1'
    || migration.value.ownerApplicationId !== profile.application.id || migration.value.sourceRevision !== intent.sourceRevision
    || migration.value.manifestSha256 !== intent.migrationManifestSha256 || migration.value.status !== 'PASS'
    || migration.value.boundaryStatus !== 'PASS') fail()
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...core } = control
  const prefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control.ownerRunRef?.startsWith(prefix) ? control.ownerRunRef.slice(prefix.length) : ''
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(core))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED'
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName || control.controlBucket !== bucket
    || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision || control.sourceLockSha256 !== intent.sourceLockRef.sha256
    || control.previousRevision !== binding.revision || control.candidateRevision !== candidateFacts.candidateRevision
    || [intent.previousRevision, binding.revision].includes(control.candidateRevision)
    || !/^[a-f0-9]{64}$/u.test(control.inputFingerprint ?? '') || !/^[1-9][0-9]*$/u.test(runId)
    || !Number.isFinite(Date.parse(control.deadlineAt)) || !Number.isFinite(Date.parse(control.leaseExpiresAt))
    || Date.parse(control.leaseExpiresAt) >= Date.now()) fail()
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  service ??= await transport.getService(profile)
  if (service.scaling?.scalingMode !== 'MANUAL' || ![0, '0'].includes(service.scaling.manualInstanceCount)
    || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)) fail()
  assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision, oldRevision: intent.previousRevision, binding,
    profile, proof: proof.value, service, revision })
  const candidateRevision = await transport.getRevision(profile, candidateFacts.candidateRevision)
  if (candidateRevision.name !== `${service.name}/revisions/${candidateFacts.candidateRevision}`
    || candidateRevision.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || candidateRevision.containers?.find((row) => row.name === profile.runtime.containerName)?.image !== candidateFacts.artifactDigest) fail()
  try { await read(paths.activate); fail() } catch (error) { if (error.code !== 'MISSING') throw error }
  return { currentActiveRevision: intent.previousRevision, terminalRef: terminal.ref, rollbackRef: rollback.ref,
    migrationRef: migration.ref, candidateRef: candidate.ref, result: 'PRE_ACTIVATION_ABORTED' }
}
