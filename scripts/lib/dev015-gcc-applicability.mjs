import fs from 'node:fs'
import path from 'node:path'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const GCC_PBDS_CVE = 'CVE-2026-102010'
export function readNativeInventoryProgram() {
  return fs.readFileSync(new URL('../dev015-native-image-inventory.cjs', import.meta.url), 'utf8')
}

function invalid() {
  const error = new Error('GCC_APPLICABILITY_EVIDENCE_INVALID')
  error.code = 'GCC_APPLICABILITY_EVIDENCE_INVALID'
  throw error
}

// This is a fingerprint of compiled inputs, not a claim based on absent symbols.
// The reviewed policy binds it to the full source/build investigation.
export function nativeCodeFingerprint(inventory) {
  if (inventory?.complete !== true || inventory.platform !== 'linux' || inventory.arch !== 'x64'
    || !((inventory.uid === 65532 && inventory.gid === 65532) || (inventory.uid === 0 && inventory.gid === 0 && inventory.runtimeUser === '65532:65532')) || !/^24\./u.test(inventory.node ?? '')
    || !Array.isArray(inventory.elf) || !inventory.elf.length || !Array.isArray(inventory.wasm)
    || !Array.isArray(inventory.headers) || inventory.headers.length) invalid()
  const files = new Map()
  for (const entry of [...inventory.elf, ...inventory.wasm]) {
    if (!entry.path?.startsWith('/') || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
      || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !Array.isArray(entry.pbdsMarkers) || entry.pbdsMarkers.length) invalid()
    const path = entry.path.replace(/^\/(lib|bin|sbin)\//u, '/usr/$1/')
    const value = { path, bytes: entry.bytes, sha256: entry.sha256 }
    if (files.has(path) && canonicalize(files.get(path)) !== canonicalize(value)) invalid()
    files.set(path, value)
  }
  // Directory aliases and loader links do not add compiled code. Every link must
  // resolve to a fully hashed object; unresolved/outside-image targets fail closed.
  for (const entry of inventory.symlinks ?? []) {
    if (!entry.path?.startsWith('/') || typeof entry.target !== 'string' || !entry.target) invalid()
    const target = path.posix.resolve(path.posix.dirname(entry.path), entry.target).replace(/^\/(lib|bin|sbin)\//u, '/usr/$1/')
    if (!files.has(target)) invalid()
  }
  return sha256(canonicalize({ node: inventory.node, elfAndWasm: [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) }))
}

export function gccPbdsOccurrenceMatches(occurrence) {
  const v = occurrence?.vulnerability
  return occurrence?.kind === 'VULNERABILITY'
    && occurrence.noteName === `projects/goog-vulnz/notes/${GCC_PBDS_CVE}`
    && (v?.effectiveSeverity ?? v?.severity) === 'HIGH'
    && v?.shortDescription === GCC_PBDS_CVE
    && v.packageIssue?.length > 0
    && v.packageIssue.every((issue) => issue.affectedPackage === 'gcc-14'
      && issue.packageType === 'OS' && issue.affectedCpeUri === 'cpe:/o:debian:debian_linux:13'
      && issue.affectedVersion?.fullName === '14.2.0-19')
}

export function readGccApplicabilityPolicy(profile) {
  const policy = JSON.parse(fs.readFileSync(new URL('../../config/release/dev015-gcc-pbds-applicability.json', import.meta.url), 'utf8'))
  if (policy.schemaVersion !== 'jenfu.dev015.gcc-pbds-applicability-policy.v1'
    || policy.cve !== GCC_PBDS_CVE || policy.state !== 'NOT_AFFECTED' || policy.justification !== 'VULNERABLE_CODE_NOT_PRESENT'
    || policy.ownerApplicationId !== profile.application.id || policy.repository !== profile.application.repository
    || policy.projectId !== profile.target.projectId || policy.region !== profile.target.region
    || policy.artifactUri !== profile.artifact.uri || policy.releaseBucket !== profile.artifact.releaseBucket
    || !/^[a-f0-9]{64}$/u.test(policy.nativeCodeFingerprint ?? '')
    || !/^[a-f0-9]{64}$/u.test(policy.assessmentRef?.sha256 ?? '')
    || !policy.assessmentRef?.uri?.startsWith(`gs://${profile.artifact.releaseBucket}/receipts/releases/DEV015-GCC-APPLICABILITY-`)) invalid()
  return policy
}

export function assertGccApplicabilityAssessment(policy, assessment, inventory) {
  if (assessment?.schemaVersion !== 'jenfu.dev015.gcc-applicability-assessment.v1'
    || assessment.cve !== policy.cve || assessment.ownerApplicationId !== policy.ownerApplicationId
    || assessment.state !== 'NOT_AFFECTED' || assessment.justification !== policy.justification
    || assessment.nativeCodeFingerprint !== policy.nativeCodeFingerprint
    || assessment.artifactDigest !== policy.investigatedArtifactDigest
    || assessment.sourceRevision !== policy.investigatedSourceRevision
    || !assessment.imageInspectionBuildId || !assessment.sourceInspectionBuildId || !assessment.nativeClosureBuildId
    || assessment.sourceClosureComplete !== true
    || nativeCodeFingerprint(inventory) !== policy.nativeCodeFingerprint) invalid()
}
