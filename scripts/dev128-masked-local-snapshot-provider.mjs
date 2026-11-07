#!/usr/bin/env node
import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { canonicalize, sha256 } from './lib/dev012-production-data-cutover.mjs'
import { assertMaskedSnapshotConfig, recipientKeyIdForPublicKey } from './lib/dev128-masked-local-snapshot.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(HERE, '../config/release/dev128-masked-local-production-snapshot.json')
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const SNAPSHOT_ID = /^PDM-MASKED-[0-9]{8}-[0-9]{1,12}$/u

function fail(code) { const error = new Error(code); error.code = code; throw error }
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }
function exactBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail('DEV128_RECIPIENT_PUBLIC_KEY_INVALID')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value || bytes.length < 600 || bytes.length > 4096) fail('DEV128_RECIPIENT_PUBLIC_KEY_INVALID')
  return bytes
}
function envMap(container) { return new Map((container?.env ?? []).map((item) => [item.name, item.value])) }
function ensureExactKeys(value, allowed, code) {
  const unexpected = Object.keys(value ?? {}).filter((key) => !allowed.includes(key))
  if (unexpected.length) fail(code)
}

export class Dev128Provider {
  #token
  #fetchImpl

  constructor({ token, fetchImpl = fetch }) {
    if (typeof token !== 'string' || token.length < 20) fail('DEV128_PROVIDER_TOKEN_REQUIRED')
    this.#token = token
    this.#fetchImpl = fetchImpl
  }

  async request(url, options = {}) {
    let response
    try {
      response = await this.#fetchImpl(url, {
        method: options.method ?? 'GET',
        redirect: 'error',
        headers: { authorization: `Bearer ${this.#token}`, ...(options.body ? { 'content-type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
      })
    } catch { fail('DEV128_PROVIDER_OUTCOME_UNKNOWN') }
    if (options.allow404 && response.status === 404) return null
    if (!response.ok) fail(`DEV128_PROVIDER_HTTP_${response.status}`)
    if (response.status === 204) return null
    const text = await response.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { fail('DEV128_PROVIDER_RESPONSE_INVALID') }
  }

  async download(url, maxBytes) {
    let response
    try {
      response = await this.#fetchImpl(url, {
        redirect: 'error',
        headers: { authorization: `Bearer ${this.#token}` },
        signal: AbortSignal.timeout(180_000)
      })
    } catch { fail('DEV128_PROVIDER_OUTCOME_UNKNOWN') }
    if (!response.ok) fail(`DEV128_CIPHERTEXT_DOWNLOAD_HTTP_${response.status}`)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared && (!Number.isSafeInteger(declared) || declared > maxBytes)) fail('DEV128_CIPHERTEXT_DOWNLOAD_SIZE_INVALID')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 1 || bytes.length > maxBytes || (declared && bytes.length !== declared)) fail('DEV128_CIPHERTEXT_DOWNLOAD_READBACK_MISMATCH')
    return bytes
  }
}

function jobUrl(config) {
  return `https://run.googleapis.com/v2/projects/${config.source.projectId}/locations/${config.source.region}/jobs/ai-pdm-prod-masked-local-snapshot`
}

function validateJob({ config, job, sourceRevision, now = Date.now() }) {
  const expectedName = `projects/${config.source.projectId}/locations/${config.source.region}/jobs/ai-pdm-prod-masked-local-snapshot`
  if (!job || job.name !== expectedName || job.reconciling === true || job.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
      String(job.generation ?? '') !== String(job.observedGeneration ?? '') || typeof job.etag !== 'string' || !job.etag ||
      typeof job.uid !== 'string' || !job.uid ||
      (job.deletionProtection !== undefined && job.deletionProtection !== false)) fail('DEV128_JOB_READBACK_MISMATCH')
  const labels = job.labels ?? {}
  if (labels.application !== 'ai-pdm' || labels.component !== 'masked-local-snapshot' || labels.dev !== 'dev-128') fail('DEV128_JOB_READBACK_MISMATCH')
  const task = job.template?.template
  const container = task?.containers?.[0]
  if (job.template?.taskCount !== 1 || job.template?.parallelism !== 1 || task?.containers?.length !== 1 ||
      task.serviceAccount !== config.source.serviceAccount || task.timeout !== '1800s' || Number(task.maxRetries ?? 0) !== 0 ||
      task.executionEnvironment !== 'EXECUTION_ENVIRONMENT_GEN2' ||
      container?.name !== 'snapshot' || container?.command?.length !== 1 || container.command[0] !== 'node' ||
      typeof container.image !== 'string' || !container.image.startsWith(`${config.image.repository}@sha256:`) ||
      !H64.test(container.image.slice(config.image.repository.length + 8))) fail('DEV128_JOB_TEMPLATE_MISMATCH')
  const args = container.args
  if (!Array.isArray(args) || args.length !== 5 || args[0] !== 'scripts/dev128-masked-local-snapshot-runner.mjs' ||
      args[1] !== '--snapshot-id' || !SNAPSHOT_ID.test(args[2] ?? '') ||
      args[3] !== '--recipient-public-key-b64') fail('DEV128_JOB_ARGUMENTS_INVALID')
  const publicKeyPem = exactBase64(args[4]).toString('utf8')
  const recipientKeyId = recipientKeyIdForPublicKey(publicKeyPem)
  const environment = envMap(container)
  const startsAt = Date.parse(environment.get('DEV128_STARTS_AT') ?? '')
  const expiresAt = Date.parse(environment.get('DEV128_EXPIRES_AT') ?? '')
  const expectedEnvironment = new Map([
    ['PDM_SOURCE_REVISION', sourceRevision],
    ['DEV128_CATALOG_SHAPE_SHA256', config.source.catalogShapeSha256],
    ['DEV128_RECIPIENT_KEY_ID', recipientKeyId],
    ['DEV128_STARTS_AT', environment.get('DEV128_STARTS_AT')],
    ['DEV128_EXPIRES_AT', environment.get('DEV128_EXPIRES_AT')],
    ['DEV128_DATABASE', config.source.database],
    ['DEV128_DATABASE_LOGIN', config.source.databaseLogin],
    ['DEV128_INSTANCE_CONNECTION_NAME', config.source.instanceConnectionName],
    ['DEV128_DATABASE_HOST', `/cloudsql/${config.source.instanceConnectionName}`],
    ['DEV128_PROJECT_ID', config.source.projectId]
  ])
  if (environment.size !== expectedEnvironment.size || [...expectedEnvironment].some(([key, value]) => environment.get(key) !== value) ||
      !Number.isFinite(startsAt) || !Number.isFinite(expiresAt) || startsAt >= expiresAt || expiresAt - startsAt > 7_200_000 ||
      now < startsAt || now >= expiresAt) fail('DEV128_JOB_ENVIRONMENT_MISMATCH')
  const volumes = task.volumes ?? []
  const mounts = container.volumeMounts ?? []
  if (volumes.length !== 1 || volumes[0]?.name !== 'cloudsql' ||
      canonicalize(volumes[0]?.cloudSqlInstance?.instances) !== canonicalize([config.source.instanceConnectionName]) ||
      mounts.length !== 1 || mounts[0]?.name !== 'cloudsql' || mounts[0]?.mountPath !== '/cloudsql') fail('DEV128_JOB_VOLUME_MISMATCH')
  const network = task.vpcAccess?.networkInterfaces?.[0]
  if (task.vpcAccess?.egress !== 'ALL_TRAFFIC' || task.vpcAccess?.networkInterfaces?.length !== 1 ||
      network?.network !== config.source.network || network?.subnetwork !== config.source.subnet) fail('DEV128_JOB_NETWORK_MISMATCH')
  return {
    snapshotId: args[2],
    recipientKeyId,
    imageDigest: container.image,
    startsAt: environment.get('DEV128_STARTS_AT'),
    expiresAt: environment.get('DEV128_EXPIRES_AT'),
    objectName: `${config.objectPrefix}/${args[2]}/snapshot.encrypted.json`
  }
}

async function listExecutions(provider, config) {
  const executions = []
  let pageToken = ''
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${jobUrl(config)}/executions`)
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const value = await provider.request(url.toString())
    if (!Array.isArray(value?.executions ?? [])) fail('DEV128_EXECUTION_LIST_INVALID')
    executions.push(...(value.executions ?? []))
    pageToken = value.nextPageToken ?? ''
    if (!pageToken) return executions
  }
  fail('DEV128_EXECUTION_LIST_INCOMPLETE')
}

async function waitSingleExecution(provider, config) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const executions = await listExecutions(provider, config)
    if (executions.length > 1) fail('DEV128_EXECUTION_READBACK_MISMATCH')
    if (executions.length === 1) return executions[0]
    await sleep(2_000)
  }
  fail('DEV128_EXECUTION_DISCOVERY_TIMEOUT')
}

async function waitExecution(provider, config, executionName, { sleepImpl = sleep } = {}) {
  const expectedPrefix = `${jobUrl(config)}/executions/`
  const url = `https://run.googleapis.com/v2/${executionName}`
  if (!url.startsWith(expectedPrefix)) fail('DEV128_EXECUTION_REF_INVALID')
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const value = await provider.request(url)
    const completed = (value?.conditions ?? []).filter((condition) => condition.type === 'Completed')
    if (completed.length > 1) fail('DEV128_EXECUTION_READBACK_MISMATCH')
    if (completed.length === 1) {
      if (completed[0].state === 'CONDITION_SUCCEEDED') {
        if (Number(value.succeededCount ?? 0) !== 1 || Number(value.failedCount ?? 0) !== 0 || !value.completionTime) fail('DEV128_EXECUTION_FAILED')
        return value
      }
      if (completed[0].state === 'CONDITION_FAILED') fail('DEV128_EXECUTION_FAILED')
      if (!['CONDITION_PENDING', 'CONDITION_RECONCILING'].includes(completed[0].state)) fail('DEV128_EXECUTION_READBACK_MISMATCH')
    }
    await sleepImpl(10_000)
  }
  fail('DEV128_EXECUTION_TIMEOUT')
}

async function objectReadback(provider, config, binding) {
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.releaseBucket)}/o/${encodeURIComponent(binding.objectName)}`
  const metadata = await provider.request(metadataUrl)
  const generation = String(metadata?.generation ?? '')
  const size = Number(metadata?.size)
  if (metadata?.name !== binding.objectName || !/^[1-9][0-9]*$/u.test(generation) ||
      !Number.isSafeInteger(size) || size < 1 || size > config.source.maxEncryptedBytes ||
      metadata.metadata?.['dev128-snapshot-id'] !== binding.snapshotId ||
      metadata.metadata?.['dev128-source-revision'] !== binding.sourceRevision ||
      metadata.metadata?.['dev128-recipient-key-id'] !== binding.recipientKeyId ||
      !H64.test(metadata.metadata?.['dev128-ciphertext-sha256'] ?? '')) fail('DEV128_CIPHERTEXT_OBJECT_METADATA_INVALID')
  const bytes = await provider.download(`https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(config.releaseBucket)}/o/${encodeURIComponent(binding.objectName)}?alt=media&generation=${generation}`, config.source.maxEncryptedBytes)
  if (bytes.length !== size || sha256(bytes) !== metadata.metadata['dev128-ciphertext-sha256']) fail('DEV128_CIPHERTEXT_DOWNLOAD_READBACK_MISMATCH')
  return { bytes, generation, ciphertextSha256: sha256(bytes), size }
}

async function main(environment = process.env) {
  const config = assertMaskedSnapshotConfig(JSON.parse(await readFile(CONFIG_PATH, 'utf8')))
  if (environment.GITHUB_REPOSITORY !== 'jedchang0308-jenfu/AI-PDM' || environment.GITHUB_REF !== 'refs/heads/main' ||
      !H40.test(environment.GITHUB_SHA ?? '') || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      environment.GITHUB_RUN_ATTEMPT !== '1') fail('DEV128_SOURCE_AUTHORITY_INVALID')
  const provider = new Dev128Provider({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN })
  const job = await provider.request(jobUrl(config))
  const binding = validateJob({ config, job, sourceRevision: environment.GITHUB_SHA })
  binding.sourceRevision = environment.GITHUB_SHA
  const objectUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.releaseBucket)}/o/${encodeURIComponent(binding.objectName)}`
  if (await provider.request(objectUrl, { allow404: true })) fail('DEV128_OUTPUT_OBJECT_ALREADY_EXISTS')
  const before = await listExecutions(provider, config)
  if (before.length !== 0) fail('DEV128_EXECUTION_HISTORY_NOT_EMPTY')
  const permissionResult = await provider.request(`${jobUrl(config)}:testIamPermissions`, {
    method: 'POST',
    body: { permissions: ['run.jobs.get', 'run.jobs.run'] }
  })
  if (canonicalize([...(permissionResult?.permissions ?? [])].sort()) !== canonicalize(['run.jobs.get', 'run.jobs.run'])) fail('DEV128_JOB_PERMISSION_PREFLIGHT_FAILED')
  let operation
  let execution
  try {
    operation = await provider.request(`${jobUrl(config)}:run`, { method: 'POST', body: { etag: job.etag }, timeoutMs: 30_000 })
  } catch (error) {
    if (error?.code !== 'DEV128_PROVIDER_OUTCOME_UNKNOWN') throw error
    execution = await waitSingleExecution(provider, config)
  }
  if (!execution) {
    if (typeof operation?.name !== 'string' || !operation.name.startsWith(`projects/${config.source.projectId}/locations/${config.source.region}/operations/`)) fail('DEV128_OPERATION_REF_INVALID')
    execution = operation?.done === true ? operation.response : await waitSingleExecution(provider, config)
  }
  if (!execution?.name || !execution.name.startsWith(`projects/${config.source.projectId}/locations/${config.source.region}/jobs/ai-pdm-prod-masked-local-snapshot/executions/`)) fail('DEV128_EXECUTION_REF_INVALID')
  await waitExecution(provider, config, execution.name)
  const output = await objectReadback(provider, config, binding)
  const runnerTemp = environment.RUNNER_TEMP
  if (typeof runnerTemp !== 'string' || !path.isAbsolute(runnerTemp)) fail('DEV128_RUNNER_TEMP_MISSING')
  const directory = path.join(runnerTemp, 'dev128-masked-local-snapshot')
  await mkdir(directory, { recursive: true })
  const artifactPath = path.join(directory, 'snapshot.encrypted.json')
  await writeFile(artifactPath, output.bytes, { flag: 'wx', mode: 0o600 })
  const outputs = {
    artifact_name: `dev128-${binding.snapshotId.toLowerCase()}`,
    artifact_path: artifactPath,
    snapshot_id: binding.snapshotId,
    source_revision: binding.sourceRevision,
    image_digest: binding.imageDigest,
    recipient_key_id: binding.recipientKeyId,
    object_name: binding.objectName,
    object_generation: output.generation,
    ciphertext_sha256: output.ciphertextSha256
  }
  if (environment.GITHUB_OUTPUT) {
    ensureExactKeys(outputs, ['artifact_name', 'artifact_path', 'snapshot_id', 'source_revision', 'image_digest', 'recipient_key_id', 'object_name', 'object_generation', 'ciphertext_sha256'], 'DEV128_OUTPUT_INVALID')
    await writeFile(environment.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'a' })
  }
  process.stdout.write(`${JSON.stringify({ status: 'PASS', snapshotId: binding.snapshotId, sourceRevision: binding.sourceRevision, objectGeneration: output.generation, ciphertextSha256: output.ciphertextSha256 })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'DEV128_PROVIDER_FAILED'}\n`)
    process.exitCode = 1
  })
}

export { jobUrl, listExecutions, main as runDev128Provider, objectReadback, validateJob, waitExecution, waitSingleExecution }
