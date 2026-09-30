const SERVICE = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
const IMAGE = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-recovery@sha256:[a-f0-9]{64}$/u
const REVISION = /^ai-pdm-prod-[a-z0-9-]+$/u
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

function fail() { throw new Error('DEV121_PRINCIPAL_RECOVERY_INVALID') }
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && typeof value === 'object' &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}
function exactTraffic(rows, revision, tag = null, percent = 100) {
  return Array.isArray(rows) && rows.length === 1 &&
    rows[0]?.revision === revision && Number(rows[0]?.percent) === percent &&
    rows[0]?.latestRevision !== true &&
    (tag === null ? rows[0]?.tag === undefined : rows[0]?.tag === tag)
}
function zeroInstances(value) {
  return value === 0 || value === '0'
}

export function assertPrincipalOnlyRecoveryBinding(intent, bucket) {
  if (!intent?.principalOnlyFenceRef && !intent?.principalOnlyRecovery) return null
  const binding = intent.principalOnlyRecovery
  if (!intent.principalOnlyFenceRef || !exactKeys(binding,
    ['revision', 'imageDigest', 'serviceUid', 'receiptRef']) ||
    !/^[a-f0-9-]{36}$/u.test(binding.serviceUid ?? '') ||
    !REVISION.test(intent.previousRevision ?? '') ||
    !REVISION.test(binding.revision ?? '') ||
    binding.revision === intent.previousRevision ||
    !IMAGE.test(binding.imageDigest ?? '') ||
    !exactKeys(binding.receiptRef, ['uri', 'sha256']) ||
    !binding.receiptRef.uri.startsWith(`gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/`) ||
    !/\.json$/u.test(binding.receiptRef.uri) ||
    !H64.test(binding.receiptRef.sha256 ?? '')) fail()
  return binding
}

export function principalOnlyRollbackRevision(intent) {
  return intent.principalOnlyRecovery?.revision ?? intent.previousRevision
}

export function assertPrincipalOnlyRecoveryReadback({ intent, profile, proof, service, revision }) {
  const binding = assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket)
  if (!binding || !exactKeys(proof, ['schemaVersion', 'sourceRevision',
    'projectId', 'region', 'service', 'serviceUid', 'oldRevision',
    'recoveryRevision', 'imageDigest', 'status']) ||
    proof.schemaVersion !== 'ai-pdm.principal-only-recovery.v1' ||
    !H40.test(intent.sourceRevision ?? '') || proof.sourceRevision !== intent.sourceRevision ||
    proof.projectId !== profile.target.projectId || proof.region !== profile.target.region ||
    proof.service !== profile.target.serviceName || proof.serviceUid !== binding.serviceUid ||
    proof.serviceUid !== service?.uid ||
    proof.oldRevision !== intent.previousRevision ||
    proof.recoveryRevision !== binding.revision ||
    proof.imageDigest !== binding.imageDigest || proof.status !== 'PASS' ||
    service?.name !== SERVICE || service?.reconciling === true ||
    service?.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(service?.observedGeneration) !== String(service?.generation) ||
    !exactTraffic(service.traffic, intent.previousRevision) ||
    !exactTraffic(service.trafficStatuses, intent.previousRevision) ||
    revision?.name !== `${SERVICE}/revisions/${binding.revision}` ||
    revision?.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' ||
    revision?.containers?.find((row) => row.name === profile.runtime.containerName)?.image !== binding.imageDigest) fail()
  return binding
}

export function principalOnlyActivationRequest({ service, oldRevision, candidateRevision,
  candidateTag, recoveryRevision }) {
  if (service?.name !== SERVICE || !service.etag || service.reconciling === true ||
    service.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(service.observedGeneration) !== String(service.generation) ||
    service.scaling?.scalingMode !== 'MANUAL' ||
    !zeroInstances(service.scaling?.manualInstanceCount) ||
    !REVISION.test(oldRevision ?? '') || !REVISION.test(candidateRevision ?? '') ||
    !REVISION.test(recoveryRevision ?? '') ||
    new Set([oldRevision, candidateRevision, recoveryRevision]).size !== 3 ||
    !/^candidate-[a-f0-9]{12}$/u.test(candidateTag ?? '')) fail()
  for (const rows of [service.traffic, service.trafficStatuses]) {
    if (!Array.isArray(rows) || rows.length !== 2 ||
      !exactTraffic([rows[0]], oldRevision) ||
      !exactTraffic([rows[1]], candidateRevision, candidateTag, 0)) fail()
  }
  return {
    name: service.name, etag: service.etag,
    scaling: { scalingMode: 'AUTOMATIC', manualInstanceCount: null },
    traffic: [
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 100 },
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 0, tag: candidateTag },
    ],
  }
}

export function assertPrincipalOnlyActivationReadback({ before, after,
  candidateRevision, candidateTag, recoveryRevision }) {
  if (after?.name !== SERVICE || after.uid !== before?.uid ||
    after.reconciling === true || after.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(after.observedGeneration) !== String(after.generation) ||
    Number(after.generation) <= Number(before.generation) ||
    after.scaling?.scalingMode !== 'AUTOMATIC' ||
    (after.scaling.manualInstanceCount != null && Number(after.scaling.manualInstanceCount) !== 0) ||
    !REVISION.test(recoveryRevision ?? '') ||
    !Array.isArray(after.traffic) || !Array.isArray(after.trafficStatuses) ||
    after.traffic.length !== 2 || after.trafficStatuses.length < 1 ||
    after.trafficStatuses.length > 2 ||
    !exactTraffic([after.traffic[0]], candidateRevision) ||
    !exactTraffic([after.traffic[1]], candidateRevision, candidateTag, 0) ||
    after.trafficStatuses.some((row) => row.revision !== candidateRevision ||
      ![undefined, candidateTag].includes(row.tag) || ![0, 100].includes(Number(row.percent))) ||
    after.trafficStatuses.filter((row) => Number(row.percent) === 100).length !== 1 ||
    after.traffic.some((row) => row.revision === recoveryRevision)) fail()
  return after
}
