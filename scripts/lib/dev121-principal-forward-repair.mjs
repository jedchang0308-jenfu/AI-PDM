import { assertImmutableRef, assertRuntimeConfig, canonicalize, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertPrincipalOnlyRecoveryBinding, assertRecoveryProofReadback } from './dev121-principal-only-release.mjs'

function fail() { throw new Error('DEV121_PRINCIPAL_FORWARD_REPAIR_INVALID') }
const same = (a, b) => canonicalize(a) === canonicalize(b)

// A maintenance revision has no application environment or database connection.
// Recover the last attempted application's configuration from sealed owner
// evidence, never from a legacy serving revision or caller-supplied fields.
export async function readPrincipalOnlyRepairBaseline({ profile, transport, baselineIntentRef, service = null, control = null }) {
  const bucket = profile.artifact.releaseBucket
  assertImmutableRef(baselineIntentRef, bucket, ['receipts'])
  const baseline = await transport.readJson(baselineIntentRef, bucket, ['receipts'])
  const intent = baseline.value
  if (!Object.hasOwn(intent ?? {}, 'principalOnlyRecovery')) return null
  if (intent.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(intent.sourceRevision ?? '')) fail()
  const binding = assertPrincipalOnlyRecoveryBinding(intent, bucket)
  const paths = releasePaths(profile, intent, baselineIntentRef.sha256)
  const read = async (uri) => {
    const result = await transport.readBytes(uri, { prefixes: ['receipts'] })
    if (result.ref.uri !== uri || result.ref.sha256 !== sha256(result.bytes)) fail()
    return { ...result, value: JSON.parse(result.bytes.toString('utf8')) }
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
  if (['RELEASED', 'PRE_ACTIVATION_ABORTED'].includes(terminalFacts.result)) return null
  if (terminalFacts.result !== 'ROLLED_BACK') fail()
  const [rollback, candidate, deployment, migration, runtime, proof, revision] = await Promise.all([
    read(paths.rollback), read(paths.candidate), read(paths.deployment), read(paths.migrate),
    transport.readJson(intent.runtimeConfigRef, bucket, ['receipts']),
    transport.readJson(binding.receiptRef, bucket, ['receipts']),
    transport.getRevision(profile, binding.revision),
  ])
  const rollbackFacts = seal(rollback, 'rollback')
  const candidateFacts = seal(candidate, 'candidate')
  if (!same(terminal.value.previousReceiptRef, rollback.ref)
    || terminalFacts.previousRevision !== binding.revision || rollbackFacts.previousRevision !== binding.revision
    || rollbackFacts.result !== 'ROLLED_BACK' || terminalFacts.databaseDisposition !== 'FORWARD_APPLIED'
    || rollbackFacts.databaseDisposition !== 'FORWARD_APPLIED'
    || !same(candidateFacts.deploymentCapsuleRef, deployment.ref) || !same(candidateFacts.migrationReceiptRef, migration.ref)
    || !same(deployment.value.releaseIntentRef, baselineIntentRef) || deployment.value.sourceRevision !== intent.sourceRevision
    || candidateFacts.artifactDigest !== deployment.value.artifactDigest
    || !deployment.value.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`)) fail()
  if (migration.value.schemaVersion === 'jenfu.dev012.stage-receipt.v1') {
    const facts = seal(migration, 'migrate')
    if (facts.disposition !== 'UNCHANGED_VERIFIED' || facts.manifestSha256 !== intent.migrationManifestSha256) fail()
  } else if (migration.value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1'
    || migration.value.ownerApplicationId !== profile.application.id || migration.value.sourceRevision !== intent.sourceRevision
    || migration.value.manifestSha256 !== intent.migrationManifestSha256 || migration.value.status !== 'PASS'
    || migration.value.boundaryStatus !== 'PASS') fail()
  if (!control) {
    const result = await transport.readBytes(paths.control, { prefixes: ['control'] })
    control = JSON.parse(result.bytes.toString('utf8'))
  }
  const expectedControl = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket',
    'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef',
    'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  if (!control || !same(Object.keys(control).sort(), expectedControl.sort())
    || !/^[a-f0-9]{64}$/u.test(control.inputFingerprint ?? '')
    || !/^[a-f0-9]{64}$/u.test(control.sourceLockSha256 ?? '')
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || !Number.isFinite(Date.parse(control.deadlineAt))
    || [binding.revision, intent.previousRevision].includes(control.candidateRevision)) fail()
  const { controlSha256, ...controlCore } = control ?? {}
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control?.ownerRunRef?.startsWith(runPrefix) ? control.ownerRunRef.slice(runPrefix.length) : ''
  if (controlSha256 !== sha256(canonicalize(controlCore)) || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1'
    || control.state !== 'FINALIZED' || control.result !== 'ROLLED_BACK'
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName
    || control.controlBucket !== bucket || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision
    || control.sourceLockSha256 !== intent.sourceLockRef.sha256 || control.previousRevision !== binding.revision
    || control.candidateRevision !== candidateFacts.candidateRevision || !/^[1-9][0-9]*$/u.test(runId)) fail()
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  service ??= await transport.getService(profile)
  assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision, oldRevision: intent.previousRevision,
    activeRevision: binding.revision, binding, profile, proof: proof.value, service, revision })
  const app = revision.containers.find((row) => row.name === profile.runtime.containerName)
  if (revision.containers.length !== 1 || app.env?.length || app.dependsOn?.length || app.volumeMounts?.length
    || revision.volumes?.length) fail()
  const runtimeConfig = runtime.value.runtimeConfig ?? runtime.value
  assertRuntimeConfig(profile, runtimeConfig)
  return { intent, activeRevision: binding.revision, terminalRef: terminal.ref, rollbackRef: rollback.ref,
    migrationRef: migration.ref, runtimeConfig, recoveryRef: binding.receiptRef }
}
