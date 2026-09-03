import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = 'ai-pdm'
const CONTRACT_VERSION = 'jenfu.platform-auth.v1'
const SOURCE = 'Jenfu-Management-system/contracts/jenfu-platform-auth/v1'
const PAYLOAD_PATHS = [
  'auth-error-codes.json',
  'canonical-principal.schema.json',
  'fixtures/canonical-principal.active.json',
  'fixtures/verified-session.ai-pdm.json',
  'fixtures/verified-session.orgmaster.json',
  'fixtures/verified-session.portal.json',
  'verified-app-session-context.schema.json',
]
const EXPECTED_ERRORS = [
  [400, 'auth_request_invalid'],
  [401, 'auth_token_invalid'],
  [401, 'auth_session_invalid'],
  [401, 'auth_epoch_stale'],
  [403, 'principal_not_active'],
  [403, 'principal_ambiguous'],
  [403, 'auth_origin_invalid'],
  [409, 'auth_contract_mismatch'],
  [413, 'auth_request_too_large'],
  [415, 'auth_json_required'],
  [429, 'auth_rate_limited'],
  [503, 'principal_directory_unavailable'],
  [503, 'auth_epoch_unavailable'],
  [503, 'auth_server_not_configured'],
]

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contractRoot = join(projectRoot, 'contracts', 'jenfu-platform-auth', 'v1')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readPayload() {
  return new Map(PAYLOAD_PATHS.map((path) => [path, readFileSync(join(contractRoot, ...path.split('/')))]))
}

function assertNonBlank(value, field) {
  assert.equal(typeof value, 'string', `${field} must be a string`)
  assert.ok(value.length >= 1 && value.length <= 255, `${field} length must be 1..255`)
  assert.ok(/\S/u.test(value), `${field} must not be blank`)
}

function assertDateTime(value, field) {
  assert.equal(typeof value, 'string', `${field} must be a string`)
  assert.ok(Number.isFinite(Date.parse(value)), `${field} must be an ISO-8601 date-time`)
}

function validatePrincipal(value) {
  assert.equal(value.contractVersion, CONTRACT_VERSION)
  assert.equal(value.directoryContractVersion, 'organization.active-principal.v1')
  assert.match(value.identityIssuer, /^https:\/\/securetoken\.google\.com\/[^/\s]+$/u)
  for (const field of ['identitySubject', 'principalId', 'employeeId']) assertNonBlank(value[field], field)
  assert.ok(Number.isSafeInteger(value.mappingVersion) && value.mappingVersion >= 1)
  assertDateTime(value.publishedAt, 'publishedAt')
}

function validateSession(value) {
  assert.equal(value.contractVersion, CONTRACT_VERSION)
  assert.ok(['jenfu-portal', 'orgmaster', 'ai-pdm'].includes(value.appId))
  assert.ok(typeof value.sessionId === 'string' && value.sessionId.length >= 16 && value.sessionId.length <= 512)
  assert.match(value.identityIssuer, /^https:\/\/securetoken\.google\.com\/[^/\s]+$/u)
  for (const field of ['identitySubject', 'principalId', 'employeeId']) assertNonBlank(value[field], field)
  if (value.appId === 'jenfu-portal') assert.equal(value.localPrincipalId, null)
  else assertNonBlank(value.localPrincipalId, 'localPrincipalId')
  assert.ok(Number.isSafeInteger(value.authEpoch) && value.authEpoch >= 0)
  assertDateTime(value.issuedAt, 'issuedAt')
  assertDateTime(value.expiresAt, 'expiresAt')
  const duration = Date.parse(value.expiresAt) - Date.parse(value.issuedAt)
  assert.ok(duration > 0 && duration <= 8 * 60 * 60 * 1000)
  assert.ok(['aal1', 'aal2'].includes(value.assuranceLevel))
}

function main() {
  const payload = readPayload()
  const files = [...payload.entries()].map(([path, bytes]) => ({ path, sha256: sha256(bytes) }))
  const aggregateInput = files.map(({ path, sha256: fileHash }) => `${path}\0${fileHash}\n`).join('')
  const aggregateSha256 = sha256(Buffer.from(aggregateInput, 'utf8'))
  const tamperedFiles = files.map((file, index) => index === 0
    ? { ...file, sha256: sha256(Buffer.concat([payload.get(file.path), Buffer.from(' ')])) }
    : file)
  const tamperedInput = tamperedFiles.map(({ path, sha256: fileHash }) => `${path}\0${fileHash}\n`).join('')
  assert.notEqual(sha256(Buffer.from(tamperedInput, 'utf8')), aggregateSha256, 'one-byte contract drift was not detected')
  const manifest = readJson(join(contractRoot, 'contract-manifest.json'))
  const lock = readJson(join(contractRoot, 'contract-lock.json'))

  assert.equal(manifest.contractVersion, CONTRACT_VERSION)
  assert.equal(manifest.hashAlgorithm, 'sha256')
  assert.equal(manifest.fileCount, PAYLOAD_PATHS.length)
  assert.deepEqual(manifest.files, files)
  assert.equal(manifest.sha256, aggregateSha256)
  assert.deepEqual(Object.keys(lock).sort(), ['contractVersion', 'sha256', 'source', 'updatedAt'])
  assert.equal(lock.contractVersion, CONTRACT_VERSION)
  assert.equal(lock.source, SOURCE)
  assert.equal(lock.sha256, aggregateSha256)
  assert.ok(Number.isFinite(Date.parse(lock.updatedAt)))

  const principalSchema = JSON.parse(payload.get('canonical-principal.schema.json'))
  const sessionSchema = JSON.parse(payload.get('verified-app-session-context.schema.json'))
  assert.equal(principalSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(sessionSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(principalSchema.additionalProperties, false)
  assert.equal(sessionSchema.additionalProperties, false)
  assert.equal(principalSchema.properties.contractVersion.const, CONTRACT_VERSION)
  assert.equal(sessionSchema.properties.contractVersion.const, CONTRACT_VERSION)

  const errors = JSON.parse(payload.get('auth-error-codes.json'))
  assert.equal(errors.contractVersion, CONTRACT_VERSION)
  assert.deepEqual(errors.errors.map(({ httpStatus, code }) => [httpStatus, code]), EXPECTED_ERRORS)
  assert.equal(new Set(errors.errors.map(({ code }) => code)).size, EXPECTED_ERRORS.length)

  const principal = JSON.parse(payload.get('fixtures/canonical-principal.active.json'))
  validatePrincipal(principal)
  const sessions = [
    'fixtures/verified-session.portal.json',
    'fixtures/verified-session.orgmaster.json',
    'fixtures/verified-session.ai-pdm.json',
  ].map((path) => JSON.parse(payload.get(path)))
  sessions.forEach(validateSession)
  assert.deepEqual(sessions.map(({ appId }) => appId).sort(), ['ai-pdm', 'jenfu-portal', 'orgmaster'])
  assert.equal(new Set(sessions.map(({ sessionId }) => sessionId)).size, 3)
  for (const session of sessions) {
    assert.equal(session.identityIssuer, principal.identityIssuer)
    assert.equal(session.identitySubject, principal.identitySubject)
    assert.equal(session.principalId, principal.principalId)
    assert.equal(session.employeeId, principal.employeeId)
  }

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    project: PROJECT,
    contractVersion: CONTRACT_VERSION,
    sha256: aggregateSha256,
    files: files.length,
    fixtures: sessions.length + 1,
    errorCodes: errors.errors.length,
    driftSelfTest: 'PASS',
  })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-004 ${PROJECT} contract check failed: ${error.message}\n`)
  process.exitCode = 1
}
