import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SHA256 = /^[0-9a-f]{64}$/u
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u
const RELATIVE_PATH = /^(?![A-Za-z]:)(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$))[^\0]+$/u
const SECRET_KEY = /(password|token|secret|private[_-]?key|credential|dsn|connection[_-]?(string|url))/iu
const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s"']+/giu
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu

const ROOT_KEYS = [
  'appId',
  'baseline',
  'changeAllowlist',
  'compatibilityObjects',
  'connectionBudget',
  'dataClasses',
  'devId',
  'lane',
  'manifestVersion',
  'packageId',
  'provides',
  'repository',
  'requires',
  'rollbackBoundary',
]

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  throw error
}

function object(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label)
  return value
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('DEV010_N2_MANIFEST_UNKNOWN_KEY', `${label}:${actual.join(',')}`)
  }
}

function unique(values, code, label) {
  if (new Set(values).size !== values.length) fail(code, label)
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) fail('DEV010_N2_INVALID_IDENTIFIER', label)
}

function checksum(value, label, nullable = false) {
  if (nullable && value === null) return
  if (typeof value !== 'string' || !SHA256.test(value)) fail('DEV010_N2_HASH_MISMATCH', label)
}

function relativePath(value, label) {
  if (typeof value !== 'string' || !RELATIVE_PATH.test(value) || path.isAbsolute(value)) {
    fail('DEV010_N2_ABSOLUTE_SECRET_PATH', label)
  }
  return value.replaceAll('\\', '/')
}

function stringArray(value, label, pathValues = false) {
  if (!Array.isArray(value)) fail('DEV010_N2_INVALID_MANIFEST', label)
  const normalized = value.map((item, index) => {
    if (typeof item !== 'string' || item.length === 0) fail('DEV010_N2_INVALID_MANIFEST', `${label}[${index}]`)
    return pathValues ? relativePath(item, `${label}[${index}]`) : item
  })
  unique(normalized, 'DEV010_N2_DUPLICATE_PATH', label)
  return normalized
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

export function sourceSha256(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes)
  return sha256(text.replace(/\r\n/gu, '\n'))
}

export function assertPackageConfig(value) {
  object(value, 'DEV010_N2_INVALID_MANIFEST', 'root')
  exactKeys(value, ROOT_KEYS, 'root')
  if (value.manifestVersion !== 'jenfu.dev010.n2.package.v1' || value.devId !== 'DEV-010') {
    fail('DEV010_N2_INVALID_MANIFEST_VERSION')
  }
  identifier(value.packageId, 'packageId')
  identifier(value.appId, 'appId')
  if (!['fresh', 'existing-history', 'consumer'].includes(value.lane)) fail('DEV010_N2_INVALID_LANE')

  object(value.repository, 'DEV010_N2_INVALID_MANIFEST', 'repository')
  exactKeys(value.repository, ['head', 'name'], 'repository')
  identifier(value.repository.name, 'repository.name')
  if (typeof value.repository.head !== 'string' || !/^[0-9a-f]{40}$/u.test(value.repository.head)) fail('DEV010_N2_HEAD_MISMATCH')

  object(value.baseline, 'DEV010_N2_INVALID_MANIFEST', 'baseline')
  exactKeys(value.baseline, ['aggregateSha256', 'files'], 'baseline')
  checksum(value.baseline.aggregateSha256, 'baseline.aggregateSha256')
  value.baseline.files = stringArray(value.baseline.files, 'baseline.files', true)
  if (!value.baseline.files.length) fail('DEV010_N2_INVALID_MANIFEST', 'baseline.files')

  object(value.changeAllowlist, 'DEV010_N2_INVALID_MANIFEST', 'changeAllowlist')
  exactKeys(value.changeAllowlist, ['modify', 'new', 'outputPrefixes'], 'changeAllowlist')
  for (const key of ['modify', 'new', 'outputPrefixes']) value.changeAllowlist[key] = stringArray(value.changeAllowlist[key], `changeAllowlist.${key}`, true)
  unique([...value.changeAllowlist.modify, ...value.changeAllowlist.new], 'DEV010_N2_DUPLICATE_PATH', 'changeAllowlist')

  if (!Array.isArray(value.provides) || !Array.isArray(value.requires)) fail('DEV010_N2_INVALID_MANIFEST', 'contracts')
  for (const [kind, contracts] of [['provides', value.provides], ['requires', value.requires]]) {
    contracts.forEach((contract, index) => {
      object(contract, 'DEV010_N2_INVALID_MANIFEST', `${kind}[${index}]`)
      const keys = kind === 'provides'
        ? ['contractId', 'contractVersion', 'dependsOn', 'payloadSha256', 'signatureSha256']
        : ['contractId', 'contractVersion', 'fromPackageId', 'payloadSha256', 'signatureSha256']
      exactKeys(contract, keys, `${kind}[${index}]`)
      identifier(contract.contractId, `${kind}[${index}].contractId`)
      identifier(contract.contractVersion, `${kind}[${index}].contractVersion`)
      checksum(contract.signatureSha256, `${kind}[${index}].signatureSha256`)
      checksum(contract.payloadSha256, `${kind}[${index}].payloadSha256`, true)
      if (kind === 'provides') contract.dependsOn = stringArray(contract.dependsOn, `${kind}[${index}].dependsOn`)
      else identifier(contract.fromPackageId, `${kind}[${index}].fromPackageId`)
    })
    unique(contracts.map((item) => `${item.contractId}@${item.contractVersion}`), 'DEV010_N2_DUPLICATE_VERSION', kind)
    unique(contracts.map((item) => item.signatureSha256), 'DEV010_N2_DUPLICATE_SIGNATURE', kind)
  }

  value.compatibilityObjects = stringArray(value.compatibilityObjects, 'compatibilityObjects')
  value.dataClasses = stringArray(value.dataClasses, 'dataClasses')

  object(value.connectionBudget, 'DEV010_N2_INVALID_MANIFEST', 'connectionBudget')
  exactKeys(value.connectionBudget, ['applicationNamePrefix', 'connectionTimeoutMs', 'effectiveMaxInstances', 'idleTimeoutMs', 'poolMax', 'poolsPerInstance', 'queryTimeoutMs', 'statementTimeoutMs'], 'connectionBudget')
  identifier(value.connectionBudget.applicationNamePrefix, 'connectionBudget.applicationNamePrefix')
  for (const key of ['connectionTimeoutMs', 'effectiveMaxInstances', 'idleTimeoutMs', 'poolMax', 'poolsPerInstance', 'queryTimeoutMs', 'statementTimeoutMs']) {
    if (!Number.isSafeInteger(value.connectionBudget[key]) || value.connectionBudget[key] < 1) fail('DEV010_N2_INVALID_CAPACITY_INPUT', key)
  }
  if (value.connectionBudget.queryTimeoutMs <= value.connectionBudget.statementTimeoutMs) fail('DEV010_N2_INVALID_TIMEOUT_ORDER')

  object(value.rollbackBoundary, 'DEV010_N2_INVALID_MANIFEST', 'rollbackBoundary')
  exactKeys(value.rollbackBoundary, ['mode', 'productionWrites'], 'rollbackBoundary')
  if (value.rollbackBoundary.mode !== 'discard-task-database' || value.rollbackBoundary.productionWrites !== false) fail('DEV010_N2_PRODUCTION_TARGET_FORBIDDEN')
  return value
}

export function loadPackageConfig(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.includes('\0')) fail('DEV010_N2_ABSOLUTE_SECRET_PATH')
  return assertPackageConfig(JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8')))
}

export function buildSourceManifest(input) {
  object(input, 'DEV010_N2_INVALID_SOURCE_INPUT', 'input')
  const root = path.resolve(input.root)
  const files = stringArray(input.files, 'input.files', true).sort()
  if (typeof input.head !== 'string' || !/^[0-9a-f]{40}$/u.test(input.head)) fail('DEV010_N2_HEAD_MISMATCH')
  const entries = files.map((relative) => {
    const absolute = path.resolve(root, ...relative.split('/'))
    if (path.relative(root, absolute).startsWith('..') || !fs.statSync(absolute).isFile()) fail('DEV010_N2_SOURCE_PATH_OUT_OF_SCOPE', relative)
    return { path: relative, sha256: sourceSha256(fs.readFileSync(absolute)) }
  })
  const aggregateSha256 = sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''))
  return { aggregateSha256, files: entries, head: input.head }
}

export function buildGitSourceManifest(input) {
  object(input, 'DEV010_N2_INVALID_SOURCE_INPUT', 'input')
  const root = path.resolve(input.root)
  const files = stringArray(input.files, 'input.files', true).sort()
  if (typeof input.head !== 'string' || !/^[0-9a-f]{40}$/u.test(input.head)) fail('DEV010_N2_HEAD_MISMATCH')
  const entries = files.map((relative) => {
    let bytes
    try {
      bytes = execFileSync('git', ['show', `${input.head}:${relative}`], {
        cwd: root,
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      })
    } catch {
      fail('DEV010_N2_SOURCE_PATH_OUT_OF_SCOPE', relative)
    }
    return { path: relative, sha256: sourceSha256(bytes) }
  })
  const aggregateSha256 = sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''))
  return { aggregateSha256, files: entries, head: input.head }
}

export function buildCandidateSourceManifest(input) {
  object(input, 'DEV010_N2_INVALID_SOURCE_INPUT', 'input')
  const root = path.resolve(input.root)
  const files = stringArray(input.files, 'input.files', true).sort()
  const workingPaths = new Set(stringArray(input.workingPaths ?? [], 'input.workingPaths', true))
  if (typeof input.head !== 'string' || !/^[0-9a-f]{40}$/u.test(input.head)) fail('DEV010_N2_HEAD_MISMATCH')
  const entries = files.map((relative) => {
    let bytes
    if (workingPaths.has(relative)) {
      const absolute = path.resolve(root, ...relative.split('/'))
      if (path.relative(root, absolute).startsWith('..') || !fs.statSync(absolute).isFile()) fail('DEV010_N2_SOURCE_PATH_OUT_OF_SCOPE', relative)
      bytes = fs.readFileSync(absolute)
    } else {
      try {
        bytes = execFileSync('git', ['show', `${input.head}:${relative}`], {
          cwd: root,
          encoding: 'buffer',
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
        })
      } catch {
        fail('DEV010_N2_SOURCE_PATH_OUT_OF_SCOPE', relative)
      }
    }
    return { path: relative, sha256: sourceSha256(bytes) }
  })
  const aggregateSha256 = sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''))
  return { aggregateSha256, files: entries, head: input.head }
}

export function assertSourceDrift(baseline, candidate, allowlist = { modify: [], new: [], outputPrefixes: [] }, options = {}) {
  object(baseline, 'DEV010_N2_INVALID_SOURCE_INPUT', 'baseline')
  object(candidate, 'DEV010_N2_INVALID_SOURCE_INPUT', 'candidate')
  if (baseline.head !== candidate.head && options.allowDescendantHead !== true) fail('DEV010_N2_HEAD_MISMATCH')
  const expected = new Map((baseline.files ?? []).map((item) => [item.path, item.sha256]))
  const actual = new Map((candidate.files ?? []).map((item) => [item.path, item.sha256]))
  const allowed = new Set([...(allowlist.modify ?? []), ...(allowlist.new ?? [])])
  for (const [filePath, expectedHash] of expected) {
    if (!actual.has(filePath)) fail('DEV010_N2_SOURCE_FILE_MISSING', filePath)
    if (actual.get(filePath) !== expectedHash && !allowed.has(filePath)) fail('DEV010_N2_HASH_MISMATCH', filePath)
  }
  for (const filePath of actual.keys()) {
    if (!expected.has(filePath) && !allowed.has(filePath) && !(allowlist.outputPrefixes ?? []).some((prefix) => filePath.startsWith(prefix))) {
      fail('DEV010_N2_ALLOWLIST_DRIFT', filePath)
    }
  }
  const drift = [...actual].filter(([filePath, hash]) => expected.get(filePath) !== hash).map(([filePath]) => filePath).sort()
  return { drift, status: 'PASS' }
}

export function validateDependencyGraph(manifests) {
  if (!Array.isArray(manifests) || manifests.length !== 3) fail('DEV010_N2_GRAPH_INCOMPLETE')
  manifests.forEach(assertPackageConfig)
  unique(manifests.map((item) => item.packageId), 'DEV010_N2_DUPLICATE_PACKAGE', 'manifests')
  const producers = new Map()
  for (const manifest of manifests) for (const contract of manifest.provides) {
    const key = `${contract.contractId}@${contract.contractVersion}`
    if (producers.has(key)) fail('DEV010_N2_DUPLICATE_VERSION', key)
    producers.set(key, { contract, packageId: manifest.packageId })
  }
  for (const manifest of manifests) for (const requirement of manifest.requires) {
    const key = `${requirement.contractId}@${requirement.contractVersion}`
    const producer = producers.get(key)
    if (!producer || producer.packageId !== requirement.fromPackageId || producer.contract.signatureSha256 !== requirement.signatureSha256 || producer.contract.payloadSha256 !== requirement.payloadSha256) {
      fail('DEV010_N2_UNKNOWN_DEPENDENCY', key)
    }
    if (producer.packageId === manifest.packageId) fail('DEV010_N2_SELF_DEPENDENCY', key)
  }
  const edges = []
  for (const [key, producer] of producers) for (const dependency of producer.contract.dependsOn) {
    if (!producers.has(dependency)) fail('DEV010_N2_UNKNOWN_DEPENDENCY', dependency)
    if (dependency === key) fail('DEV010_N2_SELF_DEPENDENCY', key)
    edges.push([dependency, key])
  }
  const visiting = new Set()
  const visited = new Set()
  const outgoing = new Map()
  for (const [from, to] of edges) outgoing.set(from, [...(outgoing.get(from) ?? []), to])
  function visit(node) {
    if (visiting.has(node)) fail('DEV010_N2_DEPENDENCY_CYCLE', node)
    if (visited.has(node)) return
    visiting.add(node)
    for (const next of outgoing.get(node) ?? []) visit(next)
    visiting.delete(node)
    visited.add(node)
  }
  for (const key of producers.keys()) visit(key)
  const graph = { edges: edges.sort((a, b) => canonicalize(a).localeCompare(canonicalize(b))), nodes: [...producers.keys()].sort() }
  return { ...graph, graphSha256: sha256(canonicalize(graph)), status: 'PASS' }
}

export function calculateConnectionBudget(input) {
  object(input, 'DEV010_N2_INVALID_CAPACITY_INPUT', 'input')
  exactKeys(input, ['applications', 'databaseMaxConnections', 'migrationAdminReserve', 'reserveRatio'], 'connectionBudget')
  if (!Array.isArray(input.applications) || input.applications.length !== 3) fail('DEV010_N2_INVALID_CAPACITY_INPUT', 'applications')
  const appConnections = input.applications.reduce((total, app) => {
    object(app, 'DEV010_N2_INVALID_CAPACITY_INPUT', 'application')
    exactKeys(app, ['appId', 'effectiveMaxInstances', 'poolMax', 'poolsPerInstance'], 'application')
    identifier(app.appId, 'application.appId')
    for (const key of ['effectiveMaxInstances', 'poolMax', 'poolsPerInstance']) if (!Number.isSafeInteger(app[key]) || app[key] < 1) fail('DEV010_N2_INVALID_CAPACITY_INPUT', key)
    return total + app.effectiveMaxInstances * app.poolMax * app.poolsPerInstance
  }, 0)
  unique(input.applications.map((app) => app.appId), 'DEV010_N2_DUPLICATE_APP_ID', 'applications')
  if (!Number.isSafeInteger(input.databaseMaxConnections) || input.databaseMaxConnections < 1 || !Number.isSafeInteger(input.migrationAdminReserve) || input.migrationAdminReserve < 0 || typeof input.reserveRatio !== 'number' || input.reserveRatio < 0.3 || input.reserveRatio >= 1) fail('DEV010_N2_INVALID_CAPACITY_INPUT')
  const allowedConnections = Math.floor(input.databaseMaxConnections * (1 - input.reserveRatio))
  const requiredConnections = appConnections + input.migrationAdminReserve
  const result = { allowedConnections, applicationConnections: appConnections, requiredConnections, reserveConnections: input.databaseMaxConnections - allowedConnections, status: requiredConnections <= allowedConnections ? 'PASS' : 'FAIL' }
  if (result.status === 'FAIL') fail('DEV010_N2_CONNECTION_BUDGET_EXCEEDED', canonicalize(result))
  return result
}

export function redactEvidence(value) {
  const visit = (input, key = '') => {
    if (SECRET_KEY.test(key)) return '[REDACTED]'
    if (Array.isArray(input)) return input.map((item) => visit(item))
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([childKey, child]) => [childKey, visit(child, childKey)]))
    if (typeof input !== 'string') return input
    return input.replace(PRIVATE_KEY, '[REDACTED_PRIVATE_KEY]').replace(POSTGRES_URL, '[REDACTED_POSTGRES_URL]').replace(BEARER, 'Bearer [REDACTED]')
  }
  return visit(value)
}
