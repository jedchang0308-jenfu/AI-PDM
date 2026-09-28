const TARGET = Object.freeze({ name: 'ai-pdm-prod', namespace: '9536592944' })

function fail() { throw new Error('DEV121_AIPDM_QUIESCENCE_READBACK_INVALID') }
function integer(value) {
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
