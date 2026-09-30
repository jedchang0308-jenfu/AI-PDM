const TARGET = Object.freeze({ name: 'ai-pdm-prod', namespace: '9536592944' })
const V2_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'

function fail() { throw new Error('DEV121_AIPDM_QUIESCENCE_READBACK_INVALID') }
function integer(value) {
  if (typeof value !== 'number' &&
    !(typeof value === 'string' && /^[0-9]+$/u.test(value))) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}
function singleUntaggedTraffic(service, revision) {
  for (const traffic of [service?.spec?.traffic, service?.status?.traffic]) {
    if (!Array.isArray(traffic) || traffic.length !== 1 ||
      traffic[0]?.revisionName !== revision || traffic[0]?.percent !== 100 ||
      Object.hasOwn(traffic[0], 'tag')) fail()
  }
}
function serviceIdentity(service) {
  const metadata = service?.metadata
  if (metadata?.name !== TARGET.name || metadata?.namespace !== TARGET.namespace ||
    typeof metadata?.uid !== 'string' || !metadata.uid ||
    integer(metadata.generation) === null ||
    integer(service?.status?.observedGeneration) !== integer(metadata.generation)) fail()
  return { uid: metadata.uid, generation: integer(metadata.generation) }
}

/**
 * A narrow readback guard for the old AI-PDM HTTP writer. It does not attest
 * independent database writers, owner Jobs or the provenance of clock inputs.
 * Those facts must be checked separately before the owner apply transaction.
 */
export function assertAiPdmQuiescenceReadbacks({ before, after,
  oldRevision, disabledCompletedAt, observedAt }) {
  if (typeof oldRevision !== 'string' ||
    !/^ai-pdm-prod-[a-z0-9]+$/u.test(oldRevision)) fail()
  const baseline = serviceIdentity(before)
  const current = serviceIdentity(after)
  const latestReady = before.status.latestReadyRevisionName
  if (baseline.uid !== current.uid || current.generation <= baseline.generation ||
    typeof latestReady !== 'string' ||
    !/^ai-pdm-prod-[a-z0-9]+$/u.test(latestReady) ||
    after.status.latestReadyRevisionName !== latestReady) fail()
  singleUntaggedTraffic(before, oldRevision)
  singleUntaggedTraffic(after, oldRevision)
  const beforeScaling = before.metadata.annotations ?? {}
  const afterScaling = after.metadata.annotations ?? {}
  if (!['automatic', undefined].includes(
    beforeScaling['run.googleapis.com/scalingMode']) ||
    beforeScaling['run.googleapis.com/manualInstanceCount'] !== undefined ||
    afterScaling['run.googleapis.com/scalingMode'] !== 'manual' ||
    afterScaling['run.googleapis.com/manualInstanceCount'] !== '0') fail()
  const timeout = integer(before?.spec?.template?.spec?.timeoutSeconds)
  if (!timeout || timeout > 60 ||
    integer(after?.spec?.template?.spec?.timeoutSeconds) !== timeout ||
    JSON.stringify(before.spec.template) !== JSON.stringify(after.spec.template)) fail()
  const stopped = Date.parse(disabledCompletedAt)
  const observed = Date.parse(observedAt)
  if (!Number.isFinite(stopped) || !Number.isFinite(observed) ||
    observed - stopped < (timeout + 30) * 1000) fail()
  return Object.freeze({ service: TARGET.name, uid: current.uid,
    oldRevision, beforeGeneration: baseline.generation,
    quiescentGeneration: current.generation,
    requestTimeoutSeconds: timeout, drainSeconds: timeout + 30 })
}

/**
 * Verify the live Cloud Run Admin v2 readback immediately before owner work.
 * A zero-instance service is the writer fence; a zero-session DB snapshot alone
 * cannot establish that the legacy revision will not start another request.
 */
export function assertAiPdmQuiescentV2Service({ service, oldRevision,
  expectedUid, beforeGeneration, expectedQuiescentGeneration, observedAt,
  requestTimeoutSeconds }) {
  if (service?.name !== V2_NAME || typeof service.uid !== 'string' ||
    !service.uid || service.uid !== expectedUid ||
    integer(beforeGeneration) === null ||
    integer(service.generation) <= integer(beforeGeneration) ||
    integer(expectedQuiescentGeneration) === null ||
    integer(service.generation) !== integer(expectedQuiescentGeneration) ||
    service.reconciling === true ||
    service.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    integer(service.generation) === null ||
    integer(service.observedGeneration) !== integer(service.generation) ||
    service.scaling?.scalingMode !== 'MANUAL' ||
    integer(service.scaling?.manualInstanceCount) !== 0 ||
    typeof oldRevision !== 'string' ||
    !/^ai-pdm-prod-[a-z0-9]+$/u.test(oldRevision) ||
    !Array.isArray(service.traffic) || service.traffic.length !== 1 ||
    service.traffic[0]?.revision !== oldRevision ||
    Number(service.traffic[0]?.percent) !== 100 ||
    service.traffic[0]?.tag !== undefined ||
    service.traffic[0]?.latestRevision === true ||
    !Array.isArray(service.trafficStatuses) ||
    service.trafficStatuses.length !== 1 ||
    service.trafficStatuses[0]?.revision !== oldRevision ||
    Number(service.trafficStatuses[0]?.percent) !== 100 ||
    service.trafficStatuses[0]?.tag !== undefined) fail()
  const timeout = integer(requestTimeoutSeconds)
  if (service.template?.timeout !== `${timeout}s`) fail()
  // The provider's last service update is a conservative drain start. Caller
  // timestamps cannot shorten the wait after a resume-and-disable cycle.
  const stopped = Date.parse(service.updateTime)
  const observed = Date.parse(observedAt)
  if (!timeout || timeout > 60 || !Number.isFinite(stopped) ||
    !Number.isFinite(observed) || observed - stopped < (timeout + 30) * 1000) fail()
  return Object.freeze({ service: TARGET.name, uid: service.uid,
    oldRevision, beforeGeneration: integer(beforeGeneration),
    generation: integer(service.generation),
    requestTimeoutSeconds: timeout, drainSeconds: timeout + 30 })
}
