import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { contractDigest, isLoopbackHost, LocalSandboxError, readLocalSandboxConfig } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import { validateLocalSandboxResetTarget } from '../../src/lib/local-sandbox-reset-target.mjs'

const FORMAT_VERSION = 'dev126.local-reset-baseline.v1'
const NATIVE_SESSION_CONTRACT_VERSION = 'jenfu.ai-pdm-session.v2'
const DATA_DUMP_FILE = 'ai-pdm-core.data.dump'
const MANIFEST_FILE = 'manifest.json'
const CONTROL_ROOT_PARTS = ['control', 'dev126-reset-baselines']
const SCHEMA = 'ai_pdm_core'
const PDM_OWNER_ROLE = 'jenfu_ai_pdm_migrator'
const SCOPED_OWNER_LOGIN_ROLE = /^local_pdm_seed_[a-f0-9]{16}$/u
const HASH = /^[a-f0-9]{64}$/u
const REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/u
const BASELINE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u

const CONTROL_RELATIONS = Object.freeze([
  'local_native_bootstrap_receipts',
  'local_sandbox_principal_session_bindings',
  'local_sandbox_target_metadata',
  'pdm_workbench_state_authority_control',
  'principal_session_records',
  'schema_migrations',
].sort())

const POINTER_SOURCES = Object.freeze([
  'file_assets',
  'file_derivatives',
  'release_packages',
  'submission_files',
].sort())

const SNAPSHOT_SCOPE = Object.freeze({
  schema: SCHEMA,
  ownerRole: PDM_OWNER_ROLE,
  dumpFormat: 'custom',
  dataOnly: true,
  includeAllOwnedTablesExceptControlRelations: true,
  excludedTableData: Object.freeze(CONTROL_RELATIONS.map((name) => `${SCHEMA}.${name}`)),
  pointerSources: POINTER_SOURCES,
  consistency: 'single-exported-postgresql-snapshot',
  excludeOwnerAndPrivileges: true,
})

function fail(code) {
  throw new LocalSandboxError(code, code.endsWith('_unavailable') ? 503 : 409)
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function databaseHostMatches(expectedHost, observedHost) {
  const expected = String(expectedHost).toLowerCase().replace(/^\[|\]$/gu, '')
  const observed = String(observedHost).toLowerCase().replace(/^\[|\]$/gu, '')
  if (expected === 'localhost') return isLoopbackHost(observed)
  return expected === observed
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizedStorageKey(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 ||
    value !== value.trim() || value.includes('\0') || value.includes('\\') || value.startsWith('/') ||
    /^[a-zA-Z]:/u.test(value)) fail('dev126_reset_baseline_repository_invalid')
  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    segments.join('/') !== value) fail('dev126_reset_baseline_repository_invalid')
  return value
}

function canonicalTimestamp(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) fail('dev126_reset_baseline_invalid')
  return parsed.toISOString()
}

function targetFingerprint(target) {
  return contractDigest({
    applicationId: 'ai-pdm',
    sandboxId: target.sandboxId,
    databaseName: target.databaseName,
    sandboxRoot: path.resolve(target.sandboxRoot),
    dataDirectory: path.resolve(target.dataDirectory),
    repositoryDirectory: path.resolve(target.repositoryDirectory),
    generation: target.generation,
    fixtureVersion: target.fixtureVersion,
    fixtureHash: target.fixtureHash,
    nativeSessionContractVersion: target.nativeSessionContractVersion,
  })
}

async function verifiedTarget(input) {
  if (!isRecord(input) || !isRecord(input.environment) ||
    typeof input.sandboxRoot !== 'string' || typeof input.dataDirectory !== 'string' ||
    typeof input.repositoryDirectory !== 'string' || typeof input.sandboxId !== 'string' ||
    typeof input.databaseName !== 'string' || typeof input.expectedTargetFingerprint !== 'string' ||
    typeof input.observedTargetFingerprint !== 'string' || typeof input.expectedGeneration !== 'string' ||
    typeof input.generation !== 'string' || typeof input.expectedFixtureVersion !== 'string' ||
    typeof input.expectedFixtureHash !== 'string' ||
    input.expectedNativeSessionContractVersion !== NATIVE_SESSION_CONTRACT_VERSION ||
    input.expectedFixtureVersion.length === 0 || input.expectedFixtureVersion.length > 128 ||
    !HASH.test(input.expectedFixtureHash)) fail('dev126_reset_baseline_invalid')

  const config = readLocalSandboxConfig(input.environment, 'ai-pdm')
  const databaseUrl = new URL(config.databaseUrl)
  const target = await validateLocalSandboxResetTarget(input)
  if (config.databaseName !== target.databaseName || config.sandboxId !== target.sandboxId ||
    config.runtimeRole.length === 0 || !isLoopbackHost(databaseUrl.hostname)) {
    fail('dev126_reset_baseline_target_mismatch')
  }
  const profileFingerprint = targetFingerprint({
    sandboxId: target.sandboxId,
    databaseName: target.databaseName,
    sandboxRoot: target.sandboxRoot,
    dataDirectory: target.dataDirectory,
    repositoryDirectory: target.repositoryDirectory,
    generation: target.generation,
    fixtureVersion: input.expectedFixtureVersion,
    fixtureHash: input.expectedFixtureHash,
    nativeSessionContractVersion: input.expectedNativeSessionContractVersion,
  })
  if (profileFingerprint !== target.targetFingerprint) fail('dev126_reset_baseline_target_mismatch')
  const expected = Object.freeze({
    databaseName: target.databaseName,
    runtimeRole: config.runtimeRole,
    databaseHost: databaseUrl.hostname,
    databasePort: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    sandboxId: target.sandboxId,
    generation: target.generation,
    targetFingerprint: target.targetFingerprint,
  })
  return { target, expected }
}

async function ensureDirectoryWithoutLinks(directory, boundary) {
  const resolved = path.resolve(directory)
  if (!within(boundary, resolved)) fail('dev126_reset_baseline_path_invalid')
  let current = path.resolve(boundary)
  let boundaryStat
  try { boundaryStat = await lstat(current) } catch { fail('dev126_reset_baseline_path_invalid') }
  if (boundaryStat.isSymbolicLink() || !boundaryStat.isDirectory()) fail('dev126_reset_baseline_path_invalid')
  const realBoundary = await realpath(current).catch(() => fail('dev126_reset_baseline_path_invalid'))
  if (!samePath(realBoundary, current)) fail('dev126_reset_baseline_path_invalid')
  const segments = path.relative(current, resolved).split(path.sep).filter(Boolean)
  for (const segment of segments) {
    current = path.join(current, segment)
    let stat
    try {
      stat = await lstat(current)
    } catch (error) {
      if (error?.code !== 'ENOENT') fail('dev126_reset_baseline_path_invalid')
      try {
        await mkdir(current, { mode: 0o700 })
      } catch (createError) {
        if (createError?.code !== 'EEXIST') fail('dev126_reset_baseline_path_invalid')
      }
      try { stat = await lstat(current) } catch { fail('dev126_reset_baseline_path_invalid') }
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('dev126_reset_baseline_path_invalid')
    let real
    try { real = await realpath(current) } catch { fail('dev126_reset_baseline_path_invalid') }
    if (!within(realBoundary, real)) fail('dev126_reset_baseline_path_invalid')
    current = real
  }
  return resolved
}

function validateTargetMetadata(metadata, target, expectedProfile) {
  const metadataKeys = [
    'applicationId', 'sandboxId', 'databaseName', 'sandboxRoot', 'dataDirectory', 'repositoryDirectory',
    'generation', 'fixtureVersion', 'fixtureHash', 'nativeSessionContractVersion', 'targetFingerprint', 'status',
  ]
  if (!exactKeys(metadata, metadataKeys) || metadata.applicationId !== 'ai-pdm' || metadata.status !== 'ready' ||
    metadata.sandboxId !== target.sandboxId || metadata.databaseName !== target.databaseName ||
    typeof metadata.sandboxRoot !== 'string' || typeof metadata.dataDirectory !== 'string' ||
    typeof metadata.repositoryDirectory !== 'string' || typeof metadata.generation !== 'string' ||
    typeof metadata.targetFingerprint !== 'string' || metadata.generation !== target.generation ||
    metadata.targetFingerprint !== target.targetFingerprint || !samePath(metadata.sandboxRoot, target.sandboxRoot) ||
    !samePath(metadata.dataDirectory, target.dataDirectory) ||
    !samePath(metadata.repositoryDirectory, target.repositoryDirectory) ||
    metadata.fixtureVersion !== expectedProfile.fixtureVersion || metadata.fixtureHash !== expectedProfile.fixtureHash ||
    metadata.nativeSessionContractVersion !== NATIVE_SESSION_CONTRACT_VERSION ||
    targetFingerprint({ ...metadata, sandboxRoot: target.sandboxRoot, dataDirectory: target.dataDirectory,
      repositoryDirectory: target.repositoryDirectory }) !== metadata.targetFingerprint) {
    fail('dev126_reset_baseline_target_mismatch')
  }
  return Object.freeze({
    applicationId: 'ai-pdm', sandboxId: metadata.sandboxId, databaseName: metadata.databaseName,
    sandboxRoot: target.sandboxRoot, dataDirectory: target.dataDirectory, repositoryDirectory: target.repositoryDirectory,
    generation: metadata.generation, fixtureVersion: metadata.fixtureVersion, fixtureHash: metadata.fixtureHash,
    nativeSessionContractVersion: metadata.nativeSessionContractVersion,
    targetFingerprint: metadata.targetFingerprint, status: 'ready',
  })
}

function validateRuntimeTargetObservation(observation, target, expected, expectedProfile) {
  if (!exactKeys(observation, ['connection', 'targetMetadata']) ||
    !exactKeys(observation.connection, ['databaseName', 'currentUser', 'sessionUser', 'serverAddress', 'serverPort']) ||
    observation.connection.databaseName !== expected.databaseName ||
    observation.connection.currentUser !== expected.runtimeRole ||
    observation.connection.sessionUser !== expected.runtimeRole ||
    !isLoopbackHost(observation.connection.serverAddress) ||
    !databaseHostMatches(expected.databaseHost, observation.connection.serverAddress) ||
    observation.connection.serverPort !== expected.databasePort) {
    fail('dev126_reset_baseline_target_mismatch')
  }
  return Object.freeze({
    connection: Object.freeze({ ...observation.connection }),
    targetMetadata: validateTargetMetadata(observation.targetMetadata, target, expectedProfile),
  })
}

function sameTargetMetadata(left, right) {
  return ['applicationId', 'sandboxId', 'databaseName', 'generation', 'fixtureVersion', 'fixtureHash',
    'nativeSessionContractVersion', 'targetFingerprint', 'status'].every((key) => left[key] === right[key]) &&
    samePath(left.sandboxRoot, right.sandboxRoot) && samePath(left.dataDirectory, right.dataDirectory) &&
    samePath(left.repositoryDirectory, right.repositoryDirectory)
}

async function assertRegularFile(filePath, code) {
  let stat
  try { stat = await lstat(filePath) } catch { fail(code) }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) fail(code)
  let resolved
  try { resolved = await realpath(filePath) } catch { fail(code) }
  return { stat, resolved }
}

async function walkRegularFiles(root, errorCode) {
  const rootStat = await lstat(root).catch(() => null)
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail(errorCode)
  const resolvedRoot = await realpath(root).catch(() => fail(errorCode))
  const files = new Map()

  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => fail(errorCode))
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..' || entry.name.includes('/') || entry.name.includes('\\')) fail(errorCode)
      const absolute = path.join(directory, entry.name)
      let stat
      try { stat = await lstat(absolute) } catch { fail(errorCode) }
      if (stat.isSymbolicLink()) fail(errorCode)
      const real = await realpath(absolute).catch(() => fail(errorCode))
      if (!within(resolvedRoot, real)) fail(errorCode)
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (stat.isDirectory()) {
        await visit(absolute, relative)
      } else if (stat.isFile() && stat.nlink <= 1) {
        files.set(relative, absolute)
      } else {
        fail(errorCode)
      }
    }
  }

  await visit(root, '')
  return files
}

function validateAuthority(authority) {
  if (!exactKeys(authority, ['mode', 'expectedCommit', 'schemaHash', 'rowVersion', 'switchedAt']) ||
    typeof authority.mode !== 'string' || !['legacy_only', 'shadow_compare', 'cutover_window', 'canonical_only'].includes(authority.mode) ||
    typeof authority.expectedCommit !== 'string' || authority.expectedCommit.length > 128 ||
    // DEV-090's native schema identity is the literal dev090-v1, not a SHA.
    typeof authority.schemaHash !== 'string' ||
    (authority.schemaHash !== 'dev090-v1' && !HASH.test(authority.schemaHash)) ||
    !Number.isSafeInteger(authority.rowVersion) || authority.rowVersion < 1 ||
    typeof authority.switchedAt !== 'string' || !Number.isFinite(Date.parse(authority.switchedAt))) {
    fail('dev126_reset_baseline_target_mismatch')
  }
  return Object.freeze({ ...authority })
}

function validOwnerConnection(connection, expectedDatabaseName) {
  return exactKeys(connection, ['databaseName', 'currentUser', 'sessionUser', 'serverAddress', 'serverPort']) &&
    connection.databaseName === expectedDatabaseName && connection.currentUser === PDM_OWNER_ROLE &&
    SCOPED_OWNER_LOGIN_ROLE.test(connection.sessionUser ?? '') && connection.sessionUser !== connection.currentUser &&
    isLoopbackHost(connection.serverAddress) && Number.isSafeInteger(connection.serverPort) &&
    connection.serverPort >= 1 && connection.serverPort <= 65535
}

function validateSnapshot(snapshot, target, expected, expectedProfile, runtimeTargetObservation) {
  if (!exactKeys(snapshot, [
    'snapshotId', 'connection', 'targetMetadata', 'schemaOwner', 'authority',
    'principalSessionCount', 'principalBindingCount', 'relations', 'dataDump', 'storagePointers',
  ])) fail('dev126_reset_baseline_unavailable')

  if (typeof snapshot.snapshotId !== 'string' || snapshot.snapshotId.length === 0 || snapshot.snapshotId.length > 256 ||
    !validOwnerConnection(snapshot.connection, expected.databaseName) ||
    !databaseHostMatches(expected.databaseHost, snapshot.connection.serverAddress) ||
    snapshot.connection.serverPort !== expected.databasePort ||
    snapshot.schemaOwner !== PDM_OWNER_ROLE ||
    !Number.isSafeInteger(snapshot.principalSessionCount) || snapshot.principalSessionCount !== 0 ||
    !Number.isSafeInteger(snapshot.principalBindingCount) || snapshot.principalBindingCount !== 0 ||
    !Array.isArray(snapshot.relations) || !Array.isArray(snapshot.storagePointers) ||
    !exactKeys(snapshot.dataDump, ['format', 'bytes', 'includedRelations']) ||
    snapshot.dataDump.format !== 'custom-data-only' ||
    !(Buffer.isBuffer(snapshot.dataDump.bytes) || snapshot.dataDump.bytes instanceof Uint8Array) ||
    snapshot.dataDump.bytes.byteLength === 0 || !Array.isArray(snapshot.dataDump.includedRelations)) {
    fail('dev126_reset_baseline_target_mismatch')
  }

  const metadata = validateTargetMetadata(snapshot.targetMetadata, target, expectedProfile)

  const authority = validateAuthority(snapshot.authority)
  const byName = new Map()
  for (const relation of snapshot.relations) {
    if (!exactKeys(relation, ['name', 'kind', 'owner', 'rowCount', 'rowsSha256']) ||
      typeof relation.name !== 'string' || !IDENTIFIER.test(relation.name) ||
      !['r', 'p', 'm'].includes(relation.kind) || relation.owner !== snapshot.schemaOwner ||
      !Number.isSafeInteger(relation.rowCount) || relation.rowCount < 0 ||
      typeof relation.rowsSha256 !== 'string' || !HASH.test(relation.rowsSha256) || byName.has(relation.name)) {
      fail('dev126_reset_baseline_unavailable')
    }
    byName.set(relation.name, Object.freeze({ ...relation }))
  }

  const excluded = CONTROL_RELATIONS.filter((name) => byName.has(name))
  if (excluded.length !== CONTROL_RELATIONS.length) fail('dev126_reset_baseline_unavailable')
  const businessRelations = [...byName.keys()].filter((name) => !CONTROL_RELATIONS.includes(name)).sort()
  if (businessRelations.length === 0) fail('dev126_reset_baseline_unavailable')
  const includedRelations = [...snapshot.dataDump.includedRelations].sort()
  if (includedRelations.length !== businessRelations.length ||
    includedRelations.some((name, index) => name !== businessRelations[index])) {
    fail('dev126_reset_baseline_unavailable')
  }

  const pointerIds = new Set()
  const pointers = []
  for (const pointer of snapshot.storagePointers) {
    if (!exactKeys(pointer, ['sourceTable', 'sourceId', 'provider', 'key', 'sha256', 'bytes']) ||
      !POINTER_SOURCES.includes(pointer.sourceTable) || typeof pointer.sourceId !== 'string' ||
      pointer.sourceId.length === 0 || pointer.sourceId.length > 256 ||
      !['local_repository', 'local', 'j_drive'].includes(pointer.provider) ||
      typeof pointer.key !== 'string' ||
      (pointer.sha256 !== null && (typeof pointer.sha256 !== 'string' || !HASH.test(pointer.sha256))) ||
      (pointer.bytes !== null && (!Number.isSafeInteger(pointer.bytes) || pointer.bytes < 0))) {
      fail('dev126_reset_baseline_repository_invalid')
    }
    const key = normalizedStorageKey(pointer.key)
    if (!businessRelations.includes(pointer.sourceTable)) fail('dev126_reset_baseline_repository_invalid')
    const pointerId = `${pointer.sourceTable}\0${pointer.sourceId}`
    if (pointerIds.has(pointerId)) fail('dev126_reset_baseline_repository_invalid')
    pointerIds.add(pointerId)
    pointers.push(Object.freeze({ sourceTable: pointer.sourceTable, sourceId: pointer.sourceId,
      provider: 'local_repository', key, sha256: pointer.sha256, bytes: pointer.bytes }))
  }

  pointers.sort((left, right) => left.sourceTable.localeCompare(right.sourceTable) ||
    left.sourceId.localeCompare(right.sourceId) || left.key.localeCompare(right.key))
  return Object.freeze({
    schemaOwner: snapshot.schemaOwner,
    ownerConnection: Object.freeze({
      databaseName: snapshot.connection.databaseName,
      currentUser: snapshot.connection.currentUser,
      sessionUser: snapshot.connection.sessionUser,
      serverAddress: snapshot.connection.serverAddress,
      serverPort: snapshot.connection.serverPort,
    }),
    runtimeTargetObservation,
    target: Object.freeze({
      applicationId: 'ai-pdm', sandboxId: metadata.sandboxId, databaseName: metadata.databaseName,
      sandboxRoot: target.sandboxRoot, dataDirectory: target.dataDirectory, repositoryDirectory: target.repositoryDirectory,
      generation: metadata.generation, targetFingerprint: metadata.targetFingerprint,
      fixtureVersion: metadata.fixtureVersion, fixtureHash: metadata.fixtureHash,
      nativeSessionContractVersion: metadata.nativeSessionContractVersion,
    }),
    authority,
    principalSessionCount: snapshot.principalSessionCount,
    principalBindingCount: snapshot.principalBindingCount,
    relations: businessRelations.map((name) => byName.get(name)),
    includedRelations: businessRelations,
    excludedRelations: [...CONTROL_RELATIONS],
    dumpBytes: Buffer.from(snapshot.dataDump.bytes),
    pointers,
  })
}

async function readLiveState({ targetInput, runtimeTargetReader, sourceRevision, owner, capturedAt }) {
  if (!REVISION.test(sourceRevision ?? '') || !isRecord(owner) ||
    typeof owner.captureAiPdmCoreSnapshot !== 'function' ||
    !isRecord(runtimeTargetReader) || typeof runtimeTargetReader.readCurrentTarget !== 'function') {
    fail('dev126_reset_baseline_invalid')
  }

  const { target, expected } = await verifiedTarget(targetInput)
  const expectedProfile = Object.freeze({
    fixtureVersion: targetInput.expectedFixtureVersion,
    fixtureHash: targetInput.expectedFixtureHash,
  })
  let rawRuntimeObservation
  try {
    rawRuntimeObservation = await runtimeTargetReader.readCurrentTarget(Object.freeze({ target, expectedDatabase: expected }))
  } catch {
    fail('dev126_reset_baseline_target_mismatch')
  }
  const runtimeTargetObservation = validateRuntimeTargetObservation(rawRuntimeObservation, target, expected, expectedProfile)
  const controlRoot = path.join(target.sandboxRoot, ...CONTROL_ROOT_PARTS)
  if ([target.dataDirectory, target.repositoryDirectory].some((directory) =>
    within(directory, controlRoot) || within(controlRoot, directory))) fail('dev126_reset_baseline_path_invalid')

  let snapshot
  try {
    snapshot = await owner.captureAiPdmCoreSnapshot(Object.freeze({
      target,
      expectedDatabase: expected,
      runtimeTargetObservation,
      scope: SNAPSHOT_SCOPE,
    }))
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    fail('dev126_reset_baseline_unavailable')
  }
  const validated = validateSnapshot(snapshot, target, expected, expectedProfile, runtimeTargetObservation)
  const repositoryRootStat = await lstat(target.repositoryDirectory).catch(() => null)
  if (!repositoryRootStat?.isDirectory() || repositoryRootStat.isSymbolicLink()) {
    fail('dev126_reset_baseline_repository_invalid')
  }
  const repositoryFiles = await walkRegularFiles(target.repositoryDirectory, 'dev126_reset_baseline_repository_invalid')
  const expectedKeys = new Map()
  for (const pointer of validated.pointers) {
    const prior = expectedKeys.get(pointer.key)
    if (prior && ((prior.sha256 && pointer.sha256 && prior.sha256 !== pointer.sha256) ||
      (prior.bytes !== null && pointer.bytes !== null && prior.bytes !== pointer.bytes))) {
      fail('dev126_reset_baseline_repository_invalid')
    }
    expectedKeys.set(pointer.key, {
      key: pointer.key,
      sha256: prior?.sha256 ?? pointer.sha256,
      bytes: prior?.bytes ?? pointer.bytes,
    })
  }
  if (repositoryFiles.size !== expectedKeys.size || [...repositoryFiles.keys()].some((key) => !expectedKeys.has(key))) {
    fail('dev126_reset_baseline_repository_invalid')
  }

  const objects = new Map()
  for (const [key, pointer] of expectedKeys) {
    const filePath = repositoryFiles.get(key)
    if (!filePath) fail('dev126_reset_baseline_repository_invalid')
    const { resolved } = await assertRegularFile(filePath, 'dev126_reset_baseline_repository_invalid')
    if (!within(target.repositoryDirectory, resolved)) fail('dev126_reset_baseline_repository_invalid')
    let bytes
    try { bytes = await readFile(filePath) } catch { fail('dev126_reset_baseline_repository_invalid') }
    const afterRead = await assertRegularFile(filePath, 'dev126_reset_baseline_repository_invalid')
    if (afterRead.stat.size !== bytes.byteLength || !samePath(afterRead.resolved, resolved) ||
      (pointer.bytes !== null && bytes.byteLength !== pointer.bytes) ||
      (pointer.sha256 !== null && sha256(bytes) !== pointer.sha256)) {
      fail('dev126_reset_baseline_repository_invalid')
    }
    objects.set(key, Object.freeze({ key, sha256: sha256(bytes), bytes: bytes.byteLength, content: bytes }))
  }

  const relationProjection = validated.relations.map(({ name, kind, owner, rowCount, rowsSha256 }) =>
    Object.freeze({ name, kind, owner, rowCount, rowsSha256 }))
  const repositoryProjection = [...objects.values()].map(({ key, sha256: hash, bytes }) =>
    Object.freeze({ key, sha256: hash, bytes })).sort((left, right) => left.key.localeCompare(right.key))
  const pointerProjection = validated.pointers.map((pointer) => {
    const object = objects.get(pointer.key)
    if (!object) fail('dev126_reset_baseline_repository_invalid')
    return Object.freeze({ ...pointer, sha256: object.sha256, bytes: object.bytes })
  }).sort((left, right) =>
    left.sourceTable.localeCompare(right.sourceTable) || left.sourceId.localeCompare(right.sourceId) || left.key.localeCompare(right.key))
  const state = Object.freeze({
    formatVersion: FORMAT_VERSION,
    baselineId: null,
    sourceRevision,
    target: validated.target,
    database: Object.freeze({
      schema: SCHEMA,
      runtimeTargetObservation: validated.runtimeTargetObservation,
      ownerConnection: validated.ownerConnection,
      schemaOwner: validated.schemaOwner,
      authority: validated.authority,
      principalSessionCount: validated.principalSessionCount,
      principalBindingCount: validated.principalBindingCount,
      relations: relationProjection,
      dumpFormat: 'custom-data-only',
      includedRelations: validated.includedRelations,
      excludedRelations: validated.excludedRelations,
    }),
    repository: Object.freeze({ pointers: pointerProjection, objects: repositoryProjection }),
  })
  return { target, controlRoot, validated, objects, state, capturedAt }
}

function stateForBaseline(state, baselineId) {
  return Object.freeze({ ...state, baselineId })
}

function projectionDigest(state, baselineId) {
  return contractDigest(stateForBaseline(state, baselineId))
}

function buildManifest(live, baselineId) {
  const state = stateForBaseline(live.state, baselineId)
  const dumpHash = sha256(live.validated.dumpBytes)
  const manifest = {
    ...state,
    capturedAt: live.capturedAt,
    stateDigest: contractDigest(state),
    databaseDump: {
      file: DATA_DUMP_FILE,
      format: 'custom-data-only',
      sha256: dumpHash,
      bytes: live.validated.dumpBytes.byteLength,
    },
    repository: {
      pointers: live.state.repository.pointers,
      objects: live.state.repository.objects,
      contentObjects: [...new Set(live.state.repository.objects.map((object) => object.sha256))].sort(),
    },
  }
  return Object.freeze(manifest)
}

function validateManifest(manifest, baselineId) {
  if (!exactKeys(manifest, [
    'formatVersion', 'baselineId', 'sourceRevision', 'target', 'database', 'repository',
    'capturedAt', 'stateDigest', 'databaseDump',
  ]) || manifest.formatVersion !== FORMAT_VERSION || manifest.baselineId !== baselineId ||
    !REVISION.test(manifest.sourceRevision ?? '') || !HASH.test(manifest.stateDigest ?? '') ||
    typeof manifest.capturedAt !== 'string' || !Number.isFinite(Date.parse(manifest.capturedAt)) ||
    !exactKeys(manifest.databaseDump, ['file', 'format', 'sha256', 'bytes']) ||
    manifest.databaseDump.file !== DATA_DUMP_FILE || manifest.databaseDump.format !== 'custom-data-only' ||
    !HASH.test(manifest.databaseDump.sha256 ?? '') || !Number.isSafeInteger(manifest.databaseDump.bytes) ||
    manifest.databaseDump.bytes <= 0 || !isRecord(manifest.target) || !isRecord(manifest.database) ||
    !exactKeys(manifest.repository, ['pointers', 'objects', 'contentObjects']) ||
    !validOwnerConnection(manifest.database?.ownerConnection, manifest.target?.databaseName) ||
    !Array.isArray(manifest.repository.pointers) || !Array.isArray(manifest.repository.objects) ||
    !Array.isArray(manifest.repository.contentObjects)) fail('dev126_reset_baseline_corrupt')

  const objectKeys = new Set()
  const objectByKey = new Map()
  for (const object of manifest.repository.objects) {
    if (!exactKeys(object, ['key', 'sha256', 'bytes']) || typeof object.key !== 'string' ||
      !HASH.test(object.sha256 ?? '') || !Number.isSafeInteger(object.bytes) || object.bytes < 0) {
      fail('dev126_reset_baseline_corrupt')
    }
    normalizedStorageKey(object.key)
    if (objectKeys.has(object.key)) fail('dev126_reset_baseline_corrupt')
    objectKeys.add(object.key)
    objectByKey.set(object.key, object)
  }
  const pointerIds = new Set()
  for (const pointer of manifest.repository.pointers) {
    if (!exactKeys(pointer, ['sourceTable', 'sourceId', 'provider', 'key', 'sha256', 'bytes']) ||
      !POINTER_SOURCES.includes(pointer.sourceTable) || typeof pointer.sourceId !== 'string' ||
      pointer.sourceId.length === 0 || pointer.sourceId.length > 256 || pointer.provider !== 'local_repository' ||
      typeof pointer.key !== 'string' || !HASH.test(pointer.sha256 ?? '') ||
      !Number.isSafeInteger(pointer.bytes) || pointer.bytes < 0) fail('dev126_reset_baseline_corrupt')
    normalizedStorageKey(pointer.key)
    const id = `${pointer.sourceTable}\0${pointer.sourceId}`
    const object = objectByKey.get(pointer.key)
    if (pointerIds.has(id) || !object || object.sha256 !== pointer.sha256 || object.bytes !== pointer.bytes) {
      fail('dev126_reset_baseline_corrupt')
    }
    pointerIds.add(id)
  }
  if (objectKeys.size !== new Set(manifest.repository.pointers.map((pointer) => pointer.key)).size) {
    fail('dev126_reset_baseline_corrupt')
  }
  const hashes = [...new Set(manifest.repository.objects.map((object) => object.sha256))].sort()
  if (hashes.length !== manifest.repository.contentObjects.length ||
    hashes.some((hash, index) => hash !== manifest.repository.contentObjects[index]) ||
    manifest.stateDigest !== contractDigest({
      formatVersion: manifest.formatVersion,
      baselineId: manifest.baselineId,
      sourceRevision: manifest.sourceRevision,
      target: manifest.target,
      database: manifest.database,
      repository: { pointers: manifest.repository.pointers, objects: manifest.repository.objects },
    })) fail('dev126_reset_baseline_corrupt')
}

async function readManifest(baselineDirectory) {
  const manifestPath = path.join(baselineDirectory, MANIFEST_FILE)
  await assertRegularFile(manifestPath, 'dev126_reset_baseline_corrupt')
  let raw
  try { raw = await readFile(manifestPath, 'utf8') } catch { fail('dev126_reset_baseline_corrupt') }
  let manifest
  try { manifest = JSON.parse(raw) } catch { fail('dev126_reset_baseline_corrupt') }
  validateManifest(manifest, manifest?.baselineId)
  if (raw !== JSON.stringify(manifest)) fail('dev126_reset_baseline_corrupt')
  return manifest
}

async function verifyArtifactFiles(baselineDirectory, manifest) {
  const files = await walkRegularFiles(baselineDirectory, 'dev126_reset_baseline_corrupt')
  const expected = new Set([MANIFEST_FILE, DATA_DUMP_FILE,
    ...manifest.repository.contentObjects.map((hash) => `objects/${hash}`)])
  if (files.size !== expected.size || [...files.keys()].some((file) => !expected.has(file))) {
    fail('dev126_reset_baseline_corrupt')
  }
  const dumpFile = files.get(DATA_DUMP_FILE)
  if (!dumpFile) fail('dev126_reset_baseline_corrupt')
  const dump = await readFile(dumpFile).catch(() => fail('dev126_reset_baseline_corrupt'))
  if (dump.byteLength !== manifest.databaseDump.bytes || sha256(dump) !== manifest.databaseDump.sha256) {
    fail('dev126_reset_baseline_corrupt')
  }
  for (const hash of manifest.repository.contentObjects) {
    const objectFile = files.get(`objects/${hash}`)
    if (!objectFile) fail('dev126_reset_baseline_corrupt')
    const bytes = await readFile(objectFile).catch(() => fail('dev126_reset_baseline_corrupt'))
    const described = manifest.repository.objects.filter((object) => object.sha256 === hash)
    if (bytes.byteLength !== described[0]?.bytes || sha256(bytes) !== hash ||
      described.some((object) => object.bytes !== bytes.byteLength)) fail('dev126_reset_baseline_corrupt')
  }
  return files
}

async function existingBaseline(baselineDirectory, baselineId) {
  let stat
  try { stat = await lstat(baselineDirectory) } catch (error) {
    if (error?.code === 'ENOENT') return null
    fail('dev126_reset_baseline_path_invalid')
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('dev126_reset_baseline_path_invalid')
  const manifest = await readManifest(baselineDirectory)
  if (manifest.baselineId !== baselineId) fail('dev126_reset_baseline_corrupt')
  await verifyArtifactFiles(baselineDirectory, manifest)
  return manifest
}

function assertExistingMatches(manifest, live, baselineId) {
  if (manifest.stateDigest !== projectionDigest(live.state, baselineId)) fail('dev126_reset_baseline_conflict')
}

function resultFor(directory, manifest, reused) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  return Object.freeze({
    baselineId: manifest.baselineId,
    directory,
    sourceRevision: manifest.sourceRevision,
    generation: manifest.target.generation,
    targetFingerprint: manifest.target.targetFingerprint,
    stateDigest: manifest.stateDigest,
    manifestSha256: sha256(manifestBytes),
    capturedAt: manifest.capturedAt,
    reused,
  })
}

async function createArtifact(live, baselineId, manifest, storeRoot, baselineDirectory) {
  await ensureDirectoryWithoutLinks(storeRoot, live.target.sandboxRoot)
  const tempDirectory = path.join(storeRoot, `.${baselineId}.tmp-${process.pid}-${randomUUID()}`)
  if (!BASELINE_ID.test(baselineId) || !within(storeRoot, tempDirectory)) fail('dev126_reset_baseline_invalid')
  try {
    await mkdir(tempDirectory, { mode: 0o700 })
    await mkdir(path.join(tempDirectory, 'objects'), { mode: 0o700 })
    await writeFile(path.join(tempDirectory, DATA_DUMP_FILE), live.validated.dumpBytes, { mode: 0o600, flag: 'wx' })
    for (const hash of manifest.repository.contentObjects) {
      const object = [...live.objects.values()].find((candidate) => candidate.sha256 === hash)
      if (!object) fail('dev126_reset_baseline_repository_invalid')
      await writeFile(path.join(tempDirectory, 'objects', hash), object.content, { mode: 0o600, flag: 'wx' })
    }
    await writeFile(path.join(tempDirectory, MANIFEST_FILE), JSON.stringify(manifest), { mode: 0o600, flag: 'wx' })
    try {
      await rename(tempDirectory, baselineDirectory)
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error
      const existing = await existingBaseline(baselineDirectory, baselineId)
      if (!existing) fail('dev126_reset_baseline_unavailable')
      assertExistingMatches(existing, live, baselineId)
      return resultFor(baselineDirectory, existing, true)
    }
    const persisted = await existingBaseline(baselineDirectory, baselineId)
    if (!persisted) fail('dev126_reset_baseline_corrupt')
    assertExistingMatches(persisted, live, baselineId)
    return resultFor(baselineDirectory, persisted, false)
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    fail('dev126_reset_baseline_unavailable')
  } finally {
    // Only remove the exact temporary directory created by this call.
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Capture one immutable, owner-scoped local baseline. The injected owner port
 * must read one repeatable PostgreSQL snapshot and a closed set of PDM storage
 * pointers; it receives only this module's fixed schema/exclusion policy.
 * No restore or database write is performed here.
 */
export async function captureDev126LocalResetBaseline({
  targetInput,
  runtimeTargetReader,
  baselineId,
  sourceRevision,
  owner,
  capturedAt = new Date(),
}) {
  if (!BASELINE_ID.test(baselineId ?? '') || baselineId === '.' || baselineId === '..') {
    fail('dev126_reset_baseline_invalid')
  }
  const live = await readLiveState({ targetInput, runtimeTargetReader, sourceRevision, owner,
    capturedAt: canonicalTimestamp(capturedAt) })
  const manifest = buildManifest(live, baselineId)
  const storeRoot = path.join(live.target.sandboxRoot, ...CONTROL_ROOT_PARTS)
  const baselineDirectory = path.join(storeRoot, baselineId)
  await ensureDirectoryWithoutLinks(storeRoot, live.target.sandboxRoot)
  const existing = await existingBaseline(baselineDirectory, baselineId)
  if (existing) {
    assertExistingMatches(existing, live, baselineId)
    return resultFor(baselineDirectory, existing, true)
  }
  return createArtifact(live, baselineId, manifest, storeRoot, baselineDirectory)
}

/** Re-read the live owner snapshot and verify an existing immutable artifact. */
export async function verifyDev126LocalResetBaseline({
  targetInput,
  runtimeTargetReader,
  baselineId,
  sourceRevision,
  owner,
}) {
  if (!BASELINE_ID.test(baselineId ?? '') || baselineId === '.' || baselineId === '..') {
    fail('dev126_reset_baseline_invalid')
  }
  const live = await readLiveState({ targetInput, runtimeTargetReader, sourceRevision, owner,
    capturedAt: new Date().toISOString() })
  const storeRoot = path.join(live.target.sandboxRoot, ...CONTROL_ROOT_PARTS)
  const baselineDirectory = path.join(storeRoot, baselineId)
  await ensureDirectoryWithoutLinks(storeRoot, live.target.sandboxRoot)
  const manifest = await existingBaseline(baselineDirectory, baselineId)
  if (!manifest) fail('dev126_reset_baseline_unavailable')
  assertExistingMatches(manifest, live, baselineId)
  return resultFor(baselineDirectory, manifest, true)
}

/** Verify the pinned artifact without requiring the live business data to
 * still equal its baseline. This is a filesystem read only, not a restore.
 */
export async function readDev126LocalResetBaseline({ targetInput, baselineId, expectedManifestSha256 }) {
  if (!BASELINE_ID.test(baselineId ?? '') || baselineId === '.' || baselineId === '..' ||
    !HASH.test(expectedManifestSha256 ?? '')) fail('dev126_reset_baseline_invalid')
  const { target } = await verifiedTarget(targetInput)
  const storeRoot = path.join(target.sandboxRoot, ...CONTROL_ROOT_PARTS)
  if ([target.dataDirectory, target.repositoryDirectory].some(directory =>
    within(directory, storeRoot) || within(storeRoot, directory))) fail('dev126_reset_baseline_path_invalid')
  const stat = await lstat(storeRoot).catch(() => null)
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('dev126_reset_baseline_unavailable')
  await ensureDirectoryWithoutLinks(storeRoot, target.sandboxRoot)
  const directory = path.join(storeRoot, baselineId)
  const manifest = await existingBaseline(directory, baselineId)
  if (!manifest || manifest.target.targetFingerprint !== target.targetFingerprint ||
    manifest.target.generation !== target.generation || manifest.target.databaseName !== target.databaseName ||
    manifest.target.fixtureVersion !== targetInput.expectedFixtureVersion ||
    manifest.target.fixtureHash !== targetInput.expectedFixtureHash) fail('dev126_reset_baseline_target_mismatch')
  const descriptor = resultFor(directory, manifest, true)
  if (descriptor.manifestSha256 !== expectedManifestSha256) fail('dev126_reset_baseline_corrupt')
  return Object.freeze({ ...descriptor, manifest: Object.freeze(manifest),
    dataDumpPath: path.join(directory, DATA_DUMP_FILE), objectsDirectory: path.join(directory, 'objects') })
}

export const DEV126_LOCAL_RESET_BASELINE_POLICY = Object.freeze({
  formatVersion: FORMAT_VERSION,
  schema: SCHEMA,
  ownerRole: PDM_OWNER_ROLE,
  controlRelations: CONTROL_RELATIONS,
  pointerSources: POINTER_SOURCES,
  consistency: 'single-exported-postgresql-snapshot',
  dumpFormat: 'custom-data-only',
  artifactRoot: `sandboxRoot/${CONTROL_ROOT_PARTS.join('/')}`,
})
