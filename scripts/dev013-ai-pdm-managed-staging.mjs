import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDev013AiPdmStagingProfile,
  buildActivationPlan,
  buildOwnerReceipt,
  buildRevisionPlan,
  buildRollbackPlan,
  buildTargetBootstrapReceipt,
  createSourceFreeze,
  hardJoinActivation,
  hardJoinRevision,
  sha256,
} from './lib/dev013-ai-pdm-managed-staging.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = path.join(root, 'config/release/dev013-ai-pdm-managed-staging.json')

function fail(message) { throw new Error(message) }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function option(name, required = true) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || !process.argv[index + 1]) {
    if (required) fail(`Missing --${name}`)
    return null
  }
  return path.resolve(process.cwd(), process.argv[index + 1])
}
function scalarOption(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || !process.argv[index + 1]) fail(`Missing --${name}`)
  return process.argv[index + 1]
}
function git(...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() }
function gitBytes(...args) { return execFileSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }) }
function emit(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`) }

function loadAuthority() {
  const profile = readJson(profilePath)
  const directManifestPath = path.resolve(root, profile.authorities.platformManifestPath)
  const commonGitDir = git('rev-parse', '--path-format=absolute', '--git-common-dir')
  const primaryRoot = path.dirname(commonGitDir)
  const manifestPath = fs.existsSync(directManifestPath) ? directManifestPath : path.resolve(primaryRoot, profile.authorities.platformManifestPath)
  const lockPath = path.resolve(root, profile.authorities.handoffContractLockPath)
  const manifestBytes = fs.readFileSync(manifestPath)
  if (sha256(manifestBytes) !== profile.authorities.platformManifestSha256) fail('DEV013_AIPDM_PLATFORM_MANIFEST_FILE_HASH_INVALID')
  const platformManifest = JSON.parse(manifestBytes.toString('utf8'))
  const contractLock = readJson(lockPath)
  assertDev013AiPdmStagingProfile(profile, platformManifest, contractLock)
  return { profile, platformManifest, contractLock, manifestPath, lockPath }
}

function sourceFreeze(profile) {
  const sourceRevision = git('rev-parse', 'HEAD')
  const sourceTree = git('rev-parse', 'HEAD^{tree}')
  const currentBranch = git('branch', '--show-current')
  const branch = currentBranch || profile.application.allowedBranches.find((candidate) => {
    try { return git('rev-parse', `refs/heads/${candidate}`) === sourceRevision } catch { return false }
  })
  const clean = git('status', '--porcelain=v1', '--untracked-files=all') === ''
  const sourceIdentityBytes = gitBytes('ls-tree', '-r', '-z', '--full-tree', sourceRevision)
  return createSourceFreeze({ profile, branch, sourceRevision, sourceTree, clean, sourceIdentityBytes })
}

function jsonOption(name) { return readJson(option(name)) }

const command = process.argv[2] ?? 'profile-check'
const { profile, platformManifest } = loadAuthority()

if (command === 'profile-check') {
  emit({ status: 'PASS', profileContractSha256: profile.contractSha256, platformManifestSha256: profile.authorities.platformManifestSha256, handoffContractSha256: profile.authorities.handoffContractSha256, target: profile.target, boundaries: profile.boundaries })
} else if (command === 'source-freeze') {
  emit(sourceFreeze(profile))
} else if (command === 'bootstrap-receipt') {
  emit(buildTargetBootstrapReceipt({ profile, targetService: jsonOption('target-service'), targetIdentity: jsonOption('target-identity') }))
} else if (command === 'plan') {
  emit(buildRevisionPlan({
    profile,
    sourceFreeze: jsonOption('source-freeze'),
    platformService: jsonOption('platform-service'),
    targetService: jsonOption('target-service'),
    targetIdentity: jsonOption('target-identity'),
    artifactDigest: scalarOption('artifact-digest'),
    mode: scalarOption('mode'),
    rollbackFloor: option('rollback-floor', false) ? jsonOption('rollback-floor') : null,
  }))
} else if (command === 'hard-join') {
  emit(hardJoinRevision({ profile, plan: jsonOption('plan'), platformService: jsonOption('platform-service'), targetService: jsonOption('target-service'), targetIdentity: jsonOption('target-identity') }))
} else if (command === 'activation-plan') {
  emit(buildActivationPlan({ profile, enabledRevisionReceipt: jsonOption('enabled-receipt'), currentService: jsonOption('target-service') }))
} else if (command === 'activation-hard-join') {
  emit(hardJoinActivation({ profile, activationPlan: jsonOption('activation-plan'), platformService: jsonOption('platform-service'), targetService: jsonOption('target-service'), targetIdentity: jsonOption('target-identity') }))
} else if (command === 'rollback-plan') {
  emit(buildRollbackPlan({ profile, enabledReceipt: jsonOption('enabled-receipt'), rollbackFloor: jsonOption('rollback-floor'), currentService: jsonOption('target-service') }))
} else if (command === 'owner-receipt') {
  emit(buildOwnerReceipt({ profile, enabledReceipt: jsonOption('enabled-receipt') }))
} else if (command === 'manifest-summary') {
  emit({ schemaVersion: platformManifest.schemaVersion, contractStatus: platformManifest.contractStatus, application: platformManifest.applications['ai-pdm'] })
} else {
  fail(`Unknown command: ${command}`)
}
