import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { assertRuntimeConfig, buildRuntimeConfig, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertPreparePrerequisites } from './dev012-owner-stage-executor.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const STAGES = new Set(['source-freeze', 'runtime-config', 'release-intent'])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function exactRef(value, profile) {
  if (!value || Object.keys(value).sort().join(',') !== 'sha256,uri' || !H64.test(value.sha256 ?? '')) fail('PREREQUISITE_REF_INVALID')
  const prefix = `gs://${profile.artifact.releaseBucket}/receipts/`
  if (!value.uri?.startsWith(prefix) || value.uri.includes('..')) fail('PREREQUISITE_REF_INVALID')
  return value
}

function runGit(root, args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0) fail('SOURCE_GIT_READ_FAILED', args.join(' '))
  return result.stdout
}

function repositorySlug(remote) {
  const match = /(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/iu.exec(remote.trim())
  return match?.[1] ?? null
}

export function readGitAuthority(root, profile) {
  const sourceRevision = String(runGit(root, ['rev-parse', 'HEAD'])).trim()
  const sourceTree = String(runGit(root, ['rev-parse', 'HEAD^{tree}'])).trim()
  const branch = String(runGit(root, ['branch', '--show-current'])).trim()
  const status = String(runGit(root, ['status', '--porcelain=v1', '--untracked-files=all'])).trim()
  const remote = String(runGit(root, ['remote', 'get-url', 'origin'])).trim()
  const remoteRows = String(runGit(root, ['ls-remote', '--heads', 'origin', `refs/heads/${profile.application.branch}`])).trim().split(/\s+/u)
  const remoteRevision = remoteRows[0] ?? ''
  if (!H40.test(sourceRevision) || !H40.test(sourceTree) || branch !== profile.application.branch || status !== '' || repositorySlug(remote)?.toLowerCase() !== profile.application.repository.toLowerCase() || remoteRevision !== sourceRevision) fail('SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE')
  return { sourceRevision, sourceTree, branch, remoteRevision, clean: true }
}

export function buildSourceFreeze({ profile, releaseId, observedAt, git, sourceArchiveBytes, migrationBundle }) {
  if (!RELEASE_ID.test(releaseId ?? '') || !Number.isFinite(Date.parse(observedAt)) || !git?.clean || git.branch !== profile.application.branch || git.remoteRevision !== git.sourceRevision || !H40.test(git.sourceRevision ?? '') || !H40.test(git.sourceTree ?? '') || !Buffer.isBuffer(sourceArchiveBytes) || sourceArchiveBytes.length === 0 || !H64.test(migrationBundle?.bundle?.manifestSha256 ?? '')) fail('SOURCE_FREEZE_INPUT_INVALID')
  return {
    schemaVersion: 'jenfu.dev012.owner-source-lock.v1',
    ownerApplicationId: profile.application.id,
    repository: profile.application.repository,
    branch: git.branch,
    releaseId,
    sourceRevision: git.sourceRevision,
    sourceTree: git.sourceTree,
    sourceSha256: sha256(sourceArchiveBytes),
    migrationManifestSha256: migrationBundle.bundle.manifestSha256,
    clean: true,
    remoteRef: `refs/heads/${profile.application.branch}`,
    remoteRevision: git.remoteRevision,
    status: 'SOURCE_FROZEN',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
    observedAt,
  }
}

export function buildRuntimeConfigReceipt({ profile, releaseId, sourceLock, plainEnvironment, secretVersions, observedAt }) {
  if (!RELEASE_ID.test(releaseId ?? '') || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id || sourceLock?.status !== 'SOURCE_FROZEN' || sourceLock?.releaseAuthority !== true || !sourceLock.clean || !Number.isFinite(Date.parse(observedAt))) fail('SOURCE_LOCK_NOT_RELEASE_AUTHORITY')
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment, secretVersions })
  assertRuntimeConfig(profile, runtimeConfig)
  return {
    schemaVersion: 'jenfu.dev012.owner-runtime-config-receipt.v1',
    ownerApplicationId: profile.application.id,
    projectId: profile.target.projectId,
    releaseId,
    sourceRevision: sourceLock.sourceRevision,
    runtimeConfig,
    status: 'VERIFIED',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
    observedAt,
  }
}

export function buildReleaseIntent({ profile, releaseId, input, sourceLock, prerequisiteValues, validateIntent }) {
  if (!RELEASE_ID.test(releaseId ?? '') || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id) fail('RELEASE_INTENT_INPUT_INVALID')
  const intent = {
    schemaVersion: profile.schemas.releaseIntent,
    ownerApplicationId: profile.application.id,
    releaseId,
    sourceRevision: sourceLock.sourceRevision,
    sourceSha256: sourceLock.sourceSha256,
    sourceLockRef: exactRef(input.sourceLockRef, profile),
    authorizationPolicyRef: exactRef(input.authorizationPolicyRef, profile),
    readinessReceiptRef: exactRef(input.readinessReceiptRef, profile),
    foundationReceiptRef: exactRef(input.foundationReceiptRef, profile),
    infraReceiptRef: exactRef(input.infraReceiptRef, profile),
    runtimeConfigRef: exactRef(input.runtimeConfigRef, profile),
    migrationManifestSha256: sourceLock.migrationManifestSha256,
    previousRevision: input.previousRevision,
    deadlineAt: input.deadlineAt,
  }
  if (!intent.previousRevision || intent.previousRevision === 'latest' || !Number.isFinite(Date.parse(intent.deadlineAt)) || Date.parse(intent.deadlineAt) <= Date.now()) fail('RELEASE_INTENT_INPUT_INVALID')
  for (const [name, value] of Object.entries(prerequisiteValues)) {
    if (value?.ownerApplicationId && value.ownerApplicationId !== profile.application.id) fail('PREREQUISITE_OWNER_MISMATCH', name)
    if (name !== 'foundation' && value?.sourceRevision && value.sourceRevision !== sourceLock.sourceRevision) fail('PREREQUISITE_SOURCE_MISMATCH', name)
  }
  assertPreparePrerequisites({ intent, profile, values: prerequisiteValues })
  validateIntent(intent, profile)
  return intent
}

export function parsePrerequisiteProducerArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--stage', '--release-id', '--input'].includes(key) || !value || values[key]) fail('INVALID_ARGUMENTS')
    values[key] = value
  }
  if (!STAGES.has(values['--stage']) || !RELEASE_ID.test(values['--release-id'] ?? '') || (values['--stage'] === 'source-freeze' ? values['--input'] != null : !values['--input'])) fail('INVALID_ARGUMENTS')
  return { stage: values['--stage'], releaseId: values['--release-id'], inputPath: values['--input'] ?? null }
}

export function resolveOwnerInputPath(root, inputPath) {
  if (typeof inputPath !== 'string' || path.isAbsolute(inputPath)) fail('INPUT_PATH_OUT_OF_SCOPE')
  const normalized = inputPath.replace(/\\\\/gu, '/').replace(/^\.\//u, '')
  if (!normalized.startsWith('output/dev-012/inputs/') || normalized.includes('/../') || normalized.endsWith('/..')) fail('INPUT_PATH_OUT_OF_SCOPE')
  const resolvedRoot = path.resolve(root)
  const candidate = path.resolve(resolvedRoot, ...normalized.split('/'))
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) fail('INPUT_PATH_OUT_OF_SCOPE')
  return candidate
}

async function readRef(transport, ref, profile) {
  exactRef(ref, profile)
  return (await transport.readJson(ref, profile.artifact.releaseBucket, ['receipts'])).value
}

export async function executePrerequisiteProducer({ stage, releaseId, input, profile, root, transport, createSourceArchive, buildMigrationBundle, validateIntent, observedAt = new Date().toISOString(), gitReader = readGitAuthority }) {
  const uri = (name) => `gs://${profile.artifact.releaseBucket}/receipts/releases/${releaseId}/${name}.json`
  if (stage === 'source-freeze') {
    const git = gitReader(root, profile)
    const [sourceArchiveBytes, migrationBundle] = await Promise.all([createSourceArchive(git.sourceRevision), buildMigrationBundle(git.sourceRevision)])
    const value = buildSourceFreeze({ profile, releaseId, observedAt, git, sourceArchiveBytes, migrationBundle })
    return transport.putJson(uri('source-lock'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  if (stage === 'runtime-config') {
    const sourceLock = await readRef(transport, input.sourceLockRef, profile)
    const value = buildRuntimeConfigReceipt({ profile, releaseId, sourceLock, plainEnvironment: input.plainEnvironment, secretVersions: input.secretVersions, observedAt })
    return transport.putJson(uri('runtime-config'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  if (stage === 'release-intent') {
    const fields = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
    const rows = await Promise.all(Object.entries(fields).map(async ([name, field]) => [name, await readRef(transport, input[field], profile)]))
    const prerequisiteValues = Object.fromEntries(rows)
    const value = buildReleaseIntent({ profile, releaseId, input, sourceLock: prerequisiteValues.sourceLock, prerequisiteValues, validateIntent })
    return transport.putJson(uri('release-intent'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  fail('STAGE_DENIED')
}

export function sourceFreezeFingerprint(value) {
  return sha256(canonicalize(value))
}
