import fs from 'node:fs'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { nativeCodeFingerprint } from './dev015-gcc-applicability.mjs'

export const GCC_ALIGNED_NEW_CVE = 'CVE-2026-95619'
const H64 = /^[a-f0-9]{64}$/u
const H40 = /^[a-f0-9]{40}$/u
const LIB = '/usr/lib/x86_64-linux-gnu/libstdc++.so.6.0.33'
const LIB_HASH = '972bb2a18b71140dab0240f8a1f68ab3fb1d56bcd4c4f824a91b70888faf5a00'
const unsafeEnvironment = name => name.startsWith('LD_') || ['NODE_OPTIONS', 'NODE_PATH', 'GLIBC_TUNABLES', 'GCONV_PATH', 'VIPS_PATH', 'SHARP_FORCE_GLOBAL_LIBVIPS'].includes(name)
const invalid = () => { const error = new Error('GCC_ALIGNED_NEW_EVIDENCE_INVALID'); error.code = error.message; throw error }
const equal = (a, b) => canonicalize(a) === canonicalize(b)
const absolute = value => typeof value === 'string' && value.startsWith('/') && !/[\\\0:]/u.test(value)
const canonicalPath = value => absolute(value) && value.slice(1).split('/').every(part => part && part !== '.' && part !== '..')
const keys = (value, required, optional = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid()
}

export function readAlignedNewInspectionProgram() {
  return fs.readFileSync(new URL('../dev015-aligned-new-loader-inspection.cjs', import.meta.url), 'utf8')
}

export function gccAlignedNewOccurrenceMatches(row) {
  const value = row?.vulnerability
  return row?.kind === 'VULNERABILITY' && row.noteName === 'projects/goog-vulnz/notes/' + GCC_ALIGNED_NEW_CVE
    && value?.shortDescription === GCC_ALIGNED_NEW_CVE && (value.effectiveSeverity ?? value.severity) === 'HIGH'
    && Array.isArray(value.packageIssue) && value.packageIssue.length > 0
    && value.packageIssue.every(issue => issue.affectedPackage === 'gcc-14' && issue.packageType === 'OS'
      && issue.affectedCpeUri === 'cpe:/o:debian:debian_linux:13' && issue.affectedVersion?.fullName === '14.2.0-19')
}

export function alignedNewLoaderClosureFingerprint(imageConfig, loader) {
  keys(imageConfig, ['user', 'workingDirectory', 'entrypoint', 'command', 'environmentNames', 'environmentValuesRedacted', 'nonemptyLoaderControlsAbsent', 'volumePaths'], ['evidenceScope'])
  if (imageConfig.user !== '65532:65532' || imageConfig.workingDirectory !== '/app'
    || !equal(imageConfig.entrypoint, ['/nodejs/bin/node']) || !equal(imageConfig.command, ['server.js'])
    || imageConfig.environmentValuesRedacted !== true || imageConfig.nonemptyLoaderControlsAbsent !== true
    || !equal(imageConfig.volumePaths, []) || !Array.isArray(imageConfig.environmentNames)
    || new Set(imageConfig.environmentNames).size !== imageConfig.environmentNames.length
    || imageConfig.environmentNames.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || unsafeEnvironment(name))) invalid()
  keys(loader, ['platform', 'arch', 'uid', 'gid', 'node', 'vdsoMapCount', 'controls', 'aliases', 'rows', 'sqliteProbe', 'generatedPngSha256'])
  if (loader.platform !== 'linux' || loader.arch !== 'x64' || loader.uid !== 65532 || loader.gid !== 65532
    || !/^24\.[0-9]+\.[0-9]+$/u.test(loader.node) || loader.vdsoMapCount !== 1
    || loader.sqliteProbe !== 'IN_MEMORY_SELECT_1' || !H64.test(loader.generatedPngSha256 ?? '')
    || !Array.isArray(loader.rows) || !Array.isArray(loader.controls) || !Array.isArray(loader.aliases)) invalid()
  const rows = [], physical = new Set(), logical = new Set()
  let vdso = 0
  for (const row of loader.rows) {
    if (logical.has(row.path)) invalid()
    logical.add(row.path)
    if (row.path === 'linux-vdso.so.1') {
      keys(row, ['path', 'kind', 'fileBacked', 'sha256'])
      if (row.kind !== 'kernel-vdso' || row.fileBacked !== false || row.sha256 !== null) invalid()
      vdso += 1
      continue
    }
    keys(row, ['path', 'physicalPath', 'fileBacked', 'bytes', 'sha256'])
    // Raw loader aliases may contain ../..; the probe resolves the original
    // string with realpath before hashing. Only the physical path is canonical.
    if (!absolute(row.path) || !canonicalPath(row.physicalPath) || row.fileBacked !== true
      || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || !H64.test(row.sha256 ?? '')
      || physical.has(row.physicalPath) || /musl/iu.test(row.physicalPath)) invalid()
    physical.add(row.physicalPath)
    rows.push({ path: row.physicalPath, bytes: row.bytes, sha256: row.sha256 })
  }
  if (vdso !== 1 || !rows.some(row => row.path === LIB && row.sha256 === LIB_HASH)
    || !rows.some(row => /^\/app\/node_modules\/@img\/sharp-linux-x64\/lib\/sharp-linux-x64(?:-[0-9]+\.[0-9]+\.[0-9]+)?\.node$/u.test(row.path))
    || !rows.some(row => /^\/app\/node_modules\/@img\/sharp-libvips-linux-x64\/lib\/libvips-cpp\.so\.[0-9.]+$/u.test(row.path))
    || !rows.some(row => row.path === '/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node')) invalid()
  const controls = new Map()
  const requiredControls = ['/etc/ld.so.preload', '/etc/ld.so.conf', '/etc/ld.so.cache']
  for (const row of loader.controls) {
    keys(row, ['path', 'exists', 'bytes', 'sha256'])
    if (!canonicalPath(row.path) || (!requiredControls.includes(row.path) && !/^\/etc\/ld\.so\.conf\.d\/[^/]+$/u.test(row.path))
      || controls.has(row.path) || typeof row.exists !== 'boolean' || !Number.isSafeInteger(row.bytes) || row.bytes < 0
      || (row.exists ? !H64.test(row.sha256 ?? '') : row.bytes !== 0 || row.sha256 !== null)
      || (row.path === '/etc/ld.so.preload' && row.exists && row.bytes !== 0)) invalid()
    controls.set(row.path, row)
  }
  if (requiredControls.some(name => !controls.has(name))) invalid()
  const aliases = new Map()
  for (const row of loader.aliases) {
    keys(row, ['path', 'target'])
    if (!['/lib/x86_64-linux-gnu/libstdc++.so.6', '/usr/lib/x86_64-linux-gnu/libstdc++.so.6'].includes(row.path)
      || row.target !== 'libstdc++.so.6.0.33' || aliases.has(row.path)) invalid()
    aliases.set(row.path, row)
  }
  if (aliases.size !== 2) invalid()
  const sort = values => [...values].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return sha256(canonicalize({
    imageConfig: { user: imageConfig.user, workingDirectory: imageConfig.workingDirectory, entrypoint: imageConfig.entrypoint,
      command: imageConfig.command, environmentNames: [...imageConfig.environmentNames].sort(), volumePaths: [] },
    platform: loader.platform, arch: loader.arch, uid: loader.uid, gid: loader.gid, node: loader.node,
    controls: sort(controls.values()), aliases: sort(aliases.values()), rows: sort(rows), vdsoMapCount: 1,
  }))
}

const pins = ['ownerApplicationId', 'repository', 'projectId', 'region', 'artifactUri', 'releaseBucket']
export function readAlignedNewApplicabilityPolicy(profile) {
  const policy = JSON.parse(fs.readFileSync(new URL('../../config/release/dev015-gcc-aligned-new-applicability.json', import.meta.url), 'utf8'))
  keys(policy, ['schemaVersion', 'cve', 'state', 'justification', ...pins, 'nativeCodeFingerprint', 'loaderClosureFingerprint', 'investigatedSourceRevision', 'investigatedArtifactDigest', 'assessmentRef'])
  const expected = [profile.application.id, profile.application.repository, profile.target.projectId, profile.target.region, profile.artifact.uri, profile.artifact.releaseBucket]
  if (policy.schemaVersion !== 'jenfu.dev015.gcc-aligned-new-applicability-policy.v1' || policy.cve !== GCC_ALIGNED_NEW_CVE
    || policy.state !== 'NOT_AFFECTED' || policy.justification !== 'VULNERABLE_CODE_NOT_PRESENT'
    || pins.some((key, index) => policy[key] !== expected[index]) || policy.ownerApplicationId !== 'ai-pdm'
    || !H40.test(policy.investigatedSourceRevision ?? '') || !H64.test(policy.nativeCodeFingerprint ?? '')
    || !H64.test(policy.loaderClosureFingerprint ?? '')
    || !policy.investigatedArtifactDigest?.startsWith(policy.artifactUri + '@sha256:')
    || !H64.test(policy.investigatedArtifactDigest.split('@sha256:')[1] ?? '')) invalid()
  keys(policy.assessmentRef, ['uri', 'sha256'])
  const prefix = 'gs://' + policy.releaseBucket + '/receipts/releases/DEV015-GCC-ALIGNED-NEW-APPLICABILITY-'
  if (!H64.test(policy.assessmentRef.sha256 ?? '') || !policy.assessmentRef.uri?.startsWith(prefix)
    || !/^[A-Za-z0-9-]+\/ai-pdm\/assessment-[a-f0-9]{64}\.json$/u.test(policy.assessmentRef.uri.slice(prefix.length))
    || !policy.assessmentRef.uri.endsWith('/assessment-' + policy.assessmentRef.sha256 + '.json')) invalid()
  return policy
}

export function assertAlignedNewApplicabilityAssessment(policy, assessment, inventory, imageConfig, loader) {
  keys(assessment, ['schemaVersion', 'cve', 'state', 'justification', ...pins, 'sourceRevision', 'artifactDigest',
    'nativeCodeFingerprint', 'loaderClosureFingerprint', 'loaderClosureComplete', 'baselineEvidence', 'rationale', 'evidence', 'limits', 'upstreamSources'])
  if (assessment.schemaVersion !== 'jenfu.dev015.gcc-aligned-new-applicability-assessment.v1'
    || assessment.cve !== GCC_ALIGNED_NEW_CVE || assessment.cve !== policy.cve || pins.some(key => assessment[key] !== policy[key])
    || assessment.state !== 'NOT_AFFECTED' || assessment.justification !== 'VULNERABLE_CODE_NOT_PRESENT'
    || assessment.sourceRevision !== policy.investigatedSourceRevision || assessment.artifactDigest !== policy.investigatedArtifactDigest
    || assessment.nativeCodeFingerprint !== policy.nativeCodeFingerprint || assessment.loaderClosureFingerprint !== policy.loaderClosureFingerprint
    || assessment.loaderClosureComplete !== true || nativeCodeFingerprint(inventory) !== policy.nativeCodeFingerprint
    || alignedNewLoaderClosureFingerprint(imageConfig, loader) !== policy.loaderClosureFingerprint) invalid()
  keys(assessment.baselineEvidence, ['R65A', 'R66b', 'R66c'])
  const buildIds = new Set()
  for (const [name, row] of Object.entries(assessment.baselineEvidence)) {
    keys(row, ['buildId', 'status', 'logSha256', 'readbackSha256'], name === 'R66b' ? ['providerStatus', 'failure'] : [])
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(row.buildId ?? '')
      || buildIds.has(row.buildId) || !H64.test(row.logSha256 ?? '') || !H64.test(row.readbackSha256 ?? '')
      || row.status !== (name === 'R66b' ? 'FAILURE_PARTIAL' : 'SUCCESS')
      || (name === 'R66b' && (row.providerStatus !== 'FAILURE' || typeof row.failure !== 'string' || !row.failure))) invalid()
    buildIds.add(row.buildId)
  }
  const evidence = assessment.evidence
  keys(evidence, ['definedAlignedImplementations', 'dynamicAlignedCallers', 'imageConfig', 'loader', 'fullElfCount', 'operatorNewProbe', 'alignedOperatorNewDisassembly'])
  if (evidence.fullElfCount !== 570
    || alignedNewLoaderClosureFingerprint(evidence.imageConfig, evidence.loader) !== policy.loaderClosureFingerprint
    || !equal(evidence.operatorNewProbe, { throwingRejections: 9, nothrowRejections: 9, validAllocations: 3, result: 'PASS' })
    || !equal(evidence.alignedOperatorNewDisassembly, { symbol: '_ZnwmSt11align_val_t', ownerPath: LIB, ownerSha256: LIB_HASH, posixMemalignCall: true })
    || !Array.isArray(evidence.definedAlignedImplementations) || !evidence.definedAlignedImplementations.some(row => row.path === LIB && row.sha256 === LIB_HASH)
    || !Array.isArray(evidence.dynamicAlignedCallers) || !evidence.dynamicAlignedCallers.some(row => row.path === '/nodejs/bin/node')
    || typeof assessment.rationale !== 'string' || !assessment.rationale
    || !Array.isArray(assessment.limits) || !assessment.limits.length || assessment.limits.some(x => typeof x !== 'string' || !x)
    || !Array.isArray(assessment.upstreamSources) || !assessment.upstreamSources.includes('https://github.com/gcc-mirror/gcc/commit/59d235ffa5a69231eb42e5290d52dc8c90d28b7a')) invalid()
}
