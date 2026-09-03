const VERSION = /^(\d{3})_/u
const SHA256 = /^[0-9a-f]{64}$/u
const RETIRED_SOURCE_VERSIONS = new Set(['054'])
const ACTIVE_SOURCE_VERSIONS = Array.from({ length: 56 }, (_, index) => String(index + 1).padStart(3, '0'))
  .filter((version) => !RETIRED_SOURCE_VERSIONS.has(version))
const DERIVED_BASELINE_OVERLAY_VERSIONS = ['042']
const FRESH_APPLY_VERSIONS = ['001', '003', '047', '048', '049', '050', '051', '052', '053', '055', '056', '062']

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  throw error
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) fail('DEV010_N2_AI_MIGRATION_SET_INVALID')
  const normalized = files.map((file) => {
    if (!file || typeof file.path !== 'string' || typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) fail('DEV010_N2_AI_MIGRATION_SET_INVALID')
    const match = file.path.split('/').at(-1)?.match(VERSION)
    if (!match) fail('DEV010_N2_AI_MIGRATION_SET_INVALID', file.path)
    return { ...file, version: match[1] }
  }).sort((left, right) => left.path.localeCompare(right.path))
  if (new Set(normalized.map((file) => file.path)).size !== normalized.length) fail('DEV010_N2_DUPLICATE_PATH')
  return normalized
}

export function classifyMigrationHistory(files, ledger = [], compatibility = { entries: [] }) {
  const normalized = normalizeFiles(files)
  const source = normalized.filter((file) => Number(file.version) <= 56)
  const counts = new Map()
  for (const file of source) counts.set(file.version, (counts.get(file.version) ?? 0) + 1)
  for (const version of ACTIVE_SOURCE_VERSIONS) {
    if (counts.get(version) !== 1) fail('DEV010_N2_AI_MIGRATION_SEQUENCE_INVALID', version)
  }
  for (const version of RETIRED_SOURCE_VERSIONS) {
    if (counts.has(version)) fail('DEV010_N2_AI_RETIRED_MIGRATION_PRESENT', version)
  }
  if (!Array.isArray(ledger)) fail('DEV010_N2_AI_LEDGER_INVALID')
  const ledgerByVersion = new Map()
  for (const entry of ledger) {
    if (!entry || typeof entry.version !== 'string' || typeof entry.checksum !== 'string' || !SHA256.test(entry.checksum) || ledgerByVersion.has(entry.version)) fail('DEV010_N2_AI_LEDGER_INVALID')
    ledgerByVersion.set(entry.version, entry.checksum)
  }
  const compatibilityEntries = Array.isArray(compatibility?.entries) ? compatibility.entries : []
  const accepted = new Map(compatibilityEntries.map((entry) => [entry.version, entry]))
  const classifications = source.map((file) => {
    const applied = ledgerByVersion.get(file.version)
    if (!applied) return { ...file, action: 'apply', ledgerVersion: file.version }
    if (applied === file.sha256) return { ...file, action: 'noop', ledgerVersion: file.version }
    const entry = accepted.get(file.version)
    if (!entry?.acceptedExistingChecksums?.includes(applied)) fail('DEV010_N2_AI_LEDGER_CHECKSUM_UNKNOWN', file.version)
    return { ...file, action: entry.replacementVersion ? 'apply-replacement' : 'accepted-history', ledgerVersion: entry.replacementVersion ?? file.version }
  })
  return {
    classifications,
    ledgerVersions: [...ledgerByVersion.keys()].sort(),
    retiredLedgerVersions: [...RETIRED_SOURCE_VERSIONS].filter((version) => ledgerByVersion.has(version)),
    retiredSourceVersions: [...RETIRED_SOURCE_VERSIONS],
    status: 'PASS',
  }
}

export function buildFreshLanePackage(input) {
  const files = normalizeFiles(input?.files ?? [])
  const byVersion = new Map(files.map((file) => [file.version, file]))
  for (const version of [...ACTIVE_SOURCE_VERSIONS, '062']) {
    if (!byVersion.has(version)) fail('DEV010_N2_AI_MIGRATION_SEQUENCE_INVALID', version)
  }
  for (const version of RETIRED_SOURCE_VERSIONS) {
    if (byVersion.has(version)) fail('DEV010_N2_AI_RETIRED_MIGRATION_PRESENT', version)
  }
  return {
    apply: FRESH_APPLY_VERSIONS.map((version) => byVersion.get(version)),
    derivedBaselineOverlays: DERIVED_BASELINE_OVERLAY_VERSIONS.map((version) => byVersion.get(version)),
    folded: files.filter((file) => Number(file.version) >= 4 && Number(file.version) <= 46),
    retiredSourceVersions: [...RETIRED_SOURCE_VERSIONS],
    sourceTraceOnly: [byVersion.get('002')],
    status: 'PASS',
  }
}

export function buildExistingHistoryPlan(input) {
  const history = classifyMigrationHistory(input?.files, input?.ledger, input?.compatibility)
  const forward = history.classifications.filter((entry) => ['apply', 'apply-replacement'].includes(entry.action) && Number(entry.version) >= 47)
  const boundary = normalizeFiles(input.files).find((entry) => entry.version === '062')
  if (!boundary) fail('DEV010_N2_AI_MIGRATION_SEQUENCE_INVALID', '062')
  return { forward: [...forward, boundary], history, status: 'PASS' }
}

export function classifyPublicObjects(catalog, manifest = { extensionObjects: [] }) {
  if (!Array.isArray(catalog)) fail('DEV010_N2_AI_PUBLIC_CATALOG_INVALID')
  const allowed = new Set(manifest.extensionObjects ?? [])
  const extension = []
  const business = []
  const unknown = []
  for (const item of catalog) {
    if (!item || typeof item.identity !== 'string' || typeof item.kind !== 'string') fail('DEV010_N2_AI_PUBLIC_CATALOG_INVALID')
    if (allowed.has(item.identity) && item.extensionOwned === true) extension.push(item)
    else if (['table', 'partitioned table', 'view', 'materialized view', 'sequence', 'function'].includes(item.kind) && item.extensionOwned !== true) business.push(item)
    else unknown.push(item)
  }
  if (unknown.length) fail('DEV010_N2_AI_PUBLIC_OBJECT_UNKNOWN', unknown[0].identity)
  return { business, extension, status: 'PASS' }
}

export function buildNamespaceMoveSql(plan) {
  if (!Array.isArray(plan) || !plan.length) fail('DEV010_N2_AI_NAMESPACE_PLAN_INVALID')
  const statements = plan.map((item) => {
    if (!item || !['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'SEQUENCE', 'FUNCTION'].includes(item.kind) || !/^[a-z_][a-z0-9_]*(?:\([^;]*\))?$/u.test(item.identity)) fail('DEV010_N2_AI_NAMESPACE_PLAN_INVALID')
    return `ALTER ${item.kind} public.${item.identity} SET SCHEMA ai_pdm_core;`
  })
  return `${statements.join('\n')}\n`
}

export function assertNoPublicBusinessObjects(readback) {
  if (!readback || !Number.isSafeInteger(readback.publicBusinessObjectCount) || readback.publicBusinessObjectCount !== 0) fail('DEV010_N2_PUBLIC_BUSINESS_OBJECT_REMAINS')
  if (!Number.isSafeInteger(readback.unknownExtensionObjectCount) || readback.unknownExtensionObjectCount !== 0) fail('DEV010_N2_AI_PUBLIC_OBJECT_UNKNOWN')
  return { publicBusinessObjectCount: 0, unknownExtensionObjectCount: 0, status: 'PASS' }
}
