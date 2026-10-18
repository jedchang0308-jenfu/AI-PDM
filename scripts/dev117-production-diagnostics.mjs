#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import { sourceAuthority } from './dev122-rd-permission-state-readback.mjs'

const BUCKET = 'jenfu-platform-prod-aipdm-release'
const SERVICE = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
const SCHEMA = 'aipdm.production-diagnostic-operation.v1'
function fail(code) { throw new Error(`PRODUCTION_DIAGNOSTIC_${code}`) }

// Stable workflow, closed operations. A namespace selects the least-privileged
// existing identity before authentication; it never selects an arbitrary target.
export function bindDiagnosticRef(ref) {
  const match = /^gs:\/\/jenfu-platform-prod-aipdm-release\/source\/(rd-permission-readback|production-diagnostics|openswx-dispatch-recovery)\/([A-Za-z0-9][A-Za-z0-9._/-]*\.json)#sha256=([a-f0-9]{64})$/u.exec(ref ?? '')
  if (!match || match[2].split('/').some(segment => ['', '.', '..'].includes(segment))) fail('REF_INVALID')
  const kinds = { 'rd-permission-readback': 'rd-permission-state', 'production-diagnostics': 'service-state', 'openswx-dispatch-recovery': 'openswx-dispatch-recovery' }
  return { operation_uri: ref.split('#')[0], operation_sha256: match[3], kind: kinds[match[1]] }
}

export async function readServiceDiagnostic({ binding, sourceRevision, transport, now = () => new Date().toISOString() }) {
  if (binding?.kind !== 'service-state' || canonicalize(binding) !== canonicalize(bindDiagnosticRef(`${binding.operation_uri}#sha256=${binding.operation_sha256}`)) || !/^[a-f0-9]{40}$/u.test(sourceRevision ?? '')) fail('BINDING_INVALID')
  const object = await transport.readBytes(binding.operation_uri, { prefixes: ['source/production-diagnostics'], expectedSha256: binding.operation_sha256 })
  if (sha256(object.bytes) !== binding.operation_sha256) fail('HASH_MISMATCH')
  let operation
  try { operation = JSON.parse(object.bytes.toString('utf8')) } catch { fail('OPERATION_JSON_INVALID') }
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail('OPERATION_INVALID')
  if (canonicalize(Object.keys(operation).sort()) !== canonicalize(['kind', 'operationId', 'schemaVersion', 'sourceRevision']) || operation.schemaVersion !== SCHEMA || operation.kind !== 'service-state' || operation.sourceRevision !== sourceRevision || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(operation.operationId ?? '')) fail('OPERATION_INVALID')
  const service = await transport.request(`https://run.googleapis.com/v2/${SERVICE}`, { method: 'GET', redirect: 'error' })
  const revision = value => typeof value === 'string' && value.startsWith(`${SERVICE}/revisions/`) && /^ai-pdm-prod-[a-z0-9-]+$/u.test(value.slice(`${SERVICE}/revisions/`.length))
  if (service?.name !== SERVICE || !revision(service.latestReadyRevision) || !revision(service.latestCreatedRevision) || !/^[1-9][0-9]*$/u.test(String(service.generation ?? '')) || !Array.isArray(service.trafficStatuses ?? []) || (service.trafficStatuses ?? []).some(row => !revision(row?.revision) || !Number.isInteger(row.percent ?? 0) || (row.percent ?? 0) < 0 || row.percent > 100)) fail('SERVICE_READBACK_INVALID')
  // Deliberately omit template/env, credential refs, annotations and actor data.
  const report = { schemaVersion: 'aipdm.production-diagnostic-result.v1', operationId: operation.operationId, sourceRevision,
    operationRef: { uri: binding.operation_uri, sha256: binding.operation_sha256 }, observedAt: now(),
    service: { name: service.name, generation: String(service.generation), reconciling: service.reconciling === true,
      latestReadyRevision: service.latestReadyRevision, latestCreatedRevision: service.latestCreatedRevision,
      traffic: (service.trafficStatuses ?? []).map(row => ({ revision: row.revision, percent: row.percent ?? 0 })) },
    status: 'READBACK_COMPLETE', releaseAuthority: false, runtimeMutation: false, databaseMutation: false }
  // New immutable snapshot per observation: a retry does not overwrite or claim
  // old live state is current. GCS create uses the existing receipts-only grant.
  const reportSha256 = sha256(Buffer.from(canonicalize(report)))
  const outputRef = `gs://${BUCKET}/receipts/diagnostics/${binding.operation_sha256}/${reportSha256}.json`
  await transport.putJson(outputRef, report, { bucket: BUCKET, prefix: 'receipts', ifGenerationMatch: '0' })
  return { status: report.status, outputRef, sourceRevision, releaseAuthority: false }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env } = {}) {
  if (argv.length !== 1 || !['--bind', '--service-state'].includes(argv[0])) fail('ARGUMENTS_INVALID')
  const binding = bindDiagnosticRef(environment.OPERATION_REF)
  if (argv[0] === '--bind') {
    if (!environment.GITHUB_OUTPUT) fail('OUTPUT_MISSING')
    fs.appendFileSync(environment.GITHUB_OUTPUT, Object.entries(binding).map(([key, value]) => `${key}=${value}\n`).join(''))
    return { kind: binding.kind }
  }
  sourceAuthority(environment, environment.GITHUB_SHA)
  return readServiceDiagnostic({ binding, sourceRevision: environment.GITHUB_SHA, transport: createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' }) })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
