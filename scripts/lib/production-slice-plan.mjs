import { execFileSync } from 'node:child_process'

const SLICE_ORDER = Object.freeze([
  'documentation',
  'application',
  'authorization',
  'database',
  'preview',
  'recognition',
  'worker',
  'infrastructure',
  'release-control',
  'unknown',
])

const RELEASE_CONTROL = [
  /^\.github\/workflows\//u,
  /^(?:Dockerfile|\.dockerignore|\.gitattributes|package(?:-lock)?\.json)$/u,
  /^config\/release\//u,
  /^tools\/dev-117\//u,
  /^infra\/google-cloud\/dev-117-production-release\//u,
  /^scripts\/(?:lib\/)?dev0?12-/u,
  /^scripts\/(?:lib\/)?dev117-/u,
  /^scripts\/qc-dev-117-/u,
  /^scripts\/(?:lib\/)?production-slice-/u,
  /^scripts\/(?:plan|run)-production-slice(?:-|\.)/u,
]

const WORKER = [
  /^config\/release\/dev122-openswx-worker\.json$/u,
  /^infra\/google-cloud\/dev-122-openswx-/u,
  /^scripts\/lib\/openswx-reader\//u,
  /^scripts\/run-openswx-/u,
  /^scripts\/(?:lib\/)?dev122-openswx-/u,
  /^scripts\/lib\/dev122-historical-reader/u,
]

const DATABASE = [
  /^db\/postgres\//u,
  /^scripts\/.*(?:postgres|migration|database-boundary)/u,
  /^src\/lib\/(?:db|postgres|database|repositories)\//u,
  /^src\/lib\/.*(?:postgres|migration|schema)/u,
]

const AUTHORIZATION = [
  /^config\/access-control\//u,
  /^scripts\/.*(?:role-catalog|rd-permission|principal|permission|grant|session|sso|acl)/u,
  /^src\/.*(?:principal|permission|authorization|access-control|role-catalog|grant|session|sso|acl)/u,
  /^db\/postgres\/\d+_.*(?:principal|permission|role|grant|catalog)/u,
]

const PREVIEW = [
  /^src\/.*(?:preview|pdf|file-asset|attachment|sharp)/u,
  /^scripts\/.*(?:preview|pdf|sharp)/u,
]

const RECOGNITION = [
  /^src\/.*(?:recognition|ocr|tesseract)/u,
  /^scripts\/.*(?:recognition|ocr|tesseract)/u,
]

const INFRASTRUCTURE = [
  /^infra\//u,
  /^scripts\/.*(?:terraform|iac|infrastructure)/u,
]

const APPLICATION = [
  /^src\//u,
  /^public\//u,
  /^next\.config\./u,
  /^tsconfig(?:\..+)?\.json$/u,
]

const DOCUMENTATION = [
  /^AGENTS\.md$/u,
  /^\.ai-doc\//u,
  /(?:^|\/)README\.md$/u,
  /\.md$/u,
]

function matches(path, patterns) {
  return patterns.some(pattern => pattern.test(path))
}

export function normalizeChangedPath(value) {
  return String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//u, '')
}

export function classifyProductionPath(value) {
  const path = normalizeChangedPath(value)
  const slices = new Set()
  if (!path) return ['unknown']

  // This one document is copied into the production image and is therefore
  // application input, unlike the rest of .ai-doc which Docker excludes.
  if (path === '.ai-doc/reference/pdm-management-policy-draft.md') slices.add('application')
  if (matches(path, RELEASE_CONTROL)) slices.add('release-control')
  if (matches(path, WORKER)) slices.add('worker')
  if (matches(path, DATABASE)) slices.add('database')
  if (matches(path, AUTHORIZATION)) slices.add('authorization')
  if (matches(path, PREVIEW)) slices.add('preview')
  if (matches(path, RECOGNITION)) slices.add('recognition')
  if (matches(path, INFRASTRUCTURE)) slices.add('infrastructure')
  if (matches(path, APPLICATION)) slices.add('application')

  if (slices.size === 0 && matches(path, DOCUMENTATION)) slices.add('documentation')
  if (slices.size === 0) slices.add('unknown')
  return SLICE_ORDER.filter(slice => slices.has(slice))
}

export function createProductionSlicePlan(paths, { baseRevision = null, headRevision = null } = {}) {
  const files = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))].sort()
  const reasons = Object.fromEntries(SLICE_ORDER.map(slice => [slice, []]))
  for (const file of files) {
    for (const slice of classifyProductionPath(file)) reasons[slice].push(file)
  }
  if (files.length === 0) reasons.unknown.push('(empty-change-set)')

  const slices = SLICE_ORDER.filter(slice => reasons[slice].length > 0)
  const has = slice => slices.includes(slice)
  const full = has('release-control') || has('unknown')
  const docsOnly = !full && slices.length === 1 && has('documentation')
  const databaseAffected = full || has('database')
  const gates = {
    planner: true,
    full,
    documentation: docsOnly,
    application: full || has('application') || has('authorization') || has('preview') || has('recognition'),
    authorization: full || has('authorization'),
    database: databaseAffected,
    preview: full || has('preview'),
    recognition: full || has('recognition'),
    worker: full || has('worker'),
    infrastructure: full || has('infrastructure'),
    releaseCore: databaseAffected || has('worker') || has('infrastructure'),
    dbBoundary: databaseAffected,
    nativePostgres: databaseAffected,
    migration: databaseAffected,
    isolatedBuild: full || has('application') || has('authorization') || has('preview') || has('recognition'),
    desktopUi: full || has('application') || has('preview') || has('recognition'),
  }
  const releasePhases = docsOnly
    ? []
    : ['preflight', 'build', ...(gates.migration ? ['migrate-if-needed'] : []), 'candidate-smoke', 'activate-readback']
  const evidenceRequirements = docsOnly
    ? ['documentation-contract']
    : [
        ...(gates.authorization ? ['actor-grant-allow-deny'] : []),
        ...(gates.database ? ['transaction-readback-rollback'] : []),
        ...(gates.preview ? ['version-bytes-desktop'] : []),
        ...(gates.worker ? ['job-terminal-cleanup'] : []),
        ...(gates.desktopUi && !gates.preview ? ['focused-behavior-desktop'] : []),
        ...(gates.full || gates.infrastructure ? ['source-image-revision-traffic-rollback'] : []),
      ]

  return {
    schemaVersion: 'aipdm.production-slice-plan.v2',
    baseRevision,
    headRevision,
    classification: full ? 'FULL' : docsOnly ? 'DOCUMENTATION_ONLY' : 'AFFECTED_SLICES',
    files,
    slices,
    reasons: Object.fromEntries(Object.entries(reasons).filter(([, entries]) => entries.length > 0)),
    gates,
    releasePhases,
    evidenceRequirements: [...new Set(evidenceRequirements)],
  }
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

function validRef(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_./~^{}-]+$/u.test(value)
}

export function createProductionSlicePlanFromGit({ root = process.cwd(), base = null, head = null } = {}) {
  const requestedHead = head ?? process.env.PDM_SLICE_HEAD_SHA ?? null
  const resolvedHead = git(root, ['rev-parse', validRef(requestedHead) ? requestedHead : 'HEAD'])
  let requestedBase = base ?? process.env.PDM_SLICE_BASE_SHA ?? null
  if (!validRef(requestedBase) || /^0+$/u.test(requestedBase)) {
    try { requestedBase = git(root, ['merge-base', 'origin/main', resolvedHead]) }
    catch { requestedBase = `${resolvedHead}^1` }
  }
  const resolvedBase = git(root, ['rev-parse', requestedBase])
  const includeWorkingTree = !head && !process.env.PDM_SLICE_HEAD_SHA
  const diffArgs = includeWorkingTree
    ? ['diff', '--name-only', '--no-renames', '--diff-filter=ACDMRT', resolvedBase, '--']
    : ['diff', '--name-only', '--no-renames', '--diff-filter=ACDMRT', resolvedBase, resolvedHead, '--']
  const changed = git(root, diffArgs).split(/\r?\n/u).filter(Boolean)
  if (includeWorkingTree) {
    changed.push(...git(root, ['ls-files', '--others', '--exclude-standard']).split(/\r?\n/u).filter(Boolean))
  }
  return createProductionSlicePlan(changed, { baseRevision: resolvedBase, headRevision: resolvedHead })
}

export const productionSliceOrder = SLICE_ORDER
