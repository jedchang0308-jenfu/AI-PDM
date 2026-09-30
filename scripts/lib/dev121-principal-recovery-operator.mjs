import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

const PROJECT = 'jenfu-platform-prod'
const REGION = 'asia-east1'
const SERVICE = 'ai-pdm-prod'
const SERVICE_NAME = `projects/${PROJECT}/locations/${REGION}/services/${SERVICE}`
const IMAGE_URI = `${REGION}-docker.pkg.dev/${PROJECT}/aipdm-release/ai-pdm-recovery`
const BUILDER = 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c'
const DOCKERFILE = 'infra/google-cloud/dev-117-production-release/principal-only-recovery.Dockerfile'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

function fail(code) { throw new Error(`DEV121_RECOVERY_OPERATOR_${code}`) }
function trafficIsOldOnly(service, oldRevision) {
  return [service?.traffic, service?.trafficStatuses].every((rows) =>
    Array.isArray(rows) && rows.length === 1 && rows[0]?.revision === oldRevision &&
    Number(rows[0]?.percent) === 100 && rows[0]?.tag == null && rows[0]?.latestRevision !== true)
}

export function recoveryBuildRequest({ profile, sourceRevision, sourceObject }) {
  if (profile?.target?.projectId !== PROJECT || profile?.target?.region !== REGION ||
    profile?.target?.serviceName !== SERVICE ||
    profile?.artifact?.releaseBucket !== 'jenfu-platform-prod-aipdm-release' ||
    profile?.identities?.builder !== 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' ||
    !H40.test(sourceRevision ?? '') ||
    !H64.test(sourceObject?.ref?.sha256 ?? '') ||
    !/^gs:\/\/jenfu-platform-prod-aipdm-release\/source\/releases\/DEV121-RECOVERY\/[a-f0-9]{40}\/source\.tar\.gz$/u.test(sourceObject.ref.uri ?? '') ||
    sourceObject.ref.uri.split('/')[6] !== sourceRevision ||
    !/^[1-9][0-9]*$/u.test(String(sourceObject?.metadata?.generation ?? ''))) fail('BUILD_INPUT_INVALID')
  const tag = `${IMAGE_URI}:dev121-recovery-${sourceRevision}`
  const object = sourceObject.ref.uri.split('/').slice(3).join('/')
  return {
    source: { storageSource: { bucket: profile.artifact.releaseBucket,
      object, generation: String(sourceObject.metadata.generation) } },
    steps: [{ name: BUILDER, dir: 'source', args: [
      'build', '--pull=false', '--no-cache', '--file', DOCKERFILE,
      '--build-arg', `SOURCE_REVISION=${sourceRevision}`, '--tag', tag, '.',
    ] }],
    images: [tag], timeout: '1200s', queueTtl: '300s',
    logsBucket: `gs://${profile.artifact.releaseBucket}/logs/cloud-build`,
    serviceAccount: `projects/${PROJECT}/serviceAccounts/${profile.identities.builder}`,
    options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' },
    tags: ['dev-121', 'ai-pdm', 'principal-only-recovery'],
  }
}

export function assertRecoveryBuildReadback({ request, build, sourceRevision }) {
  const tag = `${IMAGE_URI}:dev121-recovery-${sourceRevision}`
  const result = build?.results?.images?.find((row) => row.name === tag)
  if (build?.status !== 'SUCCESS' || build.projectId !== PROJECT ||
    build.serviceAccount !== request.serviceAccount ||
    build.options?.requestedVerifyOption !== 'VERIFIED' ||
    build.sourceProvenance?.resolvedStorageSource?.bucket !== request.source.storageSource.bucket ||
    build.sourceProvenance?.resolvedStorageSource?.object !== request.source.storageSource.object ||
    String(build.sourceProvenance?.resolvedStorageSource?.generation) !==
      String(request.source.storageSource.generation) ||
    !/^sha256:[a-f0-9]{64}$/u.test(result?.digest ?? '')) fail('BUILD_READBACK_INVALID')
  return `${IMAGE_URI}@${result.digest}`
}

export function assertRecoveryBaseline({ profile, service, oldRevision, sourceRevision }) {
  if (profile?.target?.projectId !== PROJECT || profile?.target?.region !== REGION ||
    profile?.target?.serviceName !== SERVICE || !H40.test(sourceRevision ?? '') ||
    service?.name !== SERVICE_NAME || !service.uid || !service.etag ||
    service.reconciling === true || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(service.observedGeneration) !== String(service.generation) ||
    !/^ai-pdm-prod-[a-z0-9-]+$/u.test(oldRevision ?? '') ||
    !trafficIsOldOnly(service, oldRevision) ||
    (service.scaling?.scalingMode === 'MANUAL' &&
      ![0, '0'].includes(service.scaling.manualInstanceCount)) ||
    !profile?.target?.runtimeServiceAccount || !profile?.runtime?.containerName) fail('REVISION_INPUT_INVALID')
  return service
}

export function recoveryRevisionRequest({ profile, service, oldRevision, sourceRevision, imageDigest }) {
  assertRecoveryBaseline({ profile, service, oldRevision, sourceRevision })
  if (!String(imageDigest ?? '').startsWith(`${IMAGE_URI}@sha256:`) ||
    !H64.test(String(imageDigest).slice(`${IMAGE_URI}@sha256:`.length))) fail('REVISION_INPUT_INVALID')
  const revision = `${SERVICE}-recovery-${sourceRevision.slice(0, 12)}`
  return { name: SERVICE_NAME, etag: service.etag, template: {
    revision, serviceAccount: profile.target.runtimeServiceAccount,
    containers: [{ name: profile.runtime.containerName, image: imageDigest,
      ports: [{ containerPort: 8080 }],
      startupProbe: { httpGet: { path: '/login', port: 8080 },
        initialDelaySeconds: 0, timeoutSeconds: 3, periodSeconds: 10, failureThreshold: 12 } }],
    maxInstanceRequestConcurrency: 10, timeout: '15s',
  } }
}

export function assertRecoveryRevisionReadback({ before, after, revision, request, imageDigest, oldRevision }) {
  const name = `${SERVICE_NAME}/revisions/${request.template.revision}`
  const container = revision?.containers?.find((row) => row.name === request.template.containers[0].name)
  if (after?.name !== SERVICE_NAME || after.uid !== before?.uid ||
    after.reconciling === true || after.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(after.observedGeneration) !== String(after.generation) ||
    Number(after.generation) <= Number(before.generation) ||
    sha256(canonicalize(after.scaling ?? {})) !== sha256(canonicalize(before.scaling ?? {})) ||
    ['ingress', 'defaultUriDisabled', 'invokerIamDisabled'].some((field) => after[field] !== before[field]) ||
    !trafficIsOldOnly(after, oldRevision) ||
    !trafficIsOldOnly(before, oldRevision) ||
    ![request.template.revision, name].includes(after.latestCreatedRevision) ||
    revision?.name !== name ||
    revision.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' ||
    revision.serviceAccount !== request.template.serviceAccount ||
    !Array.isArray(revision.containers) || revision.containers.length !== 1 ||
    container?.image !== imageDigest ||
    container?.startupProbe?.httpGet?.path !== '/login' ||
    Number(container?.startupProbe?.httpGet?.port) !== 8080 ||
    (container.env?.length ?? 0) !== 0 ||
    (revision.volumes?.length ?? 0) !== 0) fail('REVISION_READBACK_INVALID')
  return request.template.revision
}

export function recoveryProof({ sourceRevision, serviceUid, oldRevision, recoveryRevision, imageDigest }) {
  if (!H40.test(sourceRevision ?? '') ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(serviceUid ?? '') ||
    !/^ai-pdm-prod-[a-z0-9-]+$/u.test(oldRevision ?? '') ||
    !/^ai-pdm-prod-recovery-[a-f0-9]{12}$/u.test(recoveryRevision ?? '') ||
    !String(imageDigest ?? '').startsWith(`${IMAGE_URI}@sha256:`) ||
    !H64.test(String(imageDigest).slice(`${IMAGE_URI}@sha256:`.length))) fail('PROOF_INPUT_INVALID')
  return { schemaVersion: 'ai-pdm.principal-only-recovery.v1', sourceRevision,
    projectId: PROJECT, region: REGION, service: SERVICE, serviceUid,
    oldRevision, recoveryRevision, imageDigest, status: 'PASS' }
}

export function recoveryProofSha256(proof) { return sha256(`${canonicalize(proof)}\n`) }
