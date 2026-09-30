// Synthetic provider objects for recorded transport and disposable PostgreSQL tests.
import { createHash } from 'node:crypto'
import { crc32cBase64 } from './dev012-production-migration-runner.mjs'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const digest = (value) => hash(JSON.stringify(value))
const bucket = 'jenfu-platform-prod-aipdm-release'
const sourcePrefix = `gs://${bucket}/source/migration-bundles/dev121/principal-inventory`
const receiptPrefix = `gs://${bucket}/receipts/releases`
const sourceKeys = ['pdmUserId', 'companyId', 'principalId', 'employeeId',
  'sourceKind', 'identityIssuer', 'identitySubject', 'mappingVersion', 'publishedAt']
export function createApplyFixture({ snapshot, revision = 'a'.repeat(40) } = {}) {
  if (!snapshot) {
    const activeProfiles = ['pdm-one', 'pdm-two'].map((pdmUserId) => ({
      pdmUserId, companyId: 'company-one', lifecycleVersion: 1,
      systemRoleEnabled: true, markerStatus: 'missing', markerPrincipalId: null, markerRowVersion: 0,
    }))
    const verified = { pdmUserId: 'pdm-one', companyId: 'company-one', principalId: 'principal-one',
      employeeId: 'employee-one', sourceKind: 'firebase_mapping',
      identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod',
      identitySubject: 'provider-one', mappingVersion: 1, publishedAt: '2026-09-28T00:00:00.000Z',
      accountType: 'human_privileged', lifecycleVersion: 1, accountStatus: 'active',
      systemRoleEnabled: true, sessionInvalidBefore: null }
    snapshot = { contractVersion: 'ai-pdm.principal-only-cohort-source.v1',
      cohortHash: digest(['ai-pdm.principal-only-cohort.v1', activeProfiles.map((r) => r.pdmUserId)]),
      sourceHash: digest(['ai-pdm.principal-only-cohort-source.v1', activeProfiles,
        [verified.pdmUserId, verified.companyId, verified.principalId, verified.employeeId,
          verified.identityIssuer, verified.identitySubject, verified.sourceKind,
          verified.mappingVersion, verified.publishedAt, verified.accountType,
          verified.lifecycleVersion, verified.accountStatus, verified.systemRoleEnabled,
          verified.sessionInvalidBefore]]), verified, activeProfiles, withheld: [activeProfiles[1]] }
  }
  const objects = new Map()
  const put = (uri, value, generation = '1') => {
    const bytes = Buffer.from(JSON.stringify(value))
    objects.set(uri, { bytes, generation })
    return { uri, sha256: hash(bytes), generation }
  }
  const base = { schemaVersion: 'ai-pdm.principal-inventory-operation.v2',
    operationId: 'DEV121-SYNTHETIC-SOURCE', mode: 'principal_only_source', sourceRevision: revision,
    projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod',
    applicationId: 'ai-pdm', firebaseProjectId: 'jenfu-platform-prod',
    sources: [Object.fromEntries(sourceKeys.map((key) => [key, snapshot.verified[key]]))],
    expectedSourceHash: null, expectedRowVersion: null }
  const sourceRef = put(`${sourcePrefix}/source.json`, base, '42')
  const sourceReceiptRef = put(`${receiptPrefix}/DEV121-PRINCIPAL-INVENTORY/source.json`, {
    schemaVersion: 'ai-pdm.principal-inventory-receipt.v1',
    operationId: base.operationId, mode: base.mode, sourceRevision: revision,
    operationRef: sourceRef.uri, operationSha256: sourceRef.sha256,
    operationGeneration: sourceRef.generation,
    target: { database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17 },
    outcome: snapshot,
  }, '43')
  const service = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
    uid: '12345678-abcd-abcd-abcd-123456789012', generation: '6', observedGeneration: '6',
    reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    updateTime: new Date(Date.now() - 180_000).toISOString(),
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 }, template: { timeout: '60s' },
    traffic: [{ revision: 'ai-pdm-prod-old', percent: 100 }],
    trafficStatuses: [{ revision: 'ai-pdm-prod-old', percent: 100 }] }
  const { generation: _fenceGeneration, ...principalOnlyFenceRef } = put(
    `${receiptPrefix}/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/fence.json`, {
      schemaVersion: 'ai-pdm.principal-only-migration-fence.v1', sourceRevision: revision,
      projectId: 'jenfu-platform-prod', region: 'asia-east1', service: 'ai-pdm-prod',
      serviceUid: service.uid, oldRevision: 'ai-pdm-prod-old', beforeGeneration: 5,
      quiescentGeneration: 6, serviceUpdateTime: service.updateTime,
      requestTimeoutSeconds: 60, status: 'QUIESCED' })
  const recoveryImage = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${'b'.repeat(64)}`
  const recoveryRevision = { name: `${service.name}/revisions/ai-pdm-prod-recovery`,
    conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
    containers: [{ name: 'ai-pdm', image: recoveryImage }] }
  const { generation: _recoveryGeneration, ...receiptRef } = put(
    `${receiptPrefix}/DEV121-PRINCIPAL-ONLY-RECOVERY/recovery.json`, {
      schemaVersion: 'ai-pdm.principal-only-recovery.v1', sourceRevision: revision,
      projectId: 'jenfu-platform-prod', region: 'asia-east1', service: 'ai-pdm-prod',
      serviceUid: service.uid, oldRevision: 'ai-pdm-prod-old',
      recoveryRevision: 'ai-pdm-prod-recovery', imageDigest: recoveryImage, status: 'PASS' })
  const operation = { ...base, schemaVersion: 'ai-pdm.principal-inventory-operation.v3',
    mode: 'principal_only_apply', operationId: 'DEV121-SYNTHETIC-APPLY', sources: [],
    sourceReceiptRef, principalOnlyFenceRef, principalOnlyRecovery: {
      revision: 'ai-pdm-prod-recovery', imageDigest: recoveryImage, serviceUid: service.uid, receiptRef } }
  const inputRef = put(`${sourcePrefix}/apply.json`, operation)
  const outputRef = `${receiptPrefix}/DEV121-PRINCIPAL-INVENTORY/apply.json`
  const state = { service, recoveryRevision, failPublication: false, serviceReads: 0 }
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) {
      return new Response(JSON.stringify({ access_token: 'x'.repeat(25), expires_in: 3600 }))
    }
    if (url.startsWith('https://run.googleapis.com/')) {
      state.serviceReads += 1
      return new Response(JSON.stringify(url.includes('/revisions/') ? state.recoveryRevision : state.service))
    }
    if (url.startsWith('https://storage.googleapis.com/upload/')) {
      if (state.failPublication) { state.failPublication = false; return new Response('', { status: 503 }) }
      const uri = `gs://${bucket}/${new URL(url).searchParams.get('name')}`
      if (objects.has(uri)) return new Response('', { status: 412 })
      objects.set(uri, { bytes: Buffer.from(options.body), generation: '99' })
      return new Response(JSON.stringify({ generation: '99' }))
    }
    const uri = `gs://${bucket}/${decodeURIComponent(new URL(url).pathname.split('/o/')[1])}`
    const object = objects.get(uri)
    if (!object) return new Response('', { status: 404 })
    return new URL(url).searchParams.get('alt') === 'media' ? new Response(object.bytes)
      : new Response(JSON.stringify({ generation: object.generation, crc32c: crc32cBase64(object.bytes) }))
  }
  return { operation, inputRef, inputHash: inputRef.sha256, outputRef, sourceRef,
    sourceReceiptRef, objects, state, fetchImpl, revision, snapshot }
}
