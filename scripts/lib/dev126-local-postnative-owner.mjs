import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const LOGIN_FILE = 'pdm-baseline-owner-login.json'
const REFERENCE_FILE = 'pdm-baseline-reference.json'
const BASELINE_ID = 'dev126-initial-v2'
const OWNER_LOGIN = /^local_pdm_seed_[a-f0-9]{16}$/u
const HASH = /^[a-f0-9]{64}$/u
const REVISION = /^[a-f0-9]{40}$/iu
const fail = code => { throw Object.assign(new Error(code), { code }) }
const from = (root, file) => import(pathToFileURL(path.join(root, file)).href)

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function exactKeys(value, keys) { return isRecord(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0') }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

async function readPrivateJson(root, filename, maximum = 2 * 1024 * 1024) {
  const file = path.join(root, 'control', filename)
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > maximum) fail('POSTNATIVE_PRIVATE_INPUT_INVALID')
  return JSON.parse(await readFile(file, 'utf8'))
}

function assertBootstrapInput(input) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
  const runtimeUsers = { platform: 'local_platform_runtime_d021_20261029',
    orgmaster: 'local_orgmaster_runtime_d060_20261029', 'ai-pdm': 'local_pdm_runtime_d126_20261029',
    fms: 'fms_test_runtime_dev069_20261029' }
  if (!exactKeys(input, ['format', 'sandboxId', 'databaseName', 'generation', 'runtimeLogins', 'clientKeys',
    'sessionHashPepper', 'fixtureControllerKey']) || input.format !== 'jenfu.local-principal-bootstrap-input.v1' ||
    typeof input.sandboxId !== 'string' || !/^[a-z][a-z0-9-]{2,50}$/u.test(input.sandboxId) ||
    input.databaseName !== `jenfu_local_${input.sandboxId.replaceAll('-', '_')}` || !uuid.test(input.generation) ||
    !HASH.test(input.sessionHashPepper ?? '') || !HASH.test(input.fixtureControllerKey ?? '') ||
    !exactKeys(input.runtimeLogins, ['platform', 'orgmaster', 'ai-pdm', 'fms']) ||
    !exactKeys(input.clientKeys, ['orgmaster', 'ai-pdm', 'fms']) ||
    Object.values(input.clientKeys).some(value => !HASH.test(value ?? '')) ||
    new Set([input.sessionHashPepper, input.fixtureControllerKey, ...Object.values(input.clientKeys)]).size !== 5) {
    fail('BOOTSTRAP_INPUT_INVALID')
  }
  const passwords = []
  for (const [clientId, username] of Object.entries(runtimeUsers)) {
    const login = input.runtimeLogins[clientId]
    if (!exactKeys(login, ['username', 'password']) || login.username !== username ||
      typeof login.password !== 'string' || login.password.length < 32 || login.password.length > 512 ||
      /[\r\n\0]/u.test(login.password)) fail('BOOTSTRAP_INPUT_INVALID')
    passwords.push(login.password)
  }
  if (new Set(passwords).size !== passwords.length) fail('BOOTSTRAP_INPUT_INVALID')
}

async function readJsonIfPresent(file, maximum = 2 * 1024 * 1024) {
  try {
    const stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > maximum) fail('POSTNATIVE_PRIVATE_INPUT_INVALID')
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function writePrivateJsonCreateOnly(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}

async function assertTarget(admin, input, cluster) {
  const result = await admin.query(`SELECT current_database() AS database_name,session_user,
    host(inet_server_addr()) AS host,inet_server_port() AS port,
    (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) AS marker`)
  const row = result.rows?.[0]
  if (result.rows?.length !== 1 || row.database_name !== input.databaseName || row.session_user !== 'postgres' ||
    row.host !== '127.0.0.1' || Number(row.port) !== Number(cluster.postmaster.port) ||
    row.marker !== `jenfu.local-principal-bootstrap.v1:${input.sandboxId}:${input.generation}`) fail('TARGET_MISMATCH')
}

async function readSessionCounts(client) {
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM ai_pdm_core.principal_session_records) AS sessions,
    (SELECT count(*)::int FROM ai_pdm_core.local_sandbox_principal_session_bindings) AS bindings`)
  if (result.rows?.length !== 1 || !Number.isSafeInteger(Number(result.rows[0].sessions)) ||
    !Number.isSafeInteger(Number(result.rows[0].bindings))) fail('PDM_SESSION_READBACK_INVALID')
  return { sessions: Number(result.rows[0].sessions), bindings: Number(result.rows[0].bindings) }
}

function policyFor(input, saved, digest) {
  const expectedCodes = ['system_admin', 'pdm_admin', 'rd_manager', 'production_planning', 'qa', 'rd',
    'manufacturing', 'procurement', 'external_specialist']
  if (!exactKeys(saved, ['format', 'sandboxId', 'roleCodes', 'sha256']) || saved.format !== 'ai-pdm.local-role-priority.v1' ||
    saved.sandboxId !== input.sandboxId || JSON.stringify(saved.roleCodes) !== JSON.stringify(expectedCodes) ||
    !HASH.test(saved.sha256) || saved.sha256 !== digest({ format: saved.format, sandboxId: saved.sandboxId, roleCodes: saved.roleCodes })) {
    fail('LOCAL_PRIORITY_POLICY_INVALID')
  }
  return saved
}

function ownerTarget(input, fixture, runtimeRoot, port) {
  return { sandboxId: input.sandboxId, databaseName: input.databaseName, databaseHost: '127.0.0.1',
    databasePort: Number(port), generation: input.generation, fixtureVersion: fixture.fixtureVersion,
    fixtureHash: fixture.fixtureHash, nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
    sandboxRoot: runtimeRoot, dataDirectory: path.join(runtimeRoot, 'data'),
    repositoryDirectory: path.join(runtimeRoot, 'repository') }
}

function assertBaselineReference(reference, input) {
  if (!exactKeys(reference, ['baselineId', 'manifestSha256', 'stateDigest', 'targetFingerprint', 'generation', 'sourceRevision']) ||
    reference.baselineId !== BASELINE_ID || !HASH.test(reference.manifestSha256 ?? '') ||
    !HASH.test(reference.stateDigest ?? '') || !HASH.test(reference.targetFingerprint ?? '') ||
    reference.generation !== input.generation || !REVISION.test(reference.sourceRevision ?? '')) {
    fail('BASELINE_REFERENCE_INVALID')
  }
}

async function assertExistingBaselineArtifact(root, baselineId) {
  if (baselineId !== BASELINE_ID) fail('BASELINE_REFERENCE_INVALID')
  const directories = [path.resolve(root), path.resolve(root, 'control'),
    path.resolve(root, 'control', 'dev126-reset-baselines'),
    path.resolve(root, 'control', 'dev126-reset-baselines', baselineId)]
  for (const directory of directories) {
    const stat = await lstat(directory).catch(() => fail('BASELINE_REFERENCE_MISSING'))
    const real = await realpath(directory).catch(() => fail('BASELINE_REFERENCE_PATH_INVALID'))
    if (stat.isSymbolicLink() || !stat.isDirectory() || !samePath(real, directory)) {
      fail('BASELINE_REFERENCE_PATH_INVALID')
    }
  }
}

async function openAdmin({ Client, cluster, databaseName }) {
  const client = new Client({ ...cluster.adminConnection, database: databaseName,
    application_name: 'dev126-postnative-owner-control' })
  await client.connect()
  return client
}

async function createScopedLogin(admin, username, password, connectionLimit = 0) {
  const literal = (await admin.query('SELECT quote_literal($1::text) AS value', [password])).rows?.[0]?.value
  if (typeof literal !== 'string' || !/^'[0-9a-f]{64}'$/u.test(literal)) fail('PDM_SCOPED_LOGIN_CREATE_FAILED')
  await admin.query(`CREATE ROLE "${username}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS${connectionLimit ? ` CONNECTION LIMIT ${connectionLimit}` : ''} PASSWORD ${literal}`)
  await admin.query(`GRANT jenfu_ai_pdm_migrator TO "${username}"`)
}

async function validatePersistentLogin(admin, login, input, cluster, verifyOnly) {
  if (!exactKeys(login, ['sandboxId', 'generation', 'databaseName', 'port', 'username', 'password']) ||
    login.sandboxId !== input.sandboxId || login.generation !== input.generation ||
    login.databaseName !== input.databaseName || Number(login.port) !== Number(cluster.postmaster.port) ||
    !OWNER_LOGIN.test(login.username) || !HASH.test(login.password)) fail('OWNER_LOGIN_SCOPE_MISMATCH')
  const identity = await admin.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
    FROM pg_catalog.pg_roles WHERE rolname=$1`, [login.username])
  if (identity.rows?.length === 0) {
    if (verifyOnly) fail('OWNER_LOGIN_MISSING')
    await createScopedLogin(admin, login.username, login.password, 2)
  } else if (identity.rows?.length !== 1) fail('OWNER_LOGIN_PRIVILEGE_MISMATCH')
  const actual = await admin.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
    FROM pg_catalog.pg_roles WHERE rolname=$1`, [login.username])
  const groups = await admin.query(`SELECT role.rolname FROM pg_catalog.pg_auth_members member
    JOIN pg_catalog.pg_roles role ON role.oid=member.roleid WHERE member.member=$1::regrole`, [login.username])
  const row = actual.rows?.[0]
  if (actual.rows?.length !== 1 || !row?.rolcanlogin || row.rolinherit || row.rolsuper || row.rolcreatedb ||
    row.rolcreaterole || row.rolbypassrls || groups.rows?.length !== 1 || groups.rows[0].rolname !== 'jenfu_ai_pdm_migrator') {
    fail('OWNER_LOGIN_PRIVILEGE_MISMATCH')
  }
  return login
}

async function runBusinessBaseline({ root, taskRoot, verifyOnly = false, Client, inspectCluster, readSuite,
  businessBaselineOwner }) {
  const input = await readPrivateJson(root, 'bootstrap-input.json')
  assertBootstrapInput(input)
  const suite = await readSuite(root)
  const platformRoot = suite.applications.platform.worktree
  const protocol = await from(platformRoot, 'contracts/local-principal-sandbox/v1/protocol.mjs')
  const native = await readPrivateJson(root, 'native-bootstrap-result.json')
  if (native.status !== 'source-profile-and-database-readback-verified' || native.generation !== input.generation ||
    native.sandboxId !== input.sandboxId) fail('NATIVE_READBACK_REQUIRED')
  const fixture = protocol.assertFixtureEnvelope(await readPrivateJson(root, 'fixtures.json'))
  const policy = policyFor(input, await readPrivateJson(root, 'pdm-local-priority-policy.json'), protocol.contractDigest)
  const cluster = await inspectCluster({ taskRoot })
  const admin = await openAdmin({ Client, cluster, databaseName: input.databaseName })
  const audit = verifyOnly ? null : { format: 'ai-pdm.local-business-baseline-receipt.v1', attemptId: randomUUID(),
    databaseName: input.databaseName, generation: input.generation, fixtureHash: fixture.fixtureHash,
    status: 'in_progress' }
  let scoped
  let ephemeralLogin
  try {
    await assertTarget(admin, input, cluster)
    const counts = await readSessionCounts(admin)
    if (counts.sessions !== 0 || counts.bindings !== 0) fail('PDM_BASELINE_TARGET_HAS_SESSIONS')
    const contract = businessBaselineOwner ?? await from(suite.applications['ai-pdm'].worktree,
      'scripts/lib/dev126-local-business-baseline-owner.mjs')
    if (typeof contract.dev126LocalBusinessBaselineResultMaterial !== 'function' ||
      (verifyOnly ? typeof contract.verifyDev126LocalBusinessBaseline !== 'function'
        : typeof contract.initializeDev126LocalBusinessBaseline !== 'function')) {
      fail('BUSINESS_BASELINE_OWNER_CONTRACT_INVALID')
    }
    const inputTarget = ownerTarget(input, fixture, root, cluster.postmaster.port)
    const localPriorityPolicy = { ...policy }
    let client = admin
    let sessionUser = 'postgres'
    if (!verifyOnly) {
      const username = `local_pdm_seed_${randomBytes(8).toString('hex')}`
      const password = randomBytes(32).toString('hex')
      ephemeralLogin = username
      await createScopedLogin(admin, username, password)
      scoped = new Client({ ...cluster.adminConnection, database: input.databaseName, user: username, password,
        application_name: 'dev126-scoped-native-baseline' })
      await scoped.connect()
      client = scoped
      sessionUser = ephemeralLogin
    }
    const ownerInput = { client, scopedMigratorSessionUser: sessionUser,
      target: inputTarget, localPriorityPolicy, workbenchAuthorityExpectedCommit: 'local-dev' }
    const result = verifyOnly
      ? await contract.verifyDev126LocalBusinessBaseline(ownerInput)
      : await contract.initializeDev126LocalBusinessBaseline(ownerInput)
    const sourceDigest = protocol.contractDigest({ target: ownerInput.target, policy: localPriorityPolicy,
      result: contract.dev126LocalBusinessBaselineResultMaterial(result) })
    const after = await readSessionCounts(admin)
    if (after.sessions !== 0 || after.bindings !== 0) fail('PDM_BASELINE_SESSION_FENCE_FAILED')
    const status = verifyOnly ? 'verified' : 'owner-local-business-baseline-committed'
    if (audit) {
      audit.status = status
      audit.resultDigest = sourceDigest
      audit.catalogVersion = result.catalogProjection.catalogVersion
      audit.catalogRoleCount = result.catalogProjection.roleCount
      audit.catalogPermissionCount = result.catalogProjection.permissionCount
      audit.priorityVersion = result.rolePriority.versionCode
      audit.metadataTargetFingerprint = result.metadata.targetFingerprint
      audit.workbenchAuthority = result.workbenchAuthority
      audit.zeroSessionReadback = true
    }
    return Object.freeze({ stage: 'pdm-business-baseline', status,
      inputDigest: protocol.contractDigest({ sandboxId: input.sandboxId, generation: input.generation,
        fixtureHash: fixture.fixtureHash, policySha256: policy.sha256 }), resultDigest: sourceDigest,
      catalogVersion: result.catalogProjection.catalogVersion, roleCount: result.catalogProjection.roleCount,
      permissionCount: result.catalogProjection.permissionCount, priorityVersion: result.rolePriority.versionCode,
      metadataTargetFingerprint: result.metadata.targetFingerprint, zeroSessionReadback: true })
  } catch (error) {
    if (audit) {
      audit.status = 'failed'
      audit.code = error.code ?? error.name
    }
    throw error
  } finally {
    if (scoped && scoped !== admin) await scoped.end().catch(() => undefined)
    if (ephemeralLogin) {
      await admin.query(`REVOKE jenfu_ai_pdm_migrator FROM "${ephemeralLogin}"`).catch(() => undefined)
      await admin.query(`DROP ROLE "${ephemeralLogin}"`).catch(() => undefined)
    }
    await admin.end().catch(() => undefined)
    if (audit) await writePrivateJsonCreateOnly(path.join(root, 'control', `pdm-business-baseline-${audit.attemptId}.json`), audit)
  }
}

async function makeBaselineLogin({ root, input, cluster, admin, verifyOnly }) {
  const file = path.join(root, 'control', LOGIN_FILE)
  let login = await readJsonIfPresent(file)
  if (!login) {
    if (verifyOnly) fail('PDM_BASELINE_VERIFY_INCOMPLETE')
    login = { sandboxId: input.sandboxId, generation: input.generation, databaseName: input.databaseName,
      port: cluster.postmaster.port, username: `local_pdm_seed_${randomBytes(8).toString('hex')}`,
      password: randomBytes(32).toString('hex') }
    await writePrivateJsonCreateOnly(file, login)
  }
  await validatePersistentLogin(admin, login, input, cluster, verifyOnly)
  if (!verifyOnly) await admin.query(`GRANT CONNECT ON DATABASE "${input.databaseName}" TO "${login.username}"`)
  return login
}

async function runPdmNativeBaseline({ root, taskRoot, verifyOnly = false, Client, pg, inspectCluster, readSuite,
  runtimeTargetReaderFactory, snapshotOwnerFactory, baselineFunctions, platformRoot, gitHead }) {
  const input = await readPrivateJson(root, 'bootstrap-input.json')
  assertBootstrapInput(input)
  const protocol = await from(platformRoot, 'contracts/local-principal-sandbox/v1/protocol.mjs')
  const native = await readPrivateJson(root, 'native-bootstrap-result.json')
  if (native.status !== 'source-profile-and-database-readback-verified' || native.generation !== input.generation ||
    native.sandboxId !== input.sandboxId) fail('NATIVE_READBACK_REQUIRED')
  const fixture = protocol.assertFixtureEnvelope(await readPrivateJson(root, 'fixtures.json'))
  const referenceFile = path.join(root, 'control', REFERENCE_FILE)
  const existingReference = await readJsonIfPresent(referenceFile)
  if (existingReference) assertBaselineReference(existingReference, input)
  if (verifyOnly) {
    if (!existingReference) fail('BASELINE_REFERENCE_MISSING')
    await assertExistingBaselineArtifact(root, existingReference.baselineId)
  }
  const suite = await readSuite(root)
  const cluster = await inspectCluster({ taskRoot })
  const admin = await openAdmin({ Client, cluster, databaseName: input.databaseName })
  const audit = { scope: verifyOnly ? 'pdm-zero-session-native-baseline-verify' : 'pdm-zero-session-native-baseline-capture',
    receiptId: randomUUID(), status: verifyOnly ? 'verifying' : 'running', createdAt: new Date().toISOString() }
  try {
    await assertTarget(admin, input, cluster)
    const counts = await readSessionCounts(admin)
    if (counts.sessions !== 0 || counts.bindings !== 0) fail('PDM_BASELINE_TARGET_HAS_SESSIONS')
    const login = await makeBaselineLogin({ root, input, cluster, admin, verifyOnly })
    const services = await (await from(suite.applications.platform.worktree, 'scripts/lib/dev021-local-principal-suite.mjs'))
      .createLocalPrincipalSuiteServices(suite)
    const environment = services.find(service => service.name === 'Local ai-pdm')?.env
    if (!environment) fail('PDM_RUNTIME_ENVIRONMENT_INVALID')
    const fingerprintData = { applicationId: 'ai-pdm', sandboxId: input.sandboxId,
      databaseName: input.databaseName, sandboxRoot: root, dataDirectory: path.join(root, 'data'),
      repositoryDirectory: path.join(root, 'repository'), generation: input.generation,
      fixtureVersion: fixture.fixtureVersion, fixtureHash: fixture.fixtureHash,
      nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2' }
    const targetFingerprint = protocol.contractDigest(fingerprintData)
    const targetInput = { environment, sandboxRoot: root, dataDirectory: path.join(root, 'data'),
      repositoryDirectory: path.join(root, 'repository'), sandboxId: input.sandboxId,
      databaseName: input.databaseName, expectedTargetFingerprint: targetFingerprint,
      observedTargetFingerprint: targetFingerprint, expectedGeneration: input.generation,
      generation: input.generation, expectedFixtureVersion: fixture.fixtureVersion,
      expectedFixtureHash: fixture.fixtureHash, expectedNativeSessionContractVersion: 'jenfu.ai-pdm-session.v2' }
    const osEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
      /^(?:Path|SystemRoot|windir|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/iu.test(key) && typeof value === 'string'))
    const ownerEnvironment = { ...osEnvironment,
      PATH: `${process.env.Path ?? process.env.PATH ?? ''}`, PGUSER: login.username, PGPASSWORD: login.password }
    const owner = snapshotOwnerFactory({ environment: ownerEnvironment })
    const runtimeTargetReader = runtimeTargetReaderFactory({ environment })
    const pdmWorktree = suite.applications['ai-pdm'].worktree
    const sourceRevision = existingReference?.sourceRevision ?? gitHead(pdmWorktree)
    const baselineId = existingReference?.baselineId ?? BASELINE_ID
    const fn = verifyOnly ? baselineFunctions.verify : baselineFunctions.capture
    const result = await fn({ targetInput, runtimeTargetReader, owner, baselineId, sourceRevision })
    if (verifyOnly && (!existingReference || result.manifestSha256 !== existingReference.manifestSha256 ||
      result.stateDigest !== existingReference.stateDigest || result.targetFingerprint !== existingReference.targetFingerprint ||
      result.generation !== existingReference.generation || result.sourceRevision !== existingReference.sourceRevision)) {
      fail('BASELINE_REFERENCE_CHANGED')
    }
    if (!verifyOnly) {
      const reference = { baselineId: result.baselineId, manifestSha256: result.manifestSha256,
        stateDigest: result.stateDigest, targetFingerprint: result.targetFingerprint,
        generation: result.generation, sourceRevision }
      if (existingReference) {
        if (protocol.contractDigest(existingReference) !== protocol.contractDigest(reference)) fail('BASELINE_REFERENCE_DRIFT')
      } else await writePrivateJsonCreateOnly(referenceFile, reference)
    }
    const manifest = JSON.parse(await readFile(path.join(result.directory, 'manifest.json'), 'utf8'))
    audit.status = verifyOnly ? 'verified' : 'PASS'
    audit.target = { sandboxId: input.sandboxId, databaseName: input.databaseName,
      generation: input.generation, port: cluster.postmaster.port }
    audit.sourceRevision = sourceRevision
    audit.baseline = { baselineId: result.baselineId, manifestSha256: result.manifestSha256,
      stateDigest: result.stateDigest, targetFingerprint: result.targetFingerprint, generation: result.generation,
      businessRelationCount: manifest.database.includedRelations.length,
      repositoryObjectCount: manifest.repository.objects.length, dumpBytes: manifest.databaseDump.bytes }
    audit.provenance = { principalSessionCount: manifest.database.principalSessionCount,
      principalBindingCount: manifest.database.principalBindingCount,
      ownerConnection: manifest.database.ownerConnection, runtimeConnection: manifest.database.runtimeTargetObservation.connection }
    if (manifest.database.principalSessionCount !== 0 || manifest.database.principalBindingCount !== 0) fail('PDM_BASELINE_NOT_EMPTY')
    const sourceFiles = ['scripts/lib/dev126-local-reset-baseline-owner.mjs',
      'scripts/lib/dev126-local-reset-postgres-owner.mjs', 'scripts/lib/dev126-local-reset-runtime-target.mjs']
    audit.sourceSha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async filename => [filename,
      sha256(await readFile(path.join(suite.applications['ai-pdm'].worktree, filename)))])))
    return Object.freeze({ stage: 'pdm-native-baseline', status: audit.status,
      inputDigest: protocol.contractDigest({ sandboxId: input.sandboxId, generation: input.generation,
        fixtureHash: fixture.fixtureHash, sourceRevision }), baselineId: result.baselineId,
      manifestSha256: result.manifestSha256, stateDigest: result.stateDigest,
      targetFingerprint: result.targetFingerprint, sourceRevision,
      principalSessionCount: manifest.database.principalSessionCount,
      principalBindingCount: manifest.database.principalBindingCount })
  } catch (error) {
    audit.status = 'failed'
    audit.failure = { code: error.code ?? error.name,
      stage: error.stage ?? null,
      databaseCode: /^[0-9A-Z]{5}$/u.test(error.cause?.code ?? '') ? error.cause.code : null,
      causeName: error.cause?.name ?? null,
      reason: /^[A-Z_a-z0-9]+$/u.test(error.message ?? '') ? error.message : null }
    throw error
  } finally {
    await admin.end().catch(() => undefined)
    if (!verifyOnly) {
      await writePrivateJsonCreateOnly(path.join(root, 'control', `pdm-baseline-capture-${audit.receiptId}.json`), audit)
    }
  }
}

export async function runDev126LocalPostnativeOwner({ stage, root, taskRoot, verifyOnly = false,
  dependencies = {} }) {
  const runtimeRoot = path.resolve(root ?? '')
  if (!path.isAbsolute(runtimeRoot) || !path.isAbsolute(taskRoot ?? '') || !['business-baseline', 'native-baseline'].includes(stage)) {
    fail('POSTNATIVE_OWNER_ARGUMENTS_INVALID')
  }
  const platformRoot = dependencies.platformRoot
  if (typeof platformRoot !== 'string' || !path.isAbsolute(platformRoot)) fail('PLATFORM_DEPENDENCIES_REQUIRED')
  const platform = dependencies.platform ?? await loadPlatformDependencies(platformRoot)
  const { pg, inspectCluster, readSuite } = platform
  const Client = dependencies.Client ?? pg.Client ?? pg.default?.Client
  if (typeof Client !== 'function') fail('POSTNATIVE_PG_CLIENT_INVALID')
  const suite = await readSuite(runtimeRoot)
  if (!samePath(suite.root, runtimeRoot) || !samePath(suite.applications.platform.worktree, platformRoot) ||
    !samePath(suite.applications['ai-pdm'].worktree, process.cwd())) fail('POSTNATIVE_OWNER_SUITE_MISMATCH')
  if (stage === 'business-baseline') return runBusinessBaseline({ root: runtimeRoot, taskRoot, verifyOnly,
    Client, inspectCluster, readSuite, businessBaselineOwner: dependencies.businessBaselineOwner })
  const ownerTools = dependencies.ownerTools ?? await loadBaselineOwnerTools(suite)
  return runPdmNativeBaseline({ root: runtimeRoot, taskRoot, verifyOnly, Client, pg, inspectCluster, readSuite,
    ...ownerTools, platformRoot, gitHead: dependencies.gitHead ?? gitHead })
}

async function loadPlatformDependencies(platformRoot) {
  const pg = await from(platformRoot, 'node_modules/pg/lib/index.js')
  const clusterModule = await from(platformRoot, 'scripts/lib/dev021-local-postgres-cluster.mjs')
  const suiteModule = await from(platformRoot, 'scripts/lib/dev021-local-principal-suite.mjs')
  return { pg, inspectCluster: clusterModule.inspectLocalPostgresCluster,
    readSuite: suiteModule.readLocalPrincipalSuite }
}

async function loadBaselineOwnerTools(suite) {
  const pdmRoot = suite.applications['ai-pdm'].worktree
  const owner = await from(pdmRoot, 'scripts/lib/dev126-local-reset-postgres-owner.mjs')
  const runtimeTarget = await from(pdmRoot, 'scripts/lib/dev126-local-reset-runtime-target.mjs')
  const baseline = await from(pdmRoot, 'scripts/lib/dev126-local-reset-baseline-owner.mjs')
  return { snapshotOwnerFactory: owner.createDev126LocalPostgresSnapshotOwner,
    runtimeTargetReaderFactory: runtimeTarget.createDev126LocalResetRuntimeTargetReader,
    baselineFunctions: { capture: baseline.captureDev126LocalResetBaseline,
      verify: baseline.verifyDev126LocalResetBaseline } }
}

function gitHead(directory) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return process.platform === 'win32' ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right)
}
