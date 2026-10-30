import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateLocalSandboxResetTarget } from '../src/lib/local-sandbox-reset-target.mjs'

const SANDBOX_ID = 'dev126-test-sandbox'
const DATABASE_NAME = 'jenfu_local_dev126_test_sandbox'
const GENERATION = '00000000-0000-4000-8000-000000000001'
const FINGERPRINT = 'a'.repeat(64)

let tempRoot
let sandboxRoot
let dataDirectory
let repositoryDirectory
let outsideDirectory
let environment

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aipdm-dev126-reset-'))
  sandboxRoot = path.join(tempRoot, 'sandbox')
  dataDirectory = path.join(sandboxRoot, 'data')
  repositoryDirectory = path.join(sandboxRoot, 'repository')
  outsideDirectory = path.join(tempRoot, 'outside')
  await mkdir(sandboxRoot)
  await Promise.all([mkdir(dataDirectory), mkdir(repositoryDirectory), mkdir(outsideDirectory)])
  environment = {
    NODE_ENV: 'development',
    JENFU_LOCAL_SANDBOX_ENABLED: '1',
    JENFU_LOCAL_SANDBOX_ID: SANDBOX_ID,
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://127.0.0.1:12020',
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://localhost:12000',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: `postgresql://local_runtime:fake_local_password@127.0.0.1:5432/${DATABASE_NAME}`,
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_runtime',
    JENFU_LOCAL_SANDBOX_ROOT: sandboxRoot,
    PDM_DATA_DIR: dataDirectory,
    PDM_REPOSITORY_DIR: repositoryDirectory,
  }
})

after(async () => {
  if (!tempRoot) return
  const resolvedTemp = await realpath(tempRoot)
  const resolvedOsTemp = await realpath(os.tmpdir())
  assert.equal(path.dirname(resolvedTemp), resolvedOsTemp, 'cleanup stays at the exact mkdtemp child')
  assert.match(path.basename(resolvedTemp), /^aipdm-dev126-reset-/)
  await rm(resolvedTemp, { recursive: true, force: true })
})

function input(overrides = {}) {
  return {
    environment,
    sandboxRoot,
    dataDirectory,
    repositoryDirectory,
    sandboxId: SANDBOX_ID,
    databaseName: DATABASE_NAME,
    expectedTargetFingerprint: FINGERPRINT,
    observedTargetFingerprint: FINGERPRINT,
    expectedGeneration: GENERATION,
    generation: GENERATION,
    ...overrides,
  }
}

async function rejectsTarget(overrides) {
  await assert.rejects(validateLocalSandboxResetTarget(input(overrides)), (error) => {
    assert.equal(error.code, 'local_reset_target_invalid')
    return true
  })
}

test('admits a bound development loopback target and returns canonical paths without credentials', async () => {
  const target = await validateLocalSandboxResetTarget(input())
  assert.equal(target.sandboxId, SANDBOX_ID)
  assert.equal(target.databaseName, DATABASE_NAME)
  assert.equal(target.generation, GENERATION)
  assert.equal(target.targetFingerprint, FINGERPRINT)
  assert.equal(target.sandboxRoot, await realpath(sandboxRoot))
  assert.equal(target.dataDirectory, await realpath(dataDirectory))
  assert.equal(target.repositoryDirectory, await realpath(repositoryDirectory))
  assert.equal(Object.isFrozen(target), true)
  assert.equal('databaseUrl' in target, false)
})

test('rejects a disabled, non-development, or non-loopback sandbox', async () => {
  await assert.rejects(validateLocalSandboxResetTarget(input({
    environment: { ...environment, JENFU_LOCAL_SANDBOX_ENABLED: '0' },
  })), { code: 'local_sandbox_disabled' })
  await assert.rejects(validateLocalSandboxResetTarget(input({
    environment: { ...environment, NODE_ENV: 'production' },
  })), { code: 'local_sandbox_disabled' })
  await assert.rejects(validateLocalSandboxResetTarget(input({
    environment: { ...environment, JENFU_LOCAL_SANDBOX_ORIGIN: 'https://example.invalid' },
  })), { code: 'local_origin_invalid' })
})

test('rejects sandbox/database identity, fingerprint, and generation drift', async () => {
  await rejectsTarget({ sandboxId: 'another-sandbox' })
  await rejectsTarget({ databaseName: 'jenfu_local_another_sandbox' })
  await rejectsTarget({ observedTargetFingerprint: 'b'.repeat(64) })
  await rejectsTarget({ generation: '00000000-0000-4000-8000-000000000002' })
  const malformedUuid = 'a'.repeat(36)
  await rejectsTarget({ generation: malformedUuid, expectedGeneration: malformedUuid })
  const invalidVersionAndVariant = '00000000-0000-0000-0000-000000000001'
  await rejectsTarget({ generation: invalidVersionAndVariant, expectedGeneration: invalidVersionAndVariant })
})

test('rejects the repository primary root, primary data, primary repository, disk root, and traversal', async () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const primaryData = path.join(projectRoot, 'data')
  const primaryRepository = path.join(primaryData, 'repository')
  const diskRoot = path.parse(tempRoot).root

  await rejectsTarget({
    sandboxRoot: projectRoot,
    environment: { ...environment, JENFU_LOCAL_SANDBOX_ROOT: projectRoot },
  })
  await rejectsTarget({
    sandboxRoot: primaryData,
    dataDirectory: path.join(primaryData, 'sandbox-data'),
    repositoryDirectory: path.join(primaryData, 'sandbox-repository'),
    environment: {
      ...environment,
      JENFU_LOCAL_SANDBOX_ROOT: primaryData,
      PDM_DATA_DIR: path.join(primaryData, 'sandbox-data'),
      PDM_REPOSITORY_DIR: path.join(primaryData, 'sandbox-repository'),
    },
  })
  await rejectsTarget({
    sandboxRoot: primaryRepository,
    dataDirectory: path.join(primaryRepository, 'sandbox-data'),
    repositoryDirectory: path.join(primaryRepository, 'sandbox-repository'),
    environment: {
      ...environment,
      JENFU_LOCAL_SANDBOX_ROOT: primaryRepository,
      PDM_DATA_DIR: path.join(primaryRepository, 'sandbox-data'),
      PDM_REPOSITORY_DIR: path.join(primaryRepository, 'sandbox-repository'),
    },
  })
  await rejectsTarget({
    sandboxRoot: diskRoot,
    dataDirectory: path.join(diskRoot, 'reset-data'),
    repositoryDirectory: path.join(diskRoot, 'reset-repository'),
    environment: {
      ...environment,
      JENFU_LOCAL_SANDBOX_ROOT: diskRoot,
      PDM_DATA_DIR: path.join(diskRoot, 'reset-data'),
      PDM_REPOSITORY_DIR: path.join(diskRoot, 'reset-repository'),
    },
  })
  const traversalRoot = `${sandboxRoot}${path.sep}..${path.sep}sandbox`
  await rejectsTarget({
    sandboxRoot: traversalRoot,
    environment: { ...environment, JENFU_LOCAL_SANDBOX_ROOT: traversalRoot },
  })
  await rejectsTarget({
    sandboxRoot: '\\\\server\\share\\sandbox',
    dataDirectory: '\\\\server\\share\\sandbox\\data',
    repositoryDirectory: '\\\\server\\share\\sandbox\\repository',
    environment: {
      ...environment,
      JENFU_LOCAL_SANDBOX_ROOT: '\\\\server\\share\\sandbox',
      PDM_DATA_DIR: '\\\\server\\share\\sandbox\\data',
      PDM_REPOSITORY_DIR: '\\\\server\\share\\sandbox\\repository',
    },
  })
})

test('rejects linked or junctioned directory boundaries that escape the root', async (context) => {
  const linkedRepository = path.join(sandboxRoot, 'repository-link')
  try {
    await symlink(outsideDirectory, linkedRepository, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      context.skip(`junction creation unavailable: ${error.code}`)
      return
    }
    throw error
  }

  await rejectsTarget({
    repositoryDirectory: linkedRepository,
    environment: { ...environment, PDM_REPOSITORY_DIR: linkedRepository },
  })
})
