import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalSandboxError, readLocalSandboxConfig } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PRIMARY_DATA_DIRECTORY = path.join(PROJECT_ROOT, 'data')
const PRIMARY_REPOSITORY_DIRECTORY = path.join(PRIMARY_DATA_DIRECTORY, 'repository')
const GENERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FINGERPRINT = /^[a-f0-9]{64}$/

function invalidTarget() {
  throw new LocalSandboxError('local_reset_target_invalid', 409)
}

function normalizeAbsoluteDirectory(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.includes('\0')) {
    invalidTarget()
  }

  // Reject traversal before path.resolve erases its evidence. Both separators
  // are recognized because Windows paths can arrive with either spelling.
  const slashNormalized = value.replaceAll('\\', '/')
  if (slashNormalized.split('/').includes('..')) invalidTarget()
  if (slashNormalized.startsWith('//')) invalidTarget()
  if (!path.isAbsolute(value)) invalidTarget()

  const resolved = path.resolve(value)
  const { root } = path.parse(resolved)
  if (!root || samePath(resolved, root)) invalidTarget()
  return resolved
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function assertNotPrimaryPath(candidate, { root = false } = {}) {
  const protectedPaths = [PROJECT_ROOT, PRIMARY_DATA_DIRECTORY, PRIMARY_REPOSITORY_DIRECTORY]
  if (protectedPaths.some((protectedPath) => samePath(candidate, protectedPath))) invalidTarget()
  if ([PRIMARY_DATA_DIRECTORY, PRIMARY_REPOSITORY_DIRECTORY].some((protectedPath) => isWithin(protectedPath, candidate))) {
    invalidTarget()
  }
  // A sandbox root may sit inside this worktree, but may not contain the
  // worktree itself (for example, a drive root or its parent directory).
  if (root && isWithin(candidate, PROJECT_ROOT)) invalidTarget()
}

async function resolveDirectoryWithoutLinks(candidate, expectedRoot) {
  const parsed = path.parse(candidate)
  const relative = path.relative(parsed.root, candidate)
  const segments = relative.split(path.sep).filter(Boolean)
  let current = parsed.root
  let missing = false

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index])
    if (missing) continue

    let stat
    try {
      stat = await lstat(current)
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        missing = true
        continue
      }
      invalidTarget()
    }

    // lstat sees Windows junctions as symbolic links. Reject every existing
    // reparse/link boundary rather than relying on a lexical path prefix.
    if (stat.isSymbolicLink() || !stat.isDirectory()) invalidTarget()

    let resolved
    try {
      resolved = await realpath(current)
    } catch {
      invalidTarget()
    }
    if (expectedRoot && isWithin(expectedRoot, current) && !isWithin(expectedRoot, resolved)) invalidTarget()
    current = resolved
  }

  if (expectedRoot && !isWithin(expectedRoot, current)) invalidTarget()
  return current
}

/**
 * Admit one reset target after checking the local-only gate, immutable target
 * identity, and filesystem boundaries. This function has no write side effects.
 */
export async function validateLocalSandboxResetTarget({
  environment,
  sandboxRoot,
  dataDirectory,
  repositoryDirectory,
  sandboxId,
  databaseName,
  expectedTargetFingerprint,
  observedTargetFingerprint,
  expectedGeneration,
  generation,
}) {
  let config
  try {
    config = readLocalSandboxConfig(environment, 'ai-pdm')
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    invalidTarget()
  }

  if (typeof environment?.JENFU_LOCAL_SANDBOX_ROOT !== 'string' ||
    typeof environment?.PDM_DATA_DIR !== 'string' ||
    typeof environment?.PDM_REPOSITORY_DIR !== 'string') invalidTarget()

  if (typeof sandboxId !== 'string' || sandboxId !== config.sandboxId ||
    typeof databaseName !== 'string' || databaseName !== config.databaseName ||
    !GENERATION.test(expectedGeneration ?? '') || generation !== expectedGeneration || !GENERATION.test(generation ?? '') ||
    !FINGERPRINT.test(expectedTargetFingerprint ?? '') ||
    observedTargetFingerprint !== expectedTargetFingerprint) invalidTarget()

  const rootPath = normalizeAbsoluteDirectory(sandboxRoot)
  const dataPath = normalizeAbsoluteDirectory(dataDirectory)
  const repositoryPath = normalizeAbsoluteDirectory(repositoryDirectory)
  const configuredRootPath = normalizeAbsoluteDirectory(environment.JENFU_LOCAL_SANDBOX_ROOT)
  const configuredDataPath = normalizeAbsoluteDirectory(environment.PDM_DATA_DIR)
  const configuredRepositoryPath = normalizeAbsoluteDirectory(environment.PDM_REPOSITORY_DIR)

  if (!samePath(rootPath, configuredRootPath) || !samePath(dataPath, configuredDataPath) ||
    !samePath(repositoryPath, configuredRepositoryPath)) invalidTarget()

  assertNotPrimaryPath(rootPath, { root: true })
  assertNotPrimaryPath(dataPath)
  assertNotPrimaryPath(repositoryPath)

  let resolvedRoot
  try {
    resolvedRoot = await resolveDirectoryWithoutLinks(rootPath)
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    invalidTarget()
  }
  if (!isWithin(resolvedRoot, dataPath) || !isWithin(resolvedRoot, repositoryPath) ||
    samePath(path.dirname(dataPath), path.dirname(repositoryPath)) === false ||
    !samePath(path.dirname(dataPath), resolvedRoot) || !samePath(path.dirname(repositoryPath), resolvedRoot) ||
    samePath(dataPath, repositoryPath)) invalidTarget()

  let resolvedData
  let resolvedRepository
  try {
    resolvedData = await resolveDirectoryWithoutLinks(dataPath, resolvedRoot)
    resolvedRepository = await resolveDirectoryWithoutLinks(repositoryPath, resolvedRoot)
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    invalidTarget()
  }

  if (samePath(resolvedData, resolvedRepository) ||
    !isWithin(resolvedRoot, resolvedData) || !isWithin(resolvedRoot, resolvedRepository)) invalidTarget()

  return Object.freeze({
    contractVersion: config.contractVersion,
    applicationId: config.applicationId,
    sandboxId: config.sandboxId,
    databaseName: config.databaseName,
    origin: config.origin,
    generation,
    targetFingerprint: observedTargetFingerprint,
    sandboxRoot: resolvedRoot,
    dataDirectory: resolvedData,
    repositoryDirectory: resolvedRepository,
  })
}
