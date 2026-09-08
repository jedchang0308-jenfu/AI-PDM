import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BODY = 64 * 1024
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const PATHS = new Set(['/events', '/watchdog'])
const CONTROL_STATES = new Set(['CANDIDATE_CREATED', 'CANDIDATE_VERIFIED', 'GO', 'ACTIVE', 'CANONICAL_VERIFIED', 'ABORT_REQUESTED', 'FINALIZED'])
const EXPECTED = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  service: 'ai-pdm-prod',
  repository: 'jedchang0308-jenfu/AI-PDM',
  invokerServiceAccount: 'aipdm-prod-release-invoker@jenfu-platform-prod.iam.gserviceaccount.com',
  controlBucket: 'jenfu-platform-prod-aipdm-release',
})

export class AbortControllerError extends Error {
  constructor(code, status, message) {
    super(message)
    this.code = code
    this.status = status
  }
}
function fail(code, status, message) {
  throw new AbortControllerError(code, status, message)
}

function exactObject(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_BODY', 400, name + ' must be an object')
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail('INVALID_BODY', 400, name + ' has extra or missing keys')
  return value
}

function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hashJson(value) {
  return hashBytes(canonicalize(value))
}

function immutableRef(uri, bytes) {
  return { uri, sha256: hashBytes(bytes) }
}

function validateRef(value, name, allowMonitoring = false) {
  exactObject(value, ['uri', 'sha256'], name)
  const accepted = /^gs:\/\/[a-z0-9][a-z0-9._-]+\/[A-Za-z0-9._/-]+\.json$/u.test(value.uri) || (allowMonitoring && /^monitoring:\/\/[A-Za-z0-9._/-]+$/u.test(value.uri))
  if (!accepted || !H64.test(value.sha256)) fail('INVALID_EVENT', 400, name + ' is invalid')
  return value
}

export function assertControllerConfig(value) {
  exactObject(value, ['ownerApplicationId', 'projectId', 'region', 'service', 'repository', 'audience', 'invokerServiceAccount', 'controlBucket'], 'ControllerConfig')
  for (const [key, expected] of Object.entries(EXPECTED)) if (value[key] !== expected) fail(key === 'invokerServiceAccount' ? 'INVOKER_MISMATCH' : 'TARGET_MISMATCH', key === 'invokerServiceAccount' ? 403 : 409, 'Controller ' + key + ' mismatch')
  if (!/^https:\/\/release-controller\.jenfu\.internal\/[a-z0-9-]+$/u.test(value.audience)) fail('CONFIG_INVALID', 500, 'Controller audience is invalid')
  return value
}

export function assertReleaseCapsule(value) {
  exactObject(value, ['releaseCapsuleRef'], 'WorkflowInput')
  const pattern = new RegExp('^gs://' + EXPECTED.controlBucket + '/receipts/[A-Za-z0-9._/-]+\\.json#sha256=[a-f0-9]{64}$', 'u')
  if (!pattern.test(value.releaseCapsuleRef)) fail('INVALID_CAPSULE', 400, 'Release capsule must be immutable own-bucket reference')
  return value
}

export function assertMutationRequest(value, operation) {
  exactObject(value, ['service', 'etag', 'updateMask', 'revision', 'trafficPercent'], 'MutationRequest')
  if (value.service !== EXPECTED.service || !value.etag || !value.revision || value.revision === 'latest') fail('TARGET_MISMATCH', 409, 'Mutation target mismatch')
  if (operation === 'CREATE_CANDIDATE' && (value.updateMask !== 'template' || value.trafficPercent !== 0)) fail('MIXED_MUTATION_MASK', 409, 'Candidate must be template-only and zero traffic')
  if (['ACTIVATE', 'ROLLBACK'].includes(operation) && value.updateMask !== 'traffic') fail('MIXED_MUTATION_MASK', 409, 'Traffic operation must be traffic-only')
  return value
}

export function assertControlHead(value, config) {
  const generation = value?.generation
  const body = { ...value }
  delete body.generation
  exactObject(body, ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256'], 'ControlHead')
  const { controlSha256, ...core } = body
  if (body.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || body.ownerApplicationId !== config.ownerApplicationId || body.service !== config.service || body.controlBucket !== config.controlBucket) fail('OWNER_OR_SOURCE_MISMATCH', 409, 'Control head owner mismatch')
  if (!H64.test(body.inputFingerprint) || !H40.test(body.sourceRevision) || !H64.test(body.sourceLockSha256) || !H64.test(controlSha256) || hashJson(core) !== controlSha256) fail('CONTROL_HEAD_HASH_MISMATCH', 409, 'Control head integrity mismatch')
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(body.releaseId) || !body.previousRevision || body.previousRevision === 'latest' || (body.candidateRevision != null && !body.candidateRevision.startsWith(config.service + '-'))) fail('CONTROL_HEAD_INVALID', 409, 'Control head release fields invalid')
  if (!CONTROL_STATES.has(body.state) || !Number.isFinite(Date.parse(body.leaseExpiresAt)) || !Number.isFinite(Date.parse(body.deadlineAt)) || !new RegExp('^https://api\\.github\\.com/repos/' + config.repository.replace('/', '\\/') + '/actions/runs/[0-9]+$', 'u').test(body.ownerRunRef)) fail('CONTROL_HEAD_INVALID', 409, 'Control head lifecycle fields invalid')
  if (generation != null && !/^[1-9][0-9]*$/u.test(String(generation))) fail('CONTROL_HEAD_INVALID', 409, 'Control generation invalid')
  return { ...body, ...(generation == null ? {} : { generation: String(generation) }) }
}

export function parseEnvelope(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0 || buffer.byteLength > MAX_BODY) fail('BODY_SIZE_INVALID', 413, 'Request body must be 1..64KiB')
  let value
  try { value = JSON.parse(buffer.toString('utf8')) } catch { fail('INVALID_JSON', 400, 'Invalid JSON') }
  if (value?.message?.data) {
    try { value = JSON.parse(Buffer.from(value.message.data, 'base64').toString('utf8')) } catch { fail('INVALID_PUBSUB_ENVELOPE', 400, 'Invalid Pub/Sub data') }
  }
  exactObject(value, ['correlationId', 'ownerApplicationId', 'sourceLockSha256', 'eventRef', 'occurredAt'], 'IncidentEvent')
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(value.correlationId) || value.ownerApplicationId !== EXPECTED.ownerApplicationId || !H64.test(value.sourceLockSha256) || !Number.isFinite(Date.parse(value.occurredAt))) fail('INVALID_EVENT', 400, 'Incident event is incomplete')
  validateRef(value.eventRef, 'eventRef', true)
  return value
}

function parseRawBody(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0 || buffer.byteLength > MAX_BODY) fail('BODY_SIZE_INVALID', 413, 'Request body must be 1..64KiB')
  let value
  try { value = JSON.parse(buffer.toString('utf8')) } catch { fail('INVALID_JSON', 400, 'Invalid JSON') }
  if (value?.message?.data) {
    try { return JSON.parse(Buffer.from(value.message.data, 'base64').toString('utf8')) } catch { fail('INVALID_PUBSUB_ENVELOPE', 400, 'Invalid Pub/Sub data') }
  }
  return value
}

function incidentTime(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000).toISOString()
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString()
  return fallback.toISOString()
}

export function normalizeInboundEvent({ path, buffer, config, head, now = () => new Date() }) {
  const raw = parseRawBody(buffer)
  if (path === '/watchdog') {
    exactObject(raw, ['ownerApplicationId'], 'WatchdogRequest')
    if (raw.ownerApplicationId !== config.ownerApplicationId) fail('OWNER_OR_SOURCE_MISMATCH', 409, 'Watchdog owner mismatch')
    return {
      correlationId: 'watchdog-' + head.releaseId.toLowerCase() + '-' + head.controlSha256.slice(0, 16),
      ownerApplicationId: config.ownerApplicationId,
      sourceLockSha256: head.sourceLockSha256,
      eventRef: { uri: 'gs://' + config.controlBucket + '/control/active.json', sha256: head.controlSha256 },
      occurredAt: now().toISOString(),
    }
  }
  if (raw?.incident && typeof raw.incident === 'object') {
    if (String(raw.incident.state ?? '').toLowerCase() === 'closed') return { skip: { result: 'NO_ACTION_REQUIRED', reason: 'INCIDENT_CLOSED' } }
    const id = String(raw.incident.incident_id ?? raw.incident.scoping_project_id ?? hashJson(raw).slice(0, 24)).replace(/[^A-Za-z0-9._-]/gu, '-').slice(0, 96)
    return {
      correlationId: 'monitoring-' + id,
      ownerApplicationId: config.ownerApplicationId,
      sourceLockSha256: head.sourceLockSha256,
      eventRef: { uri: 'monitoring://' + config.projectId + '/' + id, sha256: hashJson(raw) },
      occurredAt: incidentTime(raw.incident.started_at, now()),
    }
  }
  return parseEnvelope(Buffer.from(canonicalize(raw)))
}

export async function authorizeRequest({ headers, config, verifyOidc }) {
  const authorization = headers.authorization || headers.Authorization
  if (!authorization?.startsWith('Bearer ')) fail('AUTH_REQUIRED', 401, 'OIDC bearer token required')
  const claims = await verifyOidc(authorization.slice(7), config.audience)
  const verified = claims.email_verified === true || claims.email_verified === 'true'
  if (claims.iss !== 'https://accounts.google.com' || claims.aud !== config.audience || claims.email !== config.invokerServiceAccount || !verified) fail('DENIED', 403, 'OIDC claims do not match exact invoker')
  return claims
}

function evidenceRefs(event, head, actionStartedAt, result, readback) {
  const root = 'gs://' + head.controlBucket + '/receipts/incidents/' + event.correlationId
  const delivery = Buffer.from(canonicalize(event) + '\n')
  const action = Buffer.from(canonicalize({ correlationId: event.correlationId, result, actionStartedAt }) + '\n')
  const observed = Buffer.from(canonicalize(readback) + '\n')
  return {
    deliveryRef: immutableRef(root + '/delivery.json', delivery),
    actionRef: immutableRef(root + '/action.json', action),
    readbackRef: immutableRef(root + '/readback.json', observed),
  }
}

function incidentReceipt({ event, head, actionStartedAt, result, readback }) {
  return {
    schemaVersion: 'jenfu.dev012.incident-receipt.v1',
    correlationId: event.correlationId,
    ownerApplicationId: head.ownerApplicationId,
    sourceLockSha256: head.sourceLockSha256,
    candidateRevision: head.candidateRevision,
    eventRef: event.eventRef,
    ...evidenceRefs(event, head, actionStartedAt, result, readback),
    occurredAt: event.occurredAt,
    actionStartedAt,
    result,
  }
}

async function existingReceipt(store, head, correlationId) {
  if (store.readReceipt) return store.readReceipt(correlationId)
  return head.receipts?.[correlationId] ?? null
}

async function publishReceipt(store, event, head, actionStartedAt, result, readback) {
  if (store.publishIncidentBundle) return store.publishIncidentBundle({ event, head, actionStartedAt, result, readback })
  const receipt = incidentReceipt({ event, head, actionStartedAt, result, readback })
  await store.publishReceipt(event.correlationId, receipt, { ifAbsent: true })
  return receipt
}

function withControlHash(value) {
  const body = { ...value }
  delete body.generation
  delete body.controlSha256
  return { ...body, controlSha256: hashJson(body) }
}

export async function processIncident({ path, event, config: configInput, store, provider, now = () => new Date() }) {
  if (!PATHS.has(path)) fail('NOT_FOUND', 404, 'Unknown controller route')
  const config = assertControllerConfig(configInput)
  const head = assertControlHead(await store.readHead(), config)
  if (event.ownerApplicationId !== config.ownerApplicationId || event.sourceLockSha256 !== head.sourceLockSha256) fail('OWNER_OR_SOURCE_MISMATCH', 409, 'Incident does not match owner control head')
  const prior = await existingReceipt(store, head, event.correlationId)
  if (prior) return prior
  if (head.state === 'FINALIZED') return publishReceipt(store, event, head, now().toISOString(), 'NO_ACTION_REQUIRED', { reason: 'CONTROL_FINALIZED', result: head.result })
  if (path === '/watchdog') {
    const staleBy = now().getTime() - Date.parse(head.leaseExpiresAt)
    if (staleBy <= 30000) return { result: 'NO_ACTION_REQUIRED', reason: 'LEASE_NOT_STALE' }
    const ownerRun = await provider.readOwnerRun(head.ownerRunRef)
    if (ownerRun.status !== 'STOPPED') return { result: 'OUTCOME_UNKNOWN', reason: 'OLD_WORKER_NOT_FENCED' }
  }
  const service = await provider.getService(config.service)
  const actionStartedAt = now().toISOString()
  const occurredAt = Date.parse(event.occurredAt)
  if (!Number.isFinite(occurredAt) || Date.parse(actionStartedAt) - occurredAt > 120000) fail('INCIDENT_SLO_EXCEEDED', 409, 'Abort action did not start within 120 seconds')
  if (service.effectiveRevision === head.previousRevision && service.trafficPercent === 100) return publishReceipt(store, event, head, actionStartedAt, 'ROLLBACK_VERIFIED', service)
  if (head.candidateRevision == null || (service.effectiveRevision === head.previousRevision && service.trafficPercent === 0)) return publishReceipt(store, event, head, actionStartedAt, 'NO_ACTION_REQUIRED', service)
  if (service.effectiveRevision !== head.candidateRevision || service.trafficPercent !== 100) fail('SERVICE_STATE_AMBIGUOUS', 409, 'Service does not match candidate or rollback baseline')
  assertMutationRequest({ service: config.service, etag: service.etag, updateMask: 'traffic', revision: head.previousRevision, trafficPercent: 100 }, 'ROLLBACK')
  const requested = withControlHash({ ...head, state: 'ABORT_REQUESTED', result: null })
  const fenced = await store.compareAndSet(requested, head.generation)
  let operation
  try {
    operation = await provider.rollbackTraffic({ service: config.service, revision: head.previousRevision, etag: service.etag, updateMask: 'traffic' })
  } catch (error) {
    const readback = await provider.getService(config.service)
    if (readback.effectiveRevision !== head.previousRevision || readback.trafficPercent !== 100) throw error
  }
  if (operation) await provider.waitOperation(operation, head.deadlineAt)
  const readback = await provider.getService(config.service)
  if (readback.effectiveRevision !== head.previousRevision || readback.trafficPercent !== 100 || readback.reconciling !== false) fail('ROLLBACK_NOT_VERIFIED', 503, 'Rollback readback is incomplete')
  const receipt = await publishReceipt(store, event, head, actionStartedAt, 'ROLLBACK_VERIFIED', readback)
  if (fenced?.generation && store.compareAndSet) await store.compareAndSet(withControlHash({ ...fenced, state: 'FINALIZED', result: 'ROLLED_BACK' }), fenced.generation)
  return receipt
}

export function createAbortServer({ config, store, provider, verifyOidc }) {
  return createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || !PATHS.has(request.url)) fail('NOT_FOUND', 404, 'Unknown route')
      await authorizeRequest({ headers: request.headers, config, verifyOidc })
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > MAX_BODY) fail('BODY_SIZE_INVALID', 413, 'Request body exceeds 64KiB')
        chunks.push(chunk)
      }
      const head = assertControlHead(await store.readHead(), config)
      const normalized = normalizeInboundEvent({ path: request.url, buffer: Buffer.concat(chunks), config, head })
      const receipt = normalized.skip ?? await processIncident({ path: request.url, event: normalized, config, store, provider })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(receipt))
    } catch (error) {
      response.writeHead(error.status || 500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ code: error.code || 'INTERNAL_ERROR' }))
    }
  })
}

function createNativeAdapters(config, fetchImpl = fetch, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))) {
  let cachedToken = null
  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value
    const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) })
    if (!response.ok) fail('PROVIDER_AUTH_FAILED', 503, 'Metadata access token unavailable')
    const value = await response.json()
    if (!value.access_token || Number(value.expires_in) < 60) fail('PROVIDER_AUTH_FAILED', 503, 'Metadata access token invalid')
    cachedToken = { value: value.access_token, expiresAt: Date.now() + Number(value.expires_in) * 1000 }
    return cachedToken.value
  }
  async function request(url, options = {}, authenticated = true) {
    const headers = { ...(options.headers ?? {}) }
    if (authenticated) headers.authorization = 'Bearer ' + await accessToken()
    const response = await fetchImpl(url, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(30000) })
    if (!response.ok) {
      const error = new AbortControllerError(response.status === 404 ? 'MISSING' : response.status === 409 || response.status === 412 ? 'CONFLICT' : response.status >= 500 ? 'OUTCOME_UNKNOWN' : 'PROVIDER_REQUEST_FAILED', response.status >= 500 ? 503 : response.status, 'Provider request failed')
      error.providerStatus = response.status
      throw error
    }
    if (response.status === 204) return null
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }
  async function readObject(object, optional = false) {
    const base = 'https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(config.controlBucket) + '/o/' + encodeURIComponent(object)
    let metadata
    try { metadata = await request(base) } catch (error) { if (optional && error.providerStatus === 404) return null; throw error }
    if (!/^[1-9][0-9]*$/u.test(String(metadata.generation ?? ''))) fail('GCS_METADATA_INVALID', 503, 'GCS generation invalid')
    const response = await fetchImpl(base + '?alt=media&generation=' + encodeURIComponent(metadata.generation), { headers: { authorization: 'Bearer ' + await accessToken() }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) fail('GCS_READ_FAILED', response.status >= 500 ? 503 : response.status, 'GCS media read failed')
    return { bytes: Buffer.from(await response.arrayBuffer()), generation: String(metadata.generation) }
  }
  async function writeObject(object, bytes, generation, allowReuse) {
    const url = 'https://storage.googleapis.com/upload/storage/v1/b/' + encodeURIComponent(config.controlBucket) + '/o?uploadType=media&name=' + encodeURIComponent(object) + '&ifGenerationMatch=' + encodeURIComponent(generation)
    const response = await fetchImpl(url, { method: 'POST', headers: { authorization: 'Bearer ' + await accessToken(), 'content-type': 'application/json' }, body: bytes, signal: AbortSignal.timeout(30000) })
    if (response.status === 412 && allowReuse) {
      const existing = await readObject(object)
      if (!existing.bytes.equals(bytes)) fail('GCS_IMMUTABILITY_CONFLICT', 409, 'Immutable receipt conflict')
      return existing
    }
    if (!response.ok) fail(response.status === 412 ? 'CONTROL_CAS_CONFLICT' : 'GCS_WRITE_FAILED', response.status === 412 ? 409 : 503, 'GCS write failed')
    const metadata = await response.json()
    const readback = await readObject(object)
    if (String(metadata.generation) !== readback.generation || !readback.bytes.equals(bytes)) fail('GCS_WRITE_READBACK_MISMATCH', 503, 'GCS write readback mismatch')
    return readback
  }
  async function putImmutableJson(object, value) {
    const bytes = Buffer.from(canonicalize(value) + '\n')
    const result = await writeObject(object, bytes, '0', true)
    return { ref: immutableRef('gs://' + config.controlBucket + '/' + object, result.bytes), generation: result.generation }
  }
  const store = {
    async readHead() {
      const result = await readObject('control/active.json')
      let value
      try { value = JSON.parse(result.bytes.toString('utf8')) } catch { fail('CONTROL_HEAD_INVALID', 409, 'Control head JSON invalid') }
      return assertControlHead({ ...value, generation: result.generation }, config)
    },
    async compareAndSet(next, generation) {
      const value = assertControlHead(next, config)
      const body = { ...value }
      delete body.generation
      const result = await writeObject('control/active.json', Buffer.from(canonicalize(body) + '\n'), String(generation), false)
      return { ...body, generation: result.generation }
    },
    async readReceipt(correlationId) {
      const result = await readObject('receipts/incidents/' + correlationId + '/incident.json', true)
      if (!result) return null
      try { return JSON.parse(result.bytes.toString('utf8')) } catch { fail('INCIDENT_RECEIPT_INVALID', 409, 'Incident receipt JSON invalid') }
    },
    async publishIncidentBundle({ event, head, actionStartedAt, result, readback }) {
      const root = 'receipts/incidents/' + event.correlationId
      const delivery = await putImmutableJson(root + '/delivery.json', event)
      const action = await putImmutableJson(root + '/action.json', { correlationId: event.correlationId, result, actionStartedAt })
      const observed = await putImmutableJson(root + '/readback.json', readback)
      const receipt = {
        schemaVersion: 'jenfu.dev012.incident-receipt.v1', correlationId: event.correlationId,
        ownerApplicationId: head.ownerApplicationId, sourceLockSha256: head.sourceLockSha256,
        candidateRevision: head.candidateRevision, eventRef: event.eventRef,
        deliveryRef: delivery.ref, actionRef: action.ref, readbackRef: observed.ref,
        occurredAt: event.occurredAt, actionStartedAt, result,
      }
      const saved = await putImmutableJson(root + '/incident.json', receipt)
      return { ...receipt, receiptRef: saved.ref }
    },
  }
  function normalizeService(value) {
    const active = value.trafficStatuses?.find((row) => !row.tag && Number(row.percent) === 100)
    if (!value.name || !value.etag || typeof value.reconciling !== 'boolean' || !active?.revision || active.latestRevision === true) fail('SERVICE_READBACK_INVALID', 503, 'Cloud Run traffic is ambiguous')
    return { name: value.name, effectiveRevision: active.revision, trafficPercent: Number(active.percent), etag: value.etag, reconciling: value.reconciling }
  }
  const provider = {
    async readOwnerRun(url) {
      if (url !== 'https://api.github.com/repos/' + config.repository + '/actions/runs/' + url.split('/').at(-1) || !/\/[0-9]+$/u.test(url)) fail('OWNER_RUN_REF_INVALID', 409, 'GitHub run reference invalid')
      const headers = { accept: 'application/vnd.github+json', 'user-agent': 'jenfu-dev012-abort-controller', authorization: 'Bearer ' + process.env.GITHUB_READ_TOKEN }
      if (!process.env.GITHUB_READ_TOKEN || process.env.GITHUB_READ_TOKEN.length < 20) fail('GITHUB_READ_TOKEN_MISSING', 503, 'GitHub read token unavailable')
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15000) })
      if (!response.ok) fail('OWNER_RUN_READ_FAILED', response.status >= 500 ? 503 : 409, 'GitHub run read failed')
      const value = await response.json()
      return { status: value.status === 'completed' ? 'STOPPED' : 'RUNNING', conclusion: value.conclusion ?? null }
    },
    async getService(service) {
      if (service !== config.service) fail('TARGET_MISMATCH', 409, 'Cloud Run service mismatch')
      return normalizeService(await request('https://run.googleapis.com/v2/projects/' + config.projectId + '/locations/' + config.region + '/services/' + config.service))
    },
    async rollbackTraffic(input) {
      assertMutationRequest({ ...input, trafficPercent: 100 }, 'ROLLBACK')
      const name = 'projects/' + config.projectId + '/locations/' + config.region + '/services/' + config.service
      return request('https://run.googleapis.com/v2/' + name + '?updateMask=traffic&allowMissing=false', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, etag: input.etag, traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: input.revision, percent: 100 }] }) })
    },
    async waitOperation(operation, deadlineAt) {
      let value = operation
      if (!value?.name) fail('OPERATION_INVALID', 503, 'Cloud Run operation invalid')
      while (value.done !== true) {
        if (Date.now() >= Date.parse(deadlineAt)) fail('OPERATION_TIMEOUT', 503, 'Cloud Run operation timed out')
        await sleep(1000)
        value = await request('https://run.googleapis.com/v2/' + value.name)
      }
      if (value.error) fail('ROLLBACK_OPERATION_FAILED', 503, 'Cloud Run rollback failed')
      return value.response ?? value
    },
  }
  const verifyOidc = async (token, audience) => {
    if (typeof token !== 'string' || token.length < 100) fail('AUTH_REQUIRED', 401, 'OIDC bearer token invalid')
    const response = await fetchImpl('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(10000) })
    if (!response.ok) fail('DENIED', 403, 'OIDC token verification failed')
    const claims = await response.json()
    if (claims.aud !== audience) fail('DENIED', 403, 'OIDC audience mismatch')
    return claims
  }
  return { store, provider, verifyOidc }
}

function configFromEnvironment(environment) {
  return assertControllerConfig({
    ownerApplicationId: environment.OWNER_APPLICATION_ID,
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    service: environment.APPLICATION_SERVICE_NAME,
    repository: environment.GITHUB_REPOSITORY,
    audience: environment.CONTROLLER_AUDIENCE,
    invokerServiceAccount: environment.INVOKER_SERVICE_ACCOUNT,
    controlBucket: environment.RELEASE_BUCKET,
  })
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const config = configFromEnvironment(process.env)
  const adapters = createNativeAdapters(config)
  const server = createAbortServer({ config, ...adapters })
  const port = Number(process.env.PORT ?? '8080')
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('PORT_INVALID', 500, 'Invalid listen port')
  server.listen(port, '0.0.0.0')
  process.on('SIGTERM', () => server.close(() => process.exit(0)))
}
