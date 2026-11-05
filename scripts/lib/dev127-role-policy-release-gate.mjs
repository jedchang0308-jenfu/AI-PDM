import { canonicalize, sha256, assertStageReceipt, releasePaths } from './dev012-owner-release-runtime.mjs'
import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const FORMATS = ['dynamic-policy-v1', 'dynamic-policy-v2']
const COMPATIBILITY = 'ai-pdm.role-policy-runtime-compatibility.v1'
const FENCE = 'ai-pdm.role-policy-v2-activation-fence.v1'
const fail = code => { throw Object.assign(new Error(code), { code }) }
const bucket = profile => profile.artifact.releaseBucket
const fenceUri = profile => `gs://${bucket(profile)}/control/dev127/role-policy-v2-activation.json`
const imageDigest = (profile, artifact) => {
  const prefix = `${profile.artifact.uri}@sha256:`
  if (!artifact?.startsWith(prefix) || !H64.test(artifact.slice(prefix.length))) fail('DEV127_COMPATIBLE_ARTIFACT_REQUIRED')
  return artifact.slice(prefix.length)
}
const compatibilityUri = (profile, artifact) => `gs://${bucket(profile)}/control/dev127/compatible-artifacts/${imageDigest(profile, artifact)}.json`
export const usesDev127Consumer = profile => profile.application?.id === 'ai-pdm' &&
  profile.migrations?.entries?.some(entry => entry.path === 'db/postgres/096_dev127_platform_super_admin_consumer.sql')

async function named(transport, profile, uri, optional = false) {
  let result
  try { result = await transport.readBytes(uri, { prefixes: ['receipts', 'control'] }) }
  catch (error) { if (optional && error?.code === 'MISSING') return null; throw error }
  let value
  try { value = JSON.parse(result.bytes.toString('utf8')) } catch { fail('DEV127_COMPATIBILITY_EVIDENCE_INVALID') }
  return { ...result, value }
}
function assertCompatibility(value, profile, artifact) {
  if (value?.schemaVersion !== COMPATIBILITY || value.ownerApplicationId !== 'ai-pdm' ||
      value.projectId !== profile.target.projectId || value.service !== profile.target.serviceName ||
      value.artifactDigest !== artifact || !H40.test(value.sourceRevision ?? '') ||
      canonicalize(value.supportedFormats) !== canonicalize(FORMATS) || value.writerFormat !== 'dynamic-policy-v2' || value.ordinaryEntryVerified !== true ||
      !value.finalizedReceiptRef?.uri?.startsWith(`gs://${bucket(profile)}/receipts/`) ||
      !H64.test(value.finalizedReceiptRef?.sha256 ?? '')) fail('DEV127_COMPATIBLE_ARTIFACT_REQUIRED')
  return value
}
function sourceSupportsV2(readSource, revision) {
  let manifest, reader
  try {
    manifest = JSON.parse(readSource('config/access-control/ai-pdm-role-policy-contract-v3.manifest.json', revision).toString('utf8'))
    reader = readSource('src/lib/jenfu-principal-role-catalog.ts', revision).toString('utf8')
  } catch { fail('DEV127_DUAL_READER_SOURCE_REQUIRED') }
  if (manifest.contractVersion !== 'ai-pdm.role-policy-integration.v3' ||
      manifest.producer?.publicationFormat !== 'dynamic-policy-v2' ||
      !reader.includes('decodeLegacyRolePolicyRows') || !reader.includes('v_application_role_catalog_v3')) fail('DEV127_DUAL_READER_SOURCE_REQUIRED')
}
export function dev127ConsumerInstallPlan({ profile, readSource, sourceRevision }) {
  if (!usesDev127Consumer(profile)) return null
  sourceSupportsV2(readSource, sourceRevision)
  return { contractVersion: 'ai-pdm.role-policy-install-transition.v1', supportedReadFormats: FORMATS,
    currentWriterFormat: 'dynamic-policy-v2', policyWritePauseFrom: '096_MIGRATION_COMMIT',
    policyWritePauseUntil: 'DEPLOYED_V2_CONSUMER_AND_OWNER_CATALOG_UPGRADE', ordinaryReadAvailability: 'V1_RETAINED',
    legacyWriterReplayAllowed: false, catalogUpgradeRequiresFinalizedConsumer: true,
    rollbackAfterCatalogActivation: 'V2_COMPATIBLE_ARTIFACT_ONLY' }
}
function revisionArtifact(profile, revision) {
  const app = revision?.containers?.find(container => container.name === profile.runtime.containerName)
  imageDigest(profile, app?.image)
  return app.image
}

/** Invoked only by the existing protected finalize executor after canonical
 * verification, with source from its exact reviewed Git revision. */
export async function recordDev127CompatibleArtifact({ transport, profile, intent, candidate, canonical, finalized, readSource }) {
  if (!usesDev127Consumer(profile)) return null
  sourceSupportsV2(readSource, intent.sourceRevision)
  for (const [stage, row] of [['canonical', canonical], ['finalize', finalized]]) {
    assertStageReceipt(row.value, { ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, stage })
  }
  if (finalized.value.facts.result !== 'RELEASED' || finalized.value.facts.candidateRevision !== candidate.candidateRevision ||
      finalized.value.facts.artifactDigest !== candidate.artifactDigest) fail('DEV127_FINALIZED_CONSUMER_REQUIRED')
  const smoke = canonical.value.facts?.smoke
  if (canonical.value.facts?.candidateRevision !== candidate.candidateRevision || canonical.value.facts?.artifactDigest !== candidate.artifactDigest ||
      canonical.value.facts?.origin !== profile.target.canonicalOrigin || smoke?.status !== 'PASS' || smoke.tokenSource !== 'GITHUB_PRODUCTION_SECRET' ||
      ![['target-session', 200], ['authenticated-probe', 200], ['unauthenticated-probe', 401], ['session-revoked', 401]].every(([id, status]) =>
        smoke.observations?.some(row => row.id === id && row.status === status))) fail('DEV127_ORDINARY_ENTRY_PROOF_REQUIRED')
  const revision = await transport.getRevision(profile, candidate.candidateRevision)
  if (revisionArtifact(profile, revision) !== candidate.artifactDigest) fail('DEV127_COMPATIBLE_ARTIFACT_REQUIRED')
  const uri = compatibilityUri(profile, candidate.artifactDigest)
  const existing = await named(transport, profile, uri, true)
  if (existing) { assertCompatibility(existing.value, profile, candidate.artifactDigest); return existing }
  const value = { schemaVersion: COMPATIBILITY, ownerApplicationId: 'ai-pdm', projectId: profile.target.projectId,
    service: profile.target.serviceName, sourceRevision: intent.sourceRevision, candidateRevision: candidate.candidateRevision,
    artifactDigest: candidate.artifactDigest, supportedFormats: FORMATS, writerFormat: 'dynamic-policy-v2', ordinaryEntryVerified: true,
    canonicalReceiptRef: canonical.ref, finalizedReceiptRef: finalized.ref }
  const written = await transport.putJson(uri, value, { bucket: bucket(profile), prefix: 'control', ifGenerationMatch: '0' })
  return { ...written, value }
}

/** Catalog activation is allowed only after the new consumer's real full owner
 * release ended, ordinary canonical smoke passed and its exact artifact serves 100%. */
export async function requireDev127DeployedConsumer({ transport, profile, intentRef, readSource, expectedSourceRevision }) {
  const loaded = await transport.readJson(intentRef, bucket(profile))
  const intent = loaded.value
  assertDev117ReleaseIntent(intent, profile)
  if (!usesDev127Consumer(profile) || !H40.test(expectedSourceRevision ?? '') || intent.ownerApplicationId !== 'ai-pdm' ||
      intent.sourceRevision !== expectedSourceRevision || sha256(loaded.bytes) !== intentRef.sha256) fail('DEV127_FINALIZED_CONSUMER_REQUIRED')
  sourceSupportsV2(readSource, intent.sourceRevision)
  const paths = releasePaths(profile, intent, intentRef.sha256)
  const terminal = await named(transport, profile, paths.terminal)
  assertStageReceipt(terminal.value, { ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, stage: 'terminal' })
  const facts = terminal.value.facts
  if (facts?.result !== 'RELEASED' || facts.remainingHumanAction !== 0) fail('DEV127_FINALIZED_CONSUMER_REQUIRED')
  const control = await named(transport, profile, `gs://${bucket(profile)}/control/active.json`)
  const { controlSha256, ...controlCore } = control.value
  if (controlSha256 !== sha256(canonicalize(controlCore)) || control.value.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' ||
      control.value.ownerApplicationId !== 'ai-pdm' || control.value.service !== profile.target.serviceName ||
      control.value.sourceLockSha256 !== intent.sourceLockRef.sha256 || control.value.state !== 'FINALIZED' || control.value.result !== 'RELEASED' ||
      control.value.sourceRevision !== intent.sourceRevision || control.value.releaseId !== intent.releaseId ||
      control.value.candidateRevision !== facts.candidateRevision) fail('DEV127_FINALIZED_CONSUMER_REQUIRED')
  const service = await transport.getService(profile)
  transport.assertServiceSettled(service, 'DEV127_FINALIZED_CONSUMER_REQUIRED')
  if (transport.effectiveRevision(service) !== facts.candidateRevision || service.traffic?.some(row => row.tag)) fail('DEV127_FINALIZED_CONSUMER_REQUIRED')
  const revision = await transport.getRevision(profile, facts.candidateRevision)
  if (revisionArtifact(profile, revision) !== facts.artifactDigest) fail('DEV127_COMPATIBLE_ARTIFACT_REQUIRED')
  const compatible = await named(transport, profile, compatibilityUri(profile, facts.artifactDigest))
  assertCompatibility(compatible.value, profile, facts.artifactDigest)
  return { intent, terminal, compatible, artifactDigest: facts.artifactDigest, candidateRevision: facts.candidateRevision }
}

/** Write before the first catalog-v2 DB commit. A failed/unknown DB outcome
 * retains the conservative fence; receipts/status decide safe continuation. */
export async function establishDev127ActivationFence({ transport, profile, deployment }) {
  const uri = fenceUri(profile)
  const existing = await named(transport, profile, uri, true)
  if (existing) { assertFence(existing.value, profile); return existing }
  const value = { schemaVersion: FENCE, ownerApplicationId: 'ai-pdm', projectId: profile.target.projectId,
    service: profile.target.serviceName, minimumPublicationFormat: 'dynamic-policy-v2',
    compatibilityReceiptRef: deployment.compatible.ref, terminalReceiptRef: deployment.terminal.ref }
  const result = await transport.putJson(uri, value, { bucket: bucket(profile), prefix: 'control', ifGenerationMatch: '0' })
  return { ...result, value }
}
function assertFence(value, profile) {
  if (value?.schemaVersion !== FENCE || value.ownerApplicationId !== 'ai-pdm' || value.projectId !== profile.target.projectId ||
      value.service !== profile.target.serviceName || value.minimumPublicationFormat !== 'dynamic-policy-v2' ||
      !value.compatibilityReceiptRef?.uri?.startsWith(`gs://${bucket(profile)}/control/dev127/compatible-artifacts/`) ||
      !H64.test(value.compatibilityReceiptRef?.sha256 ?? '')) fail('DEV127_ACTIVATION_FENCE_INVALID')
}

/** The protected rollback executor must not restore a v1-only image after the
 * activation fence. Missing fence is the pre-upgrade window; DENIED/UNKNOWN fails. */
export async function requireDev127CompatibleRollback({ transport, profile, revision }) {
  if (!usesDev127Consumer(profile)) return null
  const fence = await named(transport, profile, fenceUri(profile), true)
  if (!fence) return null
  assertFence(fence.value, profile)
  const target = await transport.getRevision(profile, revision)
  const artifact = revisionArtifact(profile, target)
  const proof = await named(transport, profile, compatibilityUri(profile, artifact), true)
  if (!proof) fail('DEV127_ROLLBACK_REQUIRES_V2_CONSUMER')
  return assertCompatibility(proof.value, profile, artifact)
}
