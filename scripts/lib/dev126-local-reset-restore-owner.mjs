import { constants as fsConstants } from 'node:fs'
import { lstat, mkdir, open, realpath, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { spawn as nodeSpawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import pg from 'pg'
import { contractDigest, isLoopbackHost, LocalSandboxError, readLocalSandboxConfig } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import { DEV126_LOCAL_RESET_BASELINE_POLICY as baselinePolicy,
  readDev126LocalResetBaseline } from './dev126-local-reset-baseline-owner.mjs'

const SCHEMA = baselinePolicy.schema
const OWNER_ROLE = baselinePolicy.ownerRole
const CONTROL_RELATIONS = baselinePolicy.controlRelations
const SESSION_RELATION = 'principal_session_records'
const PRESERVED_CONTROL_RELATIONS = Object.freeze([
  'local_native_bootstrap_receipts', 'pdm_workbench_state_authority_control', 'schema_migrations',
])
const FIXED_RESTORE_TIMEOUT_LINES = new Set([
  'SET statement_timeout = 0;',
  'SET lock_timeout = 0;',
  'SET idle_in_transaction_session_timeout = 0;',
  'SET transaction_timeout = 0;',
])
const FIXED_RESTORE_HEADER_LINES = new Set([
  "SET client_encoding = 'UTF8';",
  'SET standard_conforming_strings = on;',
  "SELECT pg_catalog.set_config('search_path', '', false);",
  'SET check_function_bodies = false;',
  'SET xmloption = content;',
  'SET client_min_messages = warning;',
  'SET row_security = off;',
])
const BUSINESS_RELATION_COUNT = 167
const TOTAL_RELATION_COUNT = BUSINESS_RELATION_COUNT + CONTROL_RELATIONS.length
const SCOPED_LOGIN_ROLE = /^local_pdm_seed_[a-f0-9]{16}$/u
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,63}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const HASH = /^[a-f0-9]{64}$/u
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/u
const BASELINE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u
const MARKER_PREFIX = 'jenfu.local-principal-bootstrap.v1:'
const REQUIRED_OFFLINE_APPLICATION_COUNT = 4
const IDENTITY_RELATIONS = Object.freeze(['accounts', 'principal_accounts', 'users'])
const require = createRequire(import.meta.url)
const pgpassHelper = require('pgpass/lib/helper')
const MAX_PGPASSFILE_BYTES = 1024 * 1024
const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024

function fail(code, status = 409) {
  throw new LocalSandboxError(code, status)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function qIdent(value) {
  if (!IDENTIFIER.test(value ?? '')) fail('dev126_reset_restore_relation_invalid')
  return `"${value.replaceAll('"', '""')}"`
}

function generationMarker(scope) {
  return `${MARKER_PREFIX}${scope.sandboxId}:${scope.generation}`
}

function validateScope(scope) {
  if (!exactKeys(scope, ['sandboxId', 'resetId', 'sourceGeneration', 'generation', 'baseline']) ||
    !SANDBOX_ID.test(scope.sandboxId ?? '') || !UUID.test(scope.resetId ?? '') ||
    !UUID.test(scope.sourceGeneration ?? '') || !UUID.test(scope.generation ?? '') ||
    scope.sourceGeneration === scope.generation ||
    !exactKeys(scope.baseline, ['id', 'sha256']) || !BASELINE_ID.test(scope.baseline.id ?? '') ||
    !HASH.test(scope.baseline.sha256 ?? '')) fail('dev126_reset_restore_scope_invalid')
  return Object.freeze({ ...scope, baseline: Object.freeze({ ...scope.baseline }) })
}

function contextFor(targetInput, scope, environment) {
  if (!isRecord(targetInput) || targetInput.sandboxId !== scope.sandboxId ||
    !UUID.test(targetInput.generation ?? '') || targetInput.expectedGeneration !== targetInput.generation ||
    targetInput.expectedNativeSessionContractVersion !== 'jenfu.ai-pdm-session.v2' ||
    !isRecord(targetInput.environment) ||
    ['JENFU_LOCAL_SANDBOX_ROOT', 'PDM_DATA_DIR', 'PDM_REPOSITORY_DIR'].some(name =>
      typeof environment?.[name] !== 'string' || typeof targetInput.environment?.[name] !== 'string')) {
    fail('dev126_reset_restore_target_invalid')
  }
  const config = readLocalSandboxConfig(environment, 'ai-pdm')
  const inputConfig = readLocalSandboxConfig(targetInput.environment, 'ai-pdm')
  let endpoint
  try { endpoint = new URL(config.databaseUrl) } catch { fail('dev126_reset_restore_target_invalid') }
  if (config.sandboxId !== inputConfig.sandboxId || config.databaseName !== inputConfig.databaseName ||
    config.databaseUrl !== inputConfig.databaseUrl || config.runtimeRole !== inputConfig.runtimeRole ||
    config.origin !== inputConfig.origin || config.platformOrigin !== inputConfig.platformOrigin ||
    config.bindHost !== inputConfig.bindHost || config.sandboxId !== scope.sandboxId || config.applicationId !== 'ai-pdm' ||
    config.databaseName !== targetInput.databaseName || !isLoopbackHost(endpoint.hostname) ||
    !samePath(environment.JENFU_LOCAL_SANDBOX_ROOT, targetInput.sandboxRoot) ||
    !samePath(environment.PDM_DATA_DIR, targetInput.dataDirectory) ||
    !samePath(environment.PDM_REPOSITORY_DIR, targetInput.repositoryDirectory) ||
    !samePath(targetInput.environment.JENFU_LOCAL_SANDBOX_ROOT, targetInput.sandboxRoot) ||
    !samePath(targetInput.environment.PDM_DATA_DIR, targetInput.dataDirectory) ||
    !samePath(targetInput.environment.PDM_REPOSITORY_DIR, targetInput.repositoryDirectory) ||
    targetInput.expectedTargetFingerprint !== targetInput.observedTargetFingerprint ||
    !HASH.test(targetInput.expectedTargetFingerprint ?? '') ||
    targetInput.expectedTargetFingerprint !== targetFingerprintForGeneration(targetInput, targetInput.generation)) {
    fail('dev126_reset_restore_target_invalid')
  }
  const targetFingerprint = targetFingerprintForGeneration(targetInput, scope.sourceGeneration)
  return Object.freeze({
    config,
    targetInput,
    expected: Object.freeze({
      databaseName: config.databaseName,
      runtimeRole: config.runtimeRole,
      databaseHost: endpoint.hostname,
      databasePort: endpoint.port ? Number(endpoint.port) : 5432,
      sandboxId: scope.sandboxId,
      sourceGeneration: scope.sourceGeneration,
      generation: scope.generation,
      targetFingerprint,
    }),
  })
}

function validateBaseline(baseline, scope, targetInput) {
  const manifest = baseline?.manifest
  if (!isRecord(baseline) || !isRecord(manifest) || baseline.baselineId !== scope.baseline.id ||
    baseline.manifestSha256 !== scope.baseline.sha256 || baseline.generation !== targetInput.generation ||
    manifest.formatVersion !== 'dev126.local-reset-baseline.v1' || manifest.baselineId !== scope.baseline.id ||
    manifest.target?.sandboxId !== scope.sandboxId || manifest.target?.generation !== targetInput.generation ||
    manifest.target?.targetFingerprint !== targetInput.expectedTargetFingerprint ||
    manifest.target?.databaseName !== targetInput.databaseName || manifest.database?.schema !== SCHEMA ||
    manifest.database?.schemaOwner !== OWNER_ROLE || manifest.database?.dumpFormat !== 'custom-data-only' ||
    !isRecord(manifest.database?.authority) || manifest.database?.principalSessionCount !== 0 ||
    manifest.database?.principalBindingCount !== 0 ||
    !Array.isArray(manifest.database?.relations) || !Array.isArray(manifest.database?.includedRelations) ||
    !Array.isArray(manifest.database?.excludedRelations) || !exactKeys(manifest.repository,
      ['pointers', 'objects', 'contentObjects']) || !Array.isArray(manifest.repository.pointers) ||
    !Array.isArray(manifest.repository.objects) || !Array.isArray(manifest.repository.contentObjects) ||
    !exactKeys(manifest.databaseDump,
      ['file', 'format', 'sha256', 'bytes']) || manifest.databaseDump.file !== 'ai-pdm-core.data.dump' ||
    manifest.databaseDump.format !== 'custom-data-only' || !HASH.test(manifest.databaseDump.sha256 ?? '') ||
    !Number.isSafeInteger(manifest.databaseDump.bytes) || manifest.databaseDump.bytes <= 0 ||
    !SCOPED_LOGIN_ROLE.test(manifest.database.ownerConnection?.sessionUser ?? '')) {
    fail('dev126_reset_restore_baseline_invalid')
  }
  const included = manifest.database.includedRelations
  const relations = manifest.database.relations
  const excluded = [...manifest.database.excludedRelations].sort()
  const expectedExcluded = [...CONTROL_RELATIONS].sort()
  if (included.length !== BUSINESS_RELATION_COUNT || new Set(included).size !== included.length ||
    included.some(name => !IDENTIFIER.test(name) || CONTROL_RELATIONS.includes(name)) ||
    JSON.stringify(excluded) !== JSON.stringify(expectedExcluded) || relations.length !== TOTAL_RELATION_COUNT ||
    relations.some(relation => !isRecord(relation) || !IDENTIFIER.test(relation.name ?? '') ||
      !['r', 'p'].includes(relation.kind) || relation.owner !== OWNER_ROLE ||
      !Number.isSafeInteger(relation.rowCount) || relation.rowCount < 0 || !HASH.test(relation.rowsSha256 ?? '')) ||
    JSON.stringify(relations.map(relation => relation.name).sort()) !==
      JSON.stringify([...included, ...CONTROL_RELATIONS].sort()) ||
    !samePath(manifest.target.sandboxRoot, targetInput.sandboxRoot) ||
    !samePath(manifest.target.dataDirectory, targetInput.dataDirectory) ||
    !samePath(manifest.target.repositoryDirectory, targetInput.repositoryDirectory) ||
    typeof baseline.dataDumpPath !== 'string' || typeof baseline.objectsDirectory !== 'string' ||
    typeof baseline.directory !== 'string') {
    fail('dev126_reset_restore_inventory_invalid')
  }
  const includedByName = new Map(relations.map(relation => [relation.name, relation]))
  if (IDENTITY_RELATIONS.some(name => includedByName.has(name) && includedByName.get(name).rowCount !== 0)) {
    fail('dev126_reset_restore_baseline_identity_data_present')
  }
  const objectsByKey = new Map()
  for (const object of manifest.repository.objects) {
    if (!exactKeys(object, ['key', 'sha256', 'bytes']) || typeof object.key !== 'string' ||
      !HASH.test(object.sha256 ?? '') || !Number.isSafeInteger(object.bytes) || object.bytes < 0) {
      fail('dev126_reset_restore_repository_manifest_invalid')
    }
    normalizeStorageKey(object.key)
    if (objectsByKey.has(object.key)) fail('dev126_reset_restore_repository_manifest_invalid')
    objectsByKey.set(object.key, object)
  }
  const contentObjects = [...new Set(manifest.repository.objects.map(object => object.sha256))].sort()
  if (contentObjects.length !== manifest.repository.contentObjects.length ||
    contentObjects.some((hash, index) => hash !== manifest.repository.contentObjects[index])) {
    fail('dev126_reset_restore_repository_manifest_invalid')
  }
  const pointerIds = new Set()
  const pointerKeys = new Set()
  for (const pointer of manifest.repository.pointers) {
    if (!exactKeys(pointer, ['sourceTable', 'sourceId', 'provider', 'key', 'sha256', 'bytes']) ||
      !baselinePolicy.pointerSources.includes(pointer.sourceTable) || typeof pointer.sourceId !== 'string' ||
      !pointer.sourceId || pointer.sourceId.length > 256 || pointer.provider !== 'local_repository' || typeof pointer.key !== 'string' ||
      !HASH.test(pointer.sha256 ?? '') || !Number.isSafeInteger(pointer.bytes) || pointer.bytes < 0) {
      fail('dev126_reset_restore_repository_manifest_invalid')
    }
    normalizeStorageKey(pointer.key)
    const id = `${pointer.sourceTable}\0${pointer.sourceId}`
    const object = objectsByKey.get(pointer.key)
    if (pointerIds.has(id) || !object || object.sha256 !== pointer.sha256 || object.bytes !== pointer.bytes) {
      fail('dev126_reset_restore_repository_manifest_invalid')
    }
    pointerIds.add(id)
    pointerKeys.add(pointer.key)
  }
  if (pointerKeys.size !== objectsByKey.size) fail('dev126_reset_restore_repository_manifest_invalid')
  return Object.freeze({ manifest, businessRelations: Object.freeze([...included].sort()),
    repositoryObjects: Object.freeze([...manifest.repository.objects].sort((a, b) => a.key.localeCompare(b.key))) })
}

function normalizeStorageKey(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || value !== value.trim() ||
    value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/u.test(value)) {
    fail('dev126_reset_restore_repository_path_invalid')
  }
  const segments = value.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..') || segments.join('/') !== value) {
    fail('dev126_reset_restore_repository_path_invalid')
  }
  return segments
}

function validateFence(value, scope) {
  if (!exactKeys(value, ['sandboxId', 'resetId', 'sourceGeneration', 'generation', 'status',
    'sessionsRevoked', 'registryRetained', 'applicationsOffline']) ||
    value.sandboxId !== scope.sandboxId || value.resetId !== scope.resetId ||
    value.sourceGeneration !== scope.sourceGeneration || value.generation !== scope.generation ||
    value.status !== 'resetting' || value.sessionsRevoked !== true || value.registryRetained !== true ||
    value.applicationsOffline !== true) {
    fail('dev126_reset_restore_generation_fence_invalid', 503)
  }
  return Object.freeze({ ...value })
}

function validateOwnerState(state, context, scope, manifest, { allowMaintenance = false, allowNewGeneration = false } = {}) {
  const expectedGeneration = allowNewGeneration ? scope.generation : scope.sourceGeneration
  const expectedFingerprint = allowNewGeneration
    ? targetFingerprintForGeneration(context.targetInput, scope.generation)
    : context.expected.targetFingerprint
  if (!isRecord(state) || !exactKeys(state, ['identity', 'roles', 'schemaOwner', 'databaseOwner', 'databaseMarker',
    'authority', 'targetMetadata', 'relations', 'sequences', 'principalSessionCount', 'sourceBindings']) ||
    !exactKeys(state.identity, ['databaseName', 'currentUser', 'sessionUser', 'serverAddress', 'serverPort']) ||
    state.identity.databaseName !== context.expected.databaseName || state.identity.currentUser !== OWNER_ROLE ||
    !SCOPED_LOGIN_ROLE.test(state.identity.sessionUser ?? '') || !isLoopbackHost(state.identity.serverAddress) ||
    String(state.identity.serverAddress).toLowerCase().replace(/^\[|\]$/gu, '') !==
      String(context.expected.databaseHost).toLowerCase().replace(/^\[|\]$/gu, '') &&
      context.expected.databaseHost !== 'localhost' || Number(state.identity.serverPort) !== context.expected.databasePort ||
    !exactKeys(state.roles, ['scopedLogin', 'owner', 'runtime']) || state.roles.scopedLogin?.canLogin !== true ||
    state.roles.scopedLogin?.isSuperuser !== false || state.roles.scopedLogin?.canCreateDb !== false ||
    state.roles.scopedLogin?.canCreateRole !== false || state.roles.scopedLogin?.bypassRls !== false ||
    state.roles.scopedLogin?.memberOfOwner !== true || state.roles.owner?.canLogin !== false ||
    state.roles.owner?.isSuperuser !== false || state.roles.owner?.canCreateDb !== false ||
    state.roles.owner?.canCreateRole !== false || state.roles.owner?.bypassRls !== false ||
    state.roles.owner?.memberOfOwner !== true ||
    state.roles.runtime?.name !== context.expected.runtimeRole || state.roles.runtime?.canLogin !== true ||
    state.roles.runtime?.isSuperuser !== false || state.roles.runtime?.canCreateDb !== false ||
    state.roles.runtime?.canCreateRole !== false || state.roles.runtime?.bypassRls !== false ||
    state.roles.runtime?.memberOfOwner !== false ||
    state.schemaOwner !== OWNER_ROLE || state.databaseMarker !== generationMarker(scope) ||
    !sameAuthority(state.authority, manifest.database.authority) ||
    !exactKeys(state.targetMetadata, ['applicationId', 'sandboxId', 'databaseName', 'sandboxRoot', 'dataDirectory',
      'repositoryDirectory', 'generation', 'fixtureVersion', 'fixtureHash', 'nativeSessionContractVersion',
      'targetFingerprint', 'status']) || state.targetMetadata.applicationId !== 'ai-pdm' ||
    state.targetMetadata.sandboxId !== scope.sandboxId || state.targetMetadata.databaseName !== context.expected.databaseName ||
    state.targetMetadata.generation !== expectedGeneration || state.targetMetadata.targetFingerprint !== expectedFingerprint ||
    !(state.targetMetadata.status === 'ready' || (allowMaintenance && state.targetMetadata.status === 'maintenance')) ||
    !samePath(state.targetMetadata.sandboxRoot, manifest.target.sandboxRoot) ||
    !samePath(state.targetMetadata.dataDirectory, manifest.target.dataDirectory) ||
    !samePath(state.targetMetadata.repositoryDirectory, manifest.target.repositoryDirectory) ||
    state.targetMetadata.fixtureVersion !== manifest.target.fixtureVersion ||
    state.targetMetadata.fixtureHash !== manifest.target.fixtureHash ||
    state.targetMetadata.nativeSessionContractVersion !== 'jenfu.ai-pdm-session.v2' ||
    !Array.isArray(state.relations) || !Array.isArray(state.sequences) ||
    !Number.isSafeInteger(state.principalSessionCount) || state.principalSessionCount < 0 ||
    !Array.isArray(state.sourceBindings)) fail('dev126_reset_restore_owner_state_invalid', 503)

  const expectedRows = manifest.database.relations.map(relation => ({
    name: relation.name, kind: relation.kind, owner: relation.owner,
  })).sort((a, b) => a.name.localeCompare(b.name))
  const observedRows = state.relations.map(relation => ({
    name: relation.name, kind: relation.kind, owner: relation.owner,
  })).sort((a, b) => a.name.localeCompare(b.name))
  if (JSON.stringify(observedRows) !== JSON.stringify(expectedRows) ||
    state.relations.length !== TOTAL_RELATION_COUNT ||
    state.relations.some(relation => relation.owner !== OWNER_ROLE || !['r', 'p'].includes(relation.kind))) {
    fail('dev126_reset_restore_inventory_drift', 503)
  }
  const businessSet = new Set(manifest.database.includedRelations)
  if (state.sequences.some(sequence => !isRecord(sequence) || !IDENTIFIER.test(sequence.name ?? '') ||
    !IDENTIFIER.test(sequence.ownedTable ?? '') || !businessSet.has(sequence.ownedTable) ||
    sequence.owner !== OWNER_ROLE)) fail('dev126_reset_restore_sequence_invalid', 503)
  for (const binding of state.sourceBindings) {
    if (!isRecord(binding) || !['pending_central_registration', 'central_registered', 'revoked'].includes(binding.status) ||
      (binding.status === 'central_registered' && (!binding.centralCorrelationId || !binding.centralRegistrationObservedAt)) ||
      (binding.status === 'revoked' && (!binding.centralCorrelationId || !binding.centralRegistrationObservedAt))) {
      fail('dev126_reset_restore_binding_invalid', 503)
    }
  }
  return state
}

function sameAuthority(left, right) {
  const keys = ['mode', 'expectedCommit', 'schemaHash', 'rowVersion', 'switchedAt']
  return exactKeys(left, keys) && exactKeys(right, keys) && keys.every(key => left[key] === right[key])
}

function targetFingerprintForGeneration(target, generation) {
  return contractDigest({
    applicationId: 'ai-pdm', sandboxId: target.sandboxId, databaseName: target.databaseName,
    sandboxRoot: path.resolve(target.sandboxRoot), dataDirectory: path.resolve(target.dataDirectory),
    repositoryDirectory: path.resolve(target.repositoryDirectory), generation,
    fixtureVersion: target.expectedFixtureVersion, fixtureHash: target.expectedFixtureHash,
    nativeSessionContractVersion: target.expectedNativeSessionContractVersion,
  })
}

function validateArchiveToc(text, businessRelations, sequences) {
  if (typeof text !== 'string' || text.length === 0) fail('dev126_reset_restore_archive_toc_invalid')
  const tableData = []
  const sequenceSet = []
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || line.startsWith(';')) continue
    const match = line.match(/^\s*\d+;\s+\d+\s+\d+\s+(TABLE DATA|SEQUENCE SET)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/u)
    if (!match) fail('dev126_reset_restore_archive_toc_closed_set_violation')
    const [, kind, schema, name, owner] = match
    if (schema !== SCHEMA || !IDENTIFIER.test(name) || owner !== OWNER_ROLE) {
      fail('dev126_reset_restore_archive_toc_closed_set_violation')
    }
    if (kind === 'TABLE DATA') tableData.push(name)
    else sequenceSet.push(name)
  }
  const sortedBusiness = [...businessRelations].sort()
  const sortedTables = [...tableData].sort()
  const sortedSequences = [...sequences.map(sequence => sequence.name)].sort()
  if (new Set(tableData).size !== tableData.length || JSON.stringify(sortedTables) !== JSON.stringify(sortedBusiness) ||
    new Set(sequenceSet).size !== sequenceSet.length || JSON.stringify([...sequenceSet].sort()) !== JSON.stringify(sortedSequences)) {
    fail('dev126_reset_restore_archive_toc_closed_set_violation')
  }
  return Object.freeze({ tableData: Object.freeze(sortedTables), sequenceSet: Object.freeze([...sequenceSet].sort()) })
}

function buildRestoreSql({ restoreSql, businessRelations, sequences, scope }) {
  if (typeof restoreSql !== 'string' || restoreSql.length === 0) fail('dev126_reset_restore_sql_invalid')
  const tableSet = new Set(businessRelations)
  const copyTargets = []
  const sequenceTargets = []
  const bodyLines = []
  const seenHeaderLines = new Set()
  let inCopy = false
  let sawRestoreData = false
  let restrictKey
  let unrestrictSeen = false
  for (const line of restoreSql.split(/\r?\n/u)) {
    if (inCopy) {
      bodyLines.push(line)
      if (line === '\\.') inCopy = false
      continue
    }
    if (!line.trim() || line.startsWith('--')) {
      bodyLines.push(line)
      continue
    }
    const restrict = line.match(/^\\restrict ([A-Za-z0-9_-]{1,128})$/u)
    if (restrict) {
      if (restrictKey || unrestrictSeen || seenHeaderLines.size || copyTargets.length || sequenceTargets.length) {
        fail('dev126_reset_restore_sql_invalid')
      }
      restrictKey = restrict[1]
      continue
    }
    const unrestrict = line.match(/^\\unrestrict ([A-Za-z0-9_-]{1,128})$/u)
    if (unrestrict) {
      if (!restrictKey || unrestrictSeen || unrestrict[1] !== restrictKey) {
        fail('dev126_reset_restore_sql_invalid')
      }
      unrestrictSeen = true
      continue
    }
    if (unrestrictSeen || line.startsWith('\\')) fail('dev126_reset_restore_sql_invalid')
    const copy = line.match(/^COPY\s+ai_pdm_core\.([a-z][a-z0-9_]*)\s+\(.+\)\s+FROM stdin;\s*$/u)
    if (copy) {
      if (!tableSet.has(copy[1])) fail('dev126_reset_restore_sql_closed_set_violation')
      copyTargets.push(copy[1])
      bodyLines.push(line)
      sawRestoreData = true
      inCopy = true
      continue
    }
    if (/^SELECT\s+pg_catalog\.setval\('ai_pdm_core\.([a-z][a-z0-9_]*)',\s*\d+,\s*(?:true|false)\);\s*$/u.test(line)) {
      const match = line.match(/^SELECT\s+pg_catalog\.setval\('ai_pdm_core\.([a-z][a-z0-9_]*)',/u)
      sequenceTargets.push(match[1])
      bodyLines.push(line)
      sawRestoreData = true
      continue
    }
    if (FIXED_RESTORE_TIMEOUT_LINES.has(line) || FIXED_RESTORE_HEADER_LINES.has(line)) {
      if (sawRestoreData || seenHeaderLines.has(line)) fail('dev126_reset_restore_sql_invalid')
      seenHeaderLines.add(line)
      continue
    }
    fail('dev126_reset_restore_sql_closed_set_violation')
  }
  const expectedSequences = [...sequences.map(sequence => sequence.name)].sort()
  if (inCopy || Boolean(restrictKey) !== unrestrictSeen ||
    copyTargets.length !== businessRelations.length || new Set(copyTargets).size !== copyTargets.length ||
    JSON.stringify([...new Set(copyTargets)].sort()) !== JSON.stringify([...businessRelations].sort()) ||
    new Set(sequenceTargets).size !== sequenceTargets.length ||
    JSON.stringify([...sequenceTargets].sort()) !== JSON.stringify(expectedSequences)) {
    fail('dev126_reset_restore_sql_closed_set_violation')
  }
  const triggerDisable = businessRelations.map(name => `ALTER TABLE ${SCHEMA}.${qIdent(name)} DISABLE TRIGGER USER;`).join('\n')
  const triggerEnable = businessRelations.map(name => `ALTER TABLE ${SCHEMA}.${qIdent(name)} ENABLE TRIGGER USER;`).join('\n')
  const truncate = [...businessRelations.map(name => `${SCHEMA}.${qIdent(name)}`), `${SCHEMA}.${qIdent(SESSION_RELATION)}`]
    .join(',\n  ')
  return [
    `SET LOCAL ROLE ${OWNER_ROLE};`,
    'SET LOCAL search_path = pg_catalog;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '900000';",
    `LOCK TABLE ${SCHEMA}.local_sandbox_target_metadata, ${SCHEMA}.local_sandbox_principal_session_bindings IN ACCESS EXCLUSIVE MODE;`,
    `DO $dev126_preflight$ BEGIN\n` +
      `  IF NOT EXISTS (SELECT 1 FROM ${SCHEMA}.local_sandbox_target_metadata ` +
      `WHERE application_id='ai-pdm' AND sandbox_id='${scope.sandboxId}' ` +
      `AND generation='${scope.sourceGeneration}'::uuid AND status='maintenance') THEN\n` +
      `    RAISE EXCEPTION 'DEV126_TARGET_GENERATION_CHANGED';\n` +
      `  END IF;\n` +
      `  IF EXISTS (SELECT 1 FROM ${SCHEMA}.local_sandbox_principal_session_bindings ` +
      `WHERE sandbox_id='${scope.sandboxId}' AND generation='${scope.sourceGeneration}'::uuid ` +
      `AND status='pending_central_registration') THEN\n` +
      `    RAISE EXCEPTION 'DEV126_PENDING_CENTRAL_REGISTRATION';\n` +
      `  END IF;\n` +
      `END $dev126_preflight$;`,
    `TRUNCATE TABLE\n  ${truncate}\nRESTRICT;`,
    triggerDisable,
    bodyLines.join('\n').trimEnd(),
    triggerEnable,
    `UPDATE ${SCHEMA}.local_sandbox_principal_session_bindings\n` +
      `SET status = 'revoked'\n` +
      `WHERE sandbox_id = '${scope.sandboxId}' AND generation = '${scope.sourceGeneration}'::uuid ` +
      `AND status = 'central_registered';`,
  ].join('\n\n') + '\n'
}

function runChild(spawn, executable, args, env, { captureStdout = false, timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    let child
    let settled = false
    let timedOut = false
    let outputTooLarge = false
    let size = 0
    const chunks = []
    let killTimer
    const timeout = setTimeout(() => {
      timedOut = true
      stopChild()
    }, timeoutMs)
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(killTimer)
      fn(value)
    }
    const stopChild = () => {
      try { child?.kill?.('SIGTERM') } catch {}
      if (!killTimer) killTimer = setTimeout(() => { try { child?.kill?.('SIGKILL') } catch {} }, 2000)
    }
    try {
      child = spawn(executable, args, { shell: false, windowsHide: true, env,
        stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      finish(reject, new Error('DEV126_LOCAL_RESET_CHILD_START_FAILED'))
      return
    }
    child.stdout?.on('data', chunk => {
      if (!captureStdout) return
      const bytes = Buffer.from(chunk)
      size += bytes.byteLength
      if (size > MAX_CHILD_OUTPUT_BYTES) {
        outputTooLarge = true
        stopChild()
        return
      }
      chunks.push(bytes)
    })
    child.stderr?.on('data', () => {})
    child.once('error', () => finish(reject, new Error('DEV126_LOCAL_RESET_CHILD_START_FAILED')))
    child.once('close', code => {
      clearTimeout(killTimer)
      if (timedOut) finish(reject, new Error('DEV126_LOCAL_RESET_CHILD_TIMEOUT'))
      else if (outputTooLarge) finish(reject, new Error('DEV126_LOCAL_RESET_CHILD_OUTPUT_TOO_LARGE'))
      else finish(resolve, Object.freeze({
        code, stdout: captureStdout ? Buffer.concat(chunks, size).toString('utf8') : '',
      }))
    })
  })
}

function childEnvironment(environment, expected, ownerLogin, ownerPassword) {
  const output = {}
  for (const name of ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA']) {
    const actual = Object.keys(environment).find(key => key.toLowerCase() === name.toLowerCase())
    if (actual && typeof environment[actual] === 'string') output[name] = environment[actual]
  }
  Object.assign(output, {
    PGUSER: ownerLogin, PGPASSWORD: ownerPassword, PGHOST: expected.databaseHost,
    PGPORT: String(expected.databasePort), PGDATABASE: expected.databaseName,
    PGSSLMODE: 'disable', PGAPPNAME: 'ai-pdm-dev126-reset-restore',
  })
  return output
}

async function assertRegularFile(filePath, code) {
  const stat = await lstat(filePath).catch(() => fail(code))
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) fail(code)
  const resolved = await realpath(filePath).catch(() => fail(code))
  if (!samePath(resolved, filePath)) fail(code)
  return stat
}

async function validatedChildFilePath(filePath, parentDirectory, code, { output = false } = {}) {
  const parent = path.resolve(parentDirectory)
  const absoluteFilePath = path.resolve(filePath)
  const parentStat = await lstat(parent).catch(() => fail(code))
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() ||
    !samePath(await realpath(parent).catch(() => fail(code)), parent) ||
    !samePath(path.dirname(absoluteFilePath), parent)) fail(code)
  if (output) {
    const existing = await lstat(absoluteFilePath).catch(error => {
      if (error?.code === 'ENOENT') return null
      fail(code)
    })
    if (existing) fail(code)
  } else {
    await assertRegularFile(absoluteFilePath, code)
  }
  return process.platform === 'win32' ? path.toNamespacedPath(absoluteFilePath) : absoluteFilePath
}

async function copyVerifiedArchive(descriptor, targetInput, manifest, destination) {
  const baselineDirectory = path.resolve(descriptor.directory)
  const sandboxRoot = path.resolve(targetInput.sandboxRoot)
  const expectedDirectory = path.join(sandboxRoot, 'control', 'dev126-reset-baselines', descriptor.baselineId)
  if (!samePath(baselineDirectory, expectedDirectory) || !isWithin(sandboxRoot, baselineDirectory) ||
    !samePath(descriptor.dataDumpPath, path.join(baselineDirectory, 'ai-pdm-core.data.dump'))) {
    fail('dev126_reset_restore_archive_path_invalid')
  }
  const directoryStat = await lstat(baselineDirectory).catch(() => fail('dev126_reset_restore_archive_path_invalid'))
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('dev126_reset_restore_archive_path_invalid')
  const resolvedDirectory = await realpath(baselineDirectory).catch(() => fail('dev126_reset_restore_archive_path_invalid'))
  if (!samePath(resolvedDirectory, baselineDirectory)) fail('dev126_reset_restore_archive_path_invalid')
  const archivePath = path.resolve(descriptor.dataDumpPath)
  const stat = await assertRegularFile(archivePath, 'dev126_reset_restore_archive_path_invalid')
  if (!isWithin(baselineDirectory, archivePath) || stat.size !== manifest.databaseDump.bytes) {
    fail('dev126_reset_restore_archive_invalid')
  }
  let handle
  try {
    handle = await open(archivePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== stat.dev || opened.ino !== stat.ino ||
      opened.size !== stat.size) fail('dev126_reset_restore_archive_path_invalid')
    const digest = createHash('sha256')
    let bytesRead = 0
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      bytesRead += chunk.byteLength
      digest.update(chunk)
      callback(null, chunk)
    } })
    await pipeline(handle.createReadStream({ autoClose: false }), meter,
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
    const after = await handle.stat()
    const destStat = await assertRegularFile(destination, 'dev126_reset_restore_archive_path_invalid')
    if (bytesRead !== manifest.databaseDump.bytes || after.size !== opened.size || destStat.size !== bytesRead ||
      digest.digest('hex') !== manifest.databaseDump.sha256) {
      fail('dev126_reset_restore_archive_hash_mismatch')
    }
    return destination
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function createWorkDirectory(sandboxRoot, scope) {
  const controlRoot = path.join(path.resolve(sandboxRoot), 'control')
  const controlStat = await lstat(controlRoot).catch(() => fail('dev126_reset_restore_workdir_invalid'))
  if (!controlStat.isDirectory() || controlStat.isSymbolicLink() ||
    !samePath(await realpath(controlRoot), controlRoot)) fail('dev126_reset_restore_workdir_invalid')
  const workRoot = path.join(controlRoot, 'dev126-reset-restore-work')
  try { await mkdir(workRoot, { mode: 0o700 }) } catch (error) { if (error?.code !== 'EEXIST') fail('dev126_reset_restore_workdir_invalid') }
  const workStat = await lstat(workRoot).catch(() => fail('dev126_reset_restore_workdir_invalid'))
  if (!workStat.isDirectory() || workStat.isSymbolicLink() || !samePath(await realpath(workRoot), workRoot)) {
    fail('dev126_reset_restore_workdir_invalid')
  }
  const taskDirectory = path.join(workRoot, scope.resetId)
  let created = false
  try { await mkdir(taskDirectory, { mode: 0o700 }); created = true }
  catch (error) { if (error?.code !== 'EEXIST') fail('dev126_reset_restore_workdir_invalid') }
  const taskStat = await lstat(taskDirectory).catch(() => fail('dev126_reset_restore_workdir_invalid'))
  if (!taskStat.isDirectory() || taskStat.isSymbolicLink() || !samePath(await realpath(taskDirectory), taskDirectory)) {
    fail('dev126_reset_restore_workdir_invalid')
  }
  const receiptPath = path.join(taskDirectory, 'work.json')
  const receipt = JSON.stringify({ contractVersion: 'dev126.local-reset-restore-work.v1', resetId: scope.resetId,
    sandboxId: scope.sandboxId, sourceGeneration: scope.sourceGeneration, generation: scope.generation,
    baselineId: scope.baseline.id, baselineSha256: scope.baseline.sha256 })
  if (created) await writeFile(receiptPath, receipt, { mode: 0o600, flag: 'wx' })
  else {
    await assertRegularFile(receiptPath, 'dev126_reset_restore_workdir_invalid')
    if (await readFile(receiptPath, 'utf8').catch(() => '') !== receipt) fail('dev126_reset_restore_workdir_invalid')
  }
  const allowed = new Set(['work.json', 'pinned.data.dump', 'restore-data.sql', 'restore-transaction.sql',
    'repository-stage', 'repository-backup'])
  const entries = await readdir(taskDirectory, { withFileTypes: true })
  if (entries.some(entry => !allowed.has(entry.name))) fail('dev126_reset_restore_workdir_invalid')
  return Object.freeze({ workRoot, taskDirectory })
}

async function safeTreeEntries(root, errorCode) {
  const rootStat = await lstat(root).catch(error => error?.code === 'ENOENT' ? null : fail(errorCode))
  if (!rootStat) return null
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !samePath(await realpath(root), root)) fail(errorCode)
  const files = new Map()
  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.name || entry.name === '.' || entry.name === '..' || entry.name.includes('/') || entry.name.includes('\\')) {
        fail(errorCode)
      }
      const absolute = path.join(directory, entry.name)
      const stat = await lstat(absolute).catch(() => fail(errorCode))
      if (stat.isSymbolicLink()) fail(errorCode)
      const real = await realpath(absolute).catch(() => fail(errorCode))
      if (!isWithin(root, real)) fail(errorCode)
      const key = prefix ? `${prefix}/${entry.name}` : entry.name
      if (stat.isDirectory()) await visit(absolute, key)
      else if (stat.isFile() && stat.nlink <= 1) files.set(key, absolute)
      else fail(errorCode)
    }
  }
  await visit(root, '')
  return files
}

async function fileMatches(filePath, root, expectedHash, expectedBytes, errorCode) {
  const stat = await lstat(filePath).catch(error => error?.code === 'ENOENT' ? null : fail(errorCode))
  if (!stat) return false
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size !== expectedBytes) fail(errorCode)
  const real = await realpath(filePath).catch(() => fail(errorCode))
  if (!isWithin(root, real)) fail(errorCode)
  let handle
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== stat.dev || opened.ino !== stat.ino ||
      opened.size !== stat.size) fail(errorCode)
    const digest = createHash('sha256')
    let bytes = 0
    await pipeline(handle.createReadStream({ autoClose: false }), new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.byteLength
      digest.update(chunk)
      callback(null, chunk)
    } }), new Writable({ write(_chunk, _encoding, callback) { callback() } }))
    const after = await handle.stat()
    return after.size === bytes && bytes === expectedBytes && digest.digest('hex') === expectedHash
  } finally { await handle?.close().catch(() => {}) }
}

async function repositoryMatches(repositoryDirectory, objects) {
  const root = path.resolve(repositoryDirectory)
  const files = await safeTreeEntries(root, 'dev126_reset_restore_repository_path_invalid')
  if (!files) return false
  const keys = objects.map(object => object.key).sort()
  if (files.size !== keys.length || [...files.keys()].sort().some((key, index) => key !== keys[index])) return false
  for (const object of objects) {
    if (!await fileMatches(files.get(object.key), root, object.sha256, object.bytes,
      'dev126_reset_restore_repository_file_invalid')) return false
  }
  return true
}

async function ensureStageDirectory(stageRoot, keySegments) {
  let current = stageRoot
  for (const segment of keySegments) {
    current = path.join(current, segment)
    try { await mkdir(current, { mode: 0o700 }) } catch (error) { if (error?.code !== 'EEXIST') fail('dev126_reset_restore_repository_stage_failed', 503) }
    const stat = await lstat(current).catch(() => fail('dev126_reset_restore_repository_stage_failed', 503))
    if (!stat.isDirectory() || stat.isSymbolicLink() || !isWithin(stageRoot, await realpath(current))) {
      fail('dev126_reset_restore_repository_stage_failed', 503)
    }
  }
  return current
}

async function copyVerifiedObject(sourceRoot, object, destination) {
  const sourcePath = path.join(sourceRoot, object.sha256)
  const sourceStat = await lstat(sourcePath).catch(() => fail('dev126_reset_restore_repository_object_invalid'))
  const sourceReal = await realpath(sourcePath).catch(() => fail('dev126_reset_restore_repository_object_invalid'))
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.nlink > 1 ||
    !isWithin(sourceRoot, sourceReal) || sourceStat.size !== object.bytes) {
    fail('dev126_reset_restore_repository_object_invalid')
  }
  let source
  try {
    source = await open(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const opened = await source.stat()
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== sourceStat.dev || opened.ino !== sourceStat.ino ||
      opened.size !== sourceStat.size) fail('dev126_reset_restore_repository_object_invalid')
    const digest = createHash('sha256')
    let bytes = 0
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.byteLength
      digest.update(chunk)
      callback(null, chunk)
    } })
    await pipeline(source.createReadStream({ autoClose: false }), meter,
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
    if (bytes !== object.bytes || digest.digest('hex') !== object.sha256) {
      fail('dev126_reset_restore_repository_object_hash_mismatch')
    }
  } finally { await source?.close().catch(() => {}) }
}

async function removeOwnedDirectory(directory, parent) {
  if (path.dirname(directory) !== parent || !isWithin(parent, directory)) fail('dev126_reset_restore_cleanup_invalid', 503)
  const files = await safeTreeEntries(directory, 'dev126_reset_restore_cleanup_invalid')
  if (files === null) return
  await rm(directory, { recursive: true, force: false })
}

async function prepareRepositoryStage(loaded, work) {
  const objectsRoot = path.resolve(loaded.baseline.objectsDirectory)
  if (!samePath(objectsRoot, path.join(path.resolve(loaded.baseline.directory), 'objects'))) {
    fail('dev126_reset_restore_repository_path_invalid')
  }
  const objectStat = await lstat(objectsRoot).catch(() => fail('dev126_reset_restore_repository_path_invalid'))
  if (!objectStat.isDirectory() || objectStat.isSymbolicLink() || !samePath(await realpath(objectsRoot), objectsRoot)) {
    fail('dev126_reset_restore_repository_path_invalid')
  }
  const stage = path.join(work.taskDirectory, 'repository-stage')
  const existing = await safeTreeEntries(stage, 'dev126_reset_restore_repository_stage_failed')
  if (existing) {
    if (await repositoryMatches(stage, loaded.repositoryObjects)) return stage
    fail('dev126_reset_restore_repository_stage_conflict')
  }
  await mkdir(stage, { mode: 0o700 })
  for (const object of loaded.repositoryObjects) {
    const segments = normalizeStorageKey(object.key)
    const parent = await ensureStageDirectory(stage, segments.slice(0, -1))
    await copyVerifiedObject(objectsRoot, object, path.join(parent, segments.at(-1)))
  }
  if (!await repositoryMatches(stage, loaded.repositoryObjects)) fail('dev126_reset_restore_repository_stage_readback_failed', 503)
  return stage
}

async function restoreRepositoryBaseline(loaded, work) {
  const repository = path.resolve(loaded.context.targetInput.repositoryDirectory)
  if (!samePath(repository, loaded.manifest.target.repositoryDirectory)) fail('dev126_reset_restore_repository_path_invalid')
  const stage = await prepareRepositoryStage(loaded, work)
  const backup = path.join(work.taskDirectory, 'repository-backup')
  const backupFiles = await safeTreeEntries(backup, 'dev126_reset_restore_repository_backup_invalid')
  const repositoryExists = await lstat(repository).then(() => true, error => error?.code === 'ENOENT' ? false : fail('dev126_reset_restore_repository_path_invalid'))
  if (repositoryExists && await repositoryMatches(repository, loaded.repositoryObjects)) {
    if (backupFiles) await removeOwnedDirectory(backup, work.taskDirectory)
    if (await safeTreeEntries(stage, 'dev126_reset_restore_repository_stage_failed')) {
      await removeOwnedDirectory(stage, work.taskDirectory)
    }
    return Object.freeze({ restored: true, objectCount: loaded.repositoryObjects.length })
  }
  if (backupFiles && repositoryExists) fail('dev126_reset_restore_repository_swap_ambiguous', 503)
  if (repositoryExists && !backupFiles) {
    await rename(repository, backup)
  }
  try {
    await rename(stage, repository)
    if (!await repositoryMatches(repository, loaded.repositoryObjects)) {
      fail('dev126_reset_restore_repository_swap_readback_failed', 503)
    }
  } catch (error) {
    const currentRepo = await lstat(repository).then(() => true, () => false)
    const currentStage = await lstat(stage).then(() => true, () => false)
    if (currentRepo && !currentStage) {
      try { await rename(repository, stage) } catch { fail('dev126_reset_restore_repository_rollback_failed', 503) }
    }
    const restoredRepo = await lstat(repository).then(() => true, () => false)
    if (!restoredRepo && backupFiles || !restoredRepo && repositoryExists) {
      try { await rename(backup, repository) } catch { fail('dev126_reset_restore_repository_rollback_failed', 503) }
    }
    throw error
  }
  if (backupFiles || repositoryExists) await removeOwnedDirectory(backup, work.taskDirectory)
  return Object.freeze({ restored: true, objectCount: loaded.repositoryObjects.length })
}

async function cleanupWorkDirectory(work) {
  if (!work?.workRoot || !work?.taskDirectory || !isWithin(work.workRoot, work.taskDirectory) ||
    path.dirname(work.taskDirectory) !== work.workRoot) return
  const stat = await lstat(work.taskDirectory).catch(() => null)
  if (!stat) return
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await realpath(work.taskDirectory), work.taskDirectory)) {
    fail('dev126_reset_restore_cleanup_invalid', 503)
  }
  const entries = await readdir(work.taskDirectory, { withFileTypes: true })
  const allowed = new Set(['work.json', 'pinned.data.dump', 'restore-data.sql', 'restore-transaction.sql',
    'repository-stage', 'repository-backup'])
  if (entries.some(entry => !allowed.has(entry.name))) fail('dev126_reset_restore_cleanup_invalid', 503)
  await safeTreeEntries(work.taskDirectory, 'dev126_reset_restore_cleanup_invalid')
  await rm(work.taskDirectory, { recursive: true, force: false })
}

async function removeTaskFileIfPresent(directory, name) {
  if (!['pinned.data.dump', 'restore-data.sql', 'restore-transaction.sql'].includes(name)) {
    fail('dev126_reset_restore_cleanup_invalid', 503)
  }
  const target = path.join(directory, name)
  const stat = await lstat(target).catch(error => error?.code === 'ENOENT' ? null : fail('dev126_reset_restore_cleanup_invalid', 503))
  if (!stat) return
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || !samePath(await realpath(target), target)) {
    fail('dev126_reset_restore_cleanup_invalid', 503)
  }
  await unlink(target)
}

function rowsFrom(result, code) {
  if (!result || !Array.isArray(result.rows)) fail(code, 503)
  return result.rows
}

function oneRow(result, code) {
  const rows = rowsFrom(result, code)
  if (rows.length !== 1) fail(code, 503)
  return rows[0]
}

function pgpassEntryMatches(entry, connection) {
  return pgpassHelper.isValidEntry(entry) && pgpassHelper.match(connection, entry) &&
    entry.host === connection.host && String(entry.port) === String(connection.port) &&
    entry.database === connection.database && entry.user === connection.user
}

async function readExactPgpass(passfile, connection) {
  if (typeof passfile !== 'string' || !path.isAbsolute(passfile) || passfile.includes('\0')) {
    fail('dev126_reset_restore_credentials_invalid', 503)
  }
  const absolute = path.resolve(passfile)
  const stat = await lstat(absolute).catch(() => fail('dev126_reset_restore_credentials_invalid', 503))
  const resolved = await realpath(absolute).catch(() => fail('dev126_reset_restore_credentials_invalid', 503))
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || !samePath(absolute, resolved) ||
    stat.size > MAX_PGPASSFILE_BYTES || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    fail('dev126_reset_restore_credentials_invalid', 503)
  }
  let handle
  try {
    handle = await open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== stat.dev || opened.ino !== stat.ino ||
      opened.size !== stat.size || opened.size > MAX_PGPASSFILE_BYTES ||
      (process.platform !== 'win32' && (opened.mode & 0o077) !== 0)) fail('dev126_reset_restore_credentials_invalid', 503)
    const bytes = await handle.readFile()
    if (bytes.includes(0) || bytes.byteLength !== opened.size) fail('dev126_reset_restore_credentials_invalid', 503)
    const matches = bytes.toString('utf8').split(/\r?\n/u).map(line => pgpassHelper.parseLine(line))
      .filter(entry => entry && pgpassEntryMatches(entry, connection))
    if (matches.length !== 1) fail('dev126_reset_restore_credentials_no_exact_match', 503)
    return matches[0].password
  } finally { await handle?.close().catch(() => {}) }
}

function passwordResolver(environment, expected, ownerLogin) {
  const exact = Object.freeze({ host: expected.databaseHost, port: expected.databasePort,
    database: expected.databaseName, user: ownerLogin })
  let value
  return async parameters => {
    if (!parameters || parameters.host !== exact.host || Number(parameters.port) !== exact.port ||
      parameters.database !== exact.database || parameters.user !== exact.user) {
      fail('dev126_reset_restore_credentials_target_mismatch', 503)
    }
    if (!value) value = typeof environment.PGPASSWORD === 'string' && environment.PGPASSWORD.length > 0
      ? Promise.resolve(environment.PGPASSWORD) : readExactPgpass(environment.PGPASSFILE, exact)
    return value
  }
}

function expectedFromContext(context, ownerLogin) {
  return Object.freeze({ ...context.expected, ownerLogin })
}

function roleProjection(row) {
  return Object.freeze({ name: row.rolname, canLogin: row.rolcanlogin, isSuperuser: row.rolsuper,
    canCreateDb: row.rolcreatedb, canCreateRole: row.rolcreaterole, bypassRls: row.rolbypassrls,
    memberOfOwner: row.member_of_owner === true })
}

function createPostgresOwnerAdapter({ Pool, environment }) {
  async function withOwner({ context, scope, manifest, readOnly, readBusiness = false, operation }) {
    const ownerLogin = environment.PGUSER
    if (!SCOPED_LOGIN_ROLE.test(ownerLogin ?? '') ||
      !(typeof environment.PGPASSWORD === 'string' && environment.PGPASSWORD.length > 0) &&
      !(typeof environment.PGPASSFILE === 'string' && environment.PGPASSFILE.length > 0)) {
      fail('dev126_reset_restore_owner_login_invalid', 503)
    }
    const expected = expectedFromContext(context, ownerLogin)
    const pool = new Pool({ host: expected.databaseHost, port: expected.databasePort,
      database: expected.databaseName, user: ownerLogin, password: passwordResolver(environment, expected, ownerLogin),
      ssl: false, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000,
      query_timeout: 125000, options: '-c timezone=UTC -c datestyle=ISO,YMD -c search_path=pg_catalog',
      application_name: 'ai-pdm-dev126-reset-restore-owner' })
    let client
    try {
      client = await pool.connect()
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
      const initial = oneRow(await client.query(`
        SELECT current_database() AS database_name,current_user AS current_user,session_user AS session_user,
          pg_catalog.host(inet_server_addr()) AS server_address,inet_server_port() AS server_port
      `), 'dev126_reset_restore_connection_invalid')
      if (initial.database_name !== expected.databaseName || initial.current_user !== ownerLogin ||
        initial.session_user !== ownerLogin || !isLoopbackHost(initial.server_address) ||
        Number(initial.server_port) !== expected.databasePort) fail('dev126_reset_restore_connection_invalid', 503)
      await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`)
      const identity = oneRow(await client.query(`
        SELECT current_database() AS database_name,current_user AS current_user,session_user AS session_user,
          pg_catalog.host(inet_server_addr()) AS server_address,inet_server_port() AS server_port
      `), 'dev126_reset_restore_connection_invalid')
      if (identity.current_user !== OWNER_ROLE || identity.session_user !== ownerLogin) {
        fail('dev126_reset_restore_role_switch_invalid', 503)
      }
      const state = await loadOwnerState(client, context, scope, manifest, expected, identity, { readBusiness })
      const value = await operation(state, client, expected)
      await client.query('COMMIT')
      return value ?? state
    } catch (error) {
      try { await client?.query('ROLLBACK') } catch {}
      if (error instanceof LocalSandboxError) throw error
      throw new LocalSandboxError('dev126_reset_restore_owner_operation_failed', 503)
    } finally {
      try { client?.release?.() } catch {}
      try { await pool.end() } catch {}
    }
  }

  async function loadOwnerState(client, context, scope, manifest, expected, identity, { readBusiness }) {
    const rolesRows = rowsFrom(await client.query(`
      SELECT role.rolname,role.rolcanlogin,role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolbypassrls,
        pg_catalog.pg_has_role(role.oid,${quoteSqlLiteral(OWNER_ROLE)},'MEMBER') AS member_of_owner
      FROM pg_catalog.pg_roles role WHERE role.rolname = ANY($1::text[])
    `, [[expected.ownerLogin, OWNER_ROLE, expected.runtimeRole]]),
    'dev126_reset_restore_roles_invalid')
    const roleMap = new Map(rolesRows.map(row => [row.rolname, roleProjection(row)]))
    if (roleMap.size !== 3) fail('dev126_reset_restore_roles_invalid', 503)
    const ownerRole = roleMap.get(OWNER_ROLE)
    const schemaOwner = oneRow(await client.query(`
      SELECT pg_catalog.pg_get_userbyid(n.nspowner) AS schema_owner
      FROM pg_catalog.pg_namespace n WHERE n.nspname=$1
    `, [SCHEMA]), 'dev126_reset_restore_schema_owner_invalid').schema_owner
    const databaseInfo = oneRow(await client.query(`
      SELECT pg_catalog.pg_get_userbyid(d.datdba) AS database_owner,
        pg_catalog.shobj_description(d.oid,'pg_database') AS database_marker
      FROM pg_catalog.pg_database d WHERE d.datname=current_database()
    `), 'dev126_reset_restore_database_marker_invalid')
    const authorityRow = oneRow(await client.query(`
      SELECT mode,expected_commit,schema_hash,row_version,switched_at
      FROM ai_pdm_core.pdm_workbench_state_authority_control WHERE id=1
    `), 'dev126_reset_restore_authority_invalid')
    const authority = { mode: authorityRow.mode, expectedCommit: authorityRow.expected_commit,
      schemaHash: authorityRow.schema_hash, rowVersion: Number(authorityRow.row_version),
      switchedAt: new Date(authorityRow.switched_at).toISOString() }
    const metadataRow = oneRow(await client.query(`
      SELECT application_id,sandbox_id,database_name,sandbox_root,data_directory,repository_directory,
        generation::text AS generation,fixture_version,btrim(fixture_hash) AS fixture_hash,
        native_session_contract_version,target_fingerprint,status
      FROM ai_pdm_core.local_sandbox_target_metadata
      WHERE application_id='ai-pdm' AND sandbox_id=$1
    `, [scope.sandboxId]), 'dev126_reset_restore_target_metadata_invalid')
    const relations = rowsFrom(await client.query(`
      SELECT c.relname AS name,c.relkind AS kind,pg_catalog.pg_get_userbyid(c.relowner) AS owner
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind IN ('r','p','m','f') ORDER BY c.relname
    `, [SCHEMA]), 'dev126_reset_restore_inventory_invalid').map(row => ({ name: row.name,
      kind: row.kind === 'r' ? 'r' : row.kind === 'p' ? 'p' : row.kind, owner: row.owner }))
    const triggerAnomalies = rowsFrom(await client.query(`
      SELECT c.relname AS table_name,t.tgname AS trigger_name,t.tgenabled AS enabled_state
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND NOT t.tgisinternal AND t.tgenabled<>'O'
      ORDER BY c.relname,t.tgname
    `, [SCHEMA, manifest.database.includedRelations]), 'dev126_reset_restore_trigger_state_invalid')
    if (triggerAnomalies.length !== 0) fail('dev126_reset_restore_trigger_state_invalid', 503)
    const sequences = rowsFrom(await client.query(`
      SELECT sequence.relname AS name,pg_catalog.pg_get_userbyid(sequence.relowner) AS owner,
        table_relation.relname AS owned_table
      FROM pg_catalog.pg_class sequence
      JOIN pg_catalog.pg_namespace n ON n.oid=sequence.relnamespace
      JOIN pg_catalog.pg_depend dependency ON dependency.objid=sequence.oid AND dependency.classid='pg_class'::regclass
        AND dependency.refclassid='pg_class'::regclass AND dependency.deptype IN ('a','i')
      JOIN pg_catalog.pg_class table_relation ON table_relation.oid=dependency.refobjid
      JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid=table_relation.relnamespace
      WHERE n.nspname=$1 AND table_namespace.nspname=$1 AND sequence.relkind='S' ORDER BY sequence.relname
    `, [SCHEMA]), 'dev126_reset_restore_sequence_invalid').map(row => ({ name: row.name,
      owner: row.owner, ownedTable: row.owned_table }))
    const sessionCount = Number(oneRow(await client.query(`SELECT count(*)::text AS count
      FROM ai_pdm_core.principal_session_records`), 'dev126_reset_restore_session_registry_invalid').count)
    const sourceBindings = rowsFrom(await client.query(`
      SELECT status,central_correlation_id,central_registration_observed_at
      FROM ai_pdm_core.local_sandbox_principal_session_bindings
      WHERE sandbox_id=$1 AND generation=$2::uuid ORDER BY native_session_id_hash
    `, [scope.sandboxId, scope.sourceGeneration]), 'dev126_reset_restore_binding_invalid').map(row => ({
      status: row.status, centralCorrelationId: row.central_correlation_id,
      centralRegistrationObservedAt: row.central_registration_observed_at == null ? null :
        new Date(row.central_registration_observed_at).toISOString(),
    }))
    const state = {
      identity: { databaseName: identity.database_name, currentUser: identity.current_user,
        sessionUser: identity.session_user, serverAddress: identity.server_address,
        serverPort: Number(identity.server_port) },
      roles: { scopedLogin: roleMap.get(expected.ownerLogin), owner: ownerRole, runtime: roleMap.get(expected.runtimeRole) },
      schemaOwner, databaseOwner: databaseInfo.database_owner, databaseMarker: databaseInfo.database_marker, authority,
      targetMetadata: { applicationId: metadataRow.application_id, sandboxId: metadataRow.sandbox_id,
        databaseName: metadataRow.database_name, sandboxRoot: metadataRow.sandbox_root,
        dataDirectory: metadataRow.data_directory, repositoryDirectory: metadataRow.repository_directory,
        generation: metadataRow.generation, fixtureVersion: metadataRow.fixture_version,
        fixtureHash: metadataRow.fixture_hash, nativeSessionContractVersion: metadataRow.native_session_contract_version,
        targetFingerprint: metadataRow.target_fingerprint, status: metadataRow.status },
      relations, sequences, principalSessionCount: sessionCount, sourceBindings,
    }
    validateOwnerState(state, context, scope, manifest, {
      allowMaintenance: true, allowNewGeneration: state.targetMetadata.generation === scope.generation,
    })
    if (!readBusiness) return Object.freeze(state)
    const business = []
    for (const relation of manifest.database.includedRelations) {
      const table = qIdent(relation)
      const result = rowsFrom(await client.query(`SELECT pg_catalog.to_jsonb(t)::text AS row_json
        FROM ${SCHEMA}.${table} AS t ORDER BY pg_catalog.to_jsonb(t)::text`),
      'dev126_reset_restore_business_readback_invalid')
      const digest = createHash('sha256')
      for (const row of result) {
        if (typeof row.row_json !== 'string') fail('dev126_reset_restore_business_readback_invalid', 503)
        digest.update(row.row_json, 'utf8').update('\n', 'utf8')
      }
      business.push(Object.freeze({ name: relation, rowCount: result.length, rowsSha256: digest.digest('hex') }))
    }
    const preservedControls = []
    for (const relation of PRESERVED_CONTROL_RELATIONS) {
      const table = qIdent(relation)
      const result = rowsFrom(await client.query(`SELECT pg_catalog.to_jsonb(t)::text AS row_json
        FROM ${SCHEMA}.${table} AS t ORDER BY pg_catalog.to_jsonb(t)::text`),
      'dev126_reset_restore_control_readback_invalid')
      const digest = createHash('sha256')
      for (const row of result) {
        if (typeof row.row_json !== 'string') fail('dev126_reset_restore_control_readback_invalid', 503)
        digest.update(row.row_json, 'utf8').update('\n', 'utf8')
      }
      preservedControls.push(Object.freeze({ name: relation, rowCount: result.length,
        rowsSha256: digest.digest('hex') }))
    }
    return Object.freeze({ state: Object.freeze(state), business: Object.freeze(business),
      preservedControls: Object.freeze(preservedControls) })
  }

  return Object.freeze({
    async inspect(context) {
      return withOwner({ ...context, readOnly: true, operation: async state => state })
    },
    async markMaintenance(context) {
      return withOwner({ ...context, readOnly: false, operation: async (state, client) => {
        validateOwnerState(state, context, context.scope, context.manifest, {
          allowMaintenance: true, allowNewGeneration: false,
        })
        if (state.targetMetadata.generation !== context.scope.sourceGeneration ||
          !['ready', 'maintenance'].includes(state.targetMetadata.status) ||
          state.databaseMarker !== generationMarker(context.scope)) {
          fail('dev126_reset_restore_maintenance_precondition_failed')
        }
        if (state.targetMetadata.status === 'maintenance') return Object.freeze({ changed: false })
        const result = await client.query(`UPDATE ai_pdm_core.local_sandbox_target_metadata
          SET status='maintenance',updated_at=clock_timestamp()
          WHERE application_id='ai-pdm' AND sandbox_id=$1 AND generation=$2::uuid AND status='ready'`,
        [context.scope.sandboxId, context.scope.sourceGeneration])
        if (Number(result?.rowCount) !== 1) fail('dev126_reset_restore_maintenance_readback_failed', 503)
        return Object.freeze({ changed: true })
      } })
    },
    async readBusiness(context) {
      return withOwner({ ...context, readOnly: true, readBusiness: true, operation: async state => state })
    },
    async rebind(context) {
      return withOwner({ ...context, readOnly: false, operation: async (state, client) => {
        validateOwnerState(state, context, context.scope, context.manifest, {
          allowMaintenance: true, allowNewGeneration: state.targetMetadata.generation === context.scope.generation,
        })
        const pending = state.sourceBindings.some(binding => binding.status === 'pending_central_registration')
        if (pending) fail('dev126_reset_restore_pending_central_registration')
        const alreadyBound = state.targetMetadata.generation === context.scope.generation &&
          state.targetMetadata.status === 'ready' && state.databaseMarker === generationMarker(context.scope)
        if (alreadyBound) return Object.freeze({ rebound: false, generation: context.scope.generation,
          targetFingerprint: targetFingerprintForGeneration(context.targetInput, context.scope.generation) })
        if (state.targetMetadata.generation !== context.scope.sourceGeneration ||
          state.targetMetadata.status !== 'maintenance' || state.databaseMarker !== generationMarker(context.scope) ||
          state.principalSessionCount !== 0 || state.sourceBindings.some(binding => binding.status === 'central_registered')) {
          fail('dev126_reset_restore_rebind_precondition_failed')
        }
        const nextFingerprint = targetFingerprintForGeneration(context.targetInput, context.scope.generation)
        const registeredCount = state.sourceBindings.filter(binding => binding.status === 'central_registered').length
        const bindingUpdate = await client.query(`UPDATE ai_pdm_core.local_sandbox_principal_session_bindings
          SET status='revoked'
          WHERE sandbox_id=$1 AND generation=$2::uuid AND status='central_registered'`,
        [context.scope.sandboxId, context.scope.sourceGeneration])
        if (Number(bindingUpdate?.rowCount) !== registeredCount) fail('dev126_reset_restore_binding_readback_failed', 503)
        const metadataUpdate = await client.query(`UPDATE ai_pdm_core.local_sandbox_target_metadata
          SET generation=$1::uuid,target_fingerprint=$2,status='ready',updated_at=clock_timestamp()
          WHERE application_id='ai-pdm' AND sandbox_id=$3 AND generation=$4::uuid AND status='maintenance'`,
        [context.scope.generation, nextFingerprint, context.scope.sandboxId, context.scope.sourceGeneration])
        if (Number(metadataUpdate?.rowCount) !== 1) fail('dev126_reset_restore_target_readback_failed', 503)
        const databaseName = context.expected.databaseName
        const current = await loadOwnerState(client, context, context.scope, context.manifest,
          { ...context.expected, sourceGeneration: context.scope.generation },
          { database_name: databaseName, current_user: OWNER_ROLE, session_user: state.identity.sessionUser,
            server_address: state.identity.serverAddress, server_port: state.identity.serverPort }, { readBusiness: false })
        validateOwnerState(current, context, context.scope, context.manifest, { allowNewGeneration: true })
        if (current.targetMetadata.status !== 'ready' || current.principalSessionCount !== 0 ||
          current.sourceBindings.some(binding => binding.status !== 'revoked')) fail('dev126_reset_restore_rebind_readback_failed', 503)
        return Object.freeze({ rebound: true, generation: context.scope.generation, targetFingerprint: nextFingerprint })
      } })
    },
  })
}

function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function compareBusinessReadback(readback, manifest, scope) {
  if (!isRecord(readback) || !isRecord(readback.state) || !Array.isArray(readback.business) ||
    !Array.isArray(readback.preservedControls)) return false
  const expected = manifest.database.relations.filter(relation => manifest.database.includedRelations.includes(relation.name))
    .map(relation => ({ name: relation.name, rowCount: relation.rowCount, rowsSha256: relation.rowsSha256 }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const actual = readback.business.map(relation => ({ name: relation.name, rowCount: relation.rowCount,
    rowsSha256: relation.rowsSha256 })).sort((a, b) => a.name.localeCompare(b.name))
  const expectedControls = manifest.database.relations.filter(relation => PRESERVED_CONTROL_RELATIONS.includes(relation.name))
    .map(relation => ({ name: relation.name, rowCount: relation.rowCount, rowsSha256: relation.rowsSha256 }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const actualControls = readback.preservedControls.map(relation => ({ name: relation.name,
    rowCount: relation.rowCount, rowsSha256: relation.rowsSha256 })).sort((a, b) => a.name.localeCompare(b.name))
  const phaseMatches = (readback.state.targetMetadata.generation === scope.sourceGeneration &&
    readback.state.targetMetadata.status === 'maintenance' && readback.state.databaseMarker === generationMarker(scope)) ||
    (readback.state.targetMetadata.generation === scope.generation &&
      readback.state.targetMetadata.status === 'ready' && readback.state.databaseMarker === generationMarker(scope))
  return JSON.stringify(actual) === JSON.stringify(expected) &&
    JSON.stringify(actualControls) === JSON.stringify(expectedControls) && phaseMatches && readback.state.principalSessionCount === 0 &&
    readback.state.sourceBindings.every(binding => binding.status === 'revoked') &&
    (readback.state.targetMetadata.status === 'maintenance' || readback.state.targetMetadata.status === 'ready')
}

function normalizedResult(scope, readback, recoveredAfterUnknown = false) {
  return Object.freeze({ resetId: scope.resetId, sandboxId: scope.sandboxId,
    sourceGeneration: scope.sourceGeneration, generation: scope.generation,
    baselineId: scope.baseline.id, baselineSha256: scope.baseline.sha256,
    restored: true, recoveredAfterUnknown, targetMetadataStatus: readback.state.targetMetadata.status })
}

/**
 * Build the PDM-only local reset restore owner. Platform supplies a typed,
 * read-only durable fence receipt through a Platform-owned runtime closure.
 * `readResetFence({scope})` returns exactly {sandboxId,resetId,sourceGeneration,
 * generation,status:'resetting',sessionsRevoked:true,registryRetained:true,
 * applicationsOffline:true}; it reads persisted Platform state, not browser
 * input, and only returns after all four apps are offline. No other
 * application's schema is queried or changed here.
 */
export function createDev126LocalResetRestoreOwner({
  environment = process.env,
  Pool = pg.Pool,
  spawn = nodeSpawn,
  baselineReader = readDev126LocalResetBaseline,
  platformFence,
  database,
} = {}) {
  if (!isRecord(environment) || typeof Pool !== 'function' || typeof spawn !== 'function' ||
    typeof baselineReader !== 'function' || !platformFence || typeof platformFence.readResetFence !== 'function') {
    throw new TypeError('DEV126_LOCAL_RESET_RESTORE_ADAPTER_INVALID')
  }
  const ownerDatabase = database ?? createPostgresOwnerAdapter({ Pool, environment })
  if (!ownerDatabase || typeof ownerDatabase.inspect !== 'function' ||
    typeof ownerDatabase.markMaintenance !== 'function' || typeof ownerDatabase.readBusiness !== 'function' ||
    typeof ownerDatabase.rebind !== 'function') throw new TypeError('DEV126_LOCAL_RESET_RESTORE_DATABASE_PORT_INVALID')

  async function readGenerationFence(scopeInput) {
    const scope = validateScope(scopeInput)
    let receipt
    try { receipt = await platformFence.readResetFence(Object.freeze({ scope })) } catch {
      fail('dev126_reset_restore_generation_fence_unavailable', 503)
    }
    return validateFence(receipt, scope)
  }

  async function loadContext(targetInput, scopeInput) {
    const scope = validateScope(scopeInput)
    const context = contextFor(targetInput, scope, environment)
    let baseline
    try {
      baseline = await baselineReader({ targetInput, baselineId: scope.baseline.id,
        expectedManifestSha256: scope.baseline.sha256 })
    } catch (error) {
      if (error instanceof LocalSandboxError) throw error
      fail('dev126_reset_restore_baseline_unavailable', 503)
    }
    const validated = validateBaseline(baseline, scope, targetInput)
    return { scope, context, baseline, manifest: validated.manifest,
      businessRelations: validated.businessRelations, repositoryObjects: validated.repositoryObjects }
  }

  async function readBusinessRestore({ targetInput, scope: scopeInput }) {
    const loaded = await loadContext(targetInput, scopeInput)
    await readGenerationFence(loaded.scope)
    const raw = await ownerDatabase.readBusiness(loaded)
    const state = raw?.state
    if (!isRecord(state)) fail('dev126_reset_restore_readback_invalid', 503)
    const generation = state.targetMetadata?.generation
    validateOwnerState(state, loaded.context, loaded.scope, loaded.manifest,
      { allowMaintenance: true, allowNewGeneration: generation === loaded.scope.generation })
    const databaseRestored = compareBusinessReadback(raw, loaded.manifest, loaded.scope)
    const repositoryRestored = await repositoryMatches(targetInput.repositoryDirectory, loaded.repositoryObjects)
    const restored = databaseRestored && repositoryRestored
    return Object.freeze({ resetId: loaded.scope.resetId, restored,
      sourceGeneration: loaded.scope.sourceGeneration, generation: loaded.scope.generation,
      observedGeneration: generation, targetMetadataStatus: state.targetMetadata.status,
      principalSessionCount: state.principalSessionCount,
      sourceBindingsRevoked: state.sourceBindings.every(binding => binding.status === 'revoked'),
      businessRelationCount: raw.business.length, repositoryRestored,
      repositoryObjectCount: loaded.repositoryObjects.length })
  }

  async function restoreBusinessBaseline({ targetInput, scope: scopeInput }) {
    const loaded = await loadContext(targetInput, scopeInput)
    await readGenerationFence(loaded.scope)
    const initial = await ownerDatabase.inspect(loaded)
    validateOwnerState(initial, loaded.context, loaded.scope, loaded.manifest, { allowMaintenance: true })
    if (initial.targetMetadata.generation !== loaded.scope.sourceGeneration ||
      !['ready', 'maintenance'].includes(initial.targetMetadata.status) || initial.databaseMarker !== generationMarker(loaded.scope) ||
      initial.principalSessionCount < 0 ||
      initial.sourceBindings.some(binding => binding.status === 'pending_central_registration')) {
      fail('dev126_reset_restore_precondition_failed', 409)
    }
    if (initial.targetMetadata.status === 'maintenance') {
      const priorReadback = await ownerDatabase.readBusiness(loaded).catch(() => null)
      if (priorReadback && compareBusinessReadback(priorReadback, loaded.manifest, loaded.scope) &&
        priorReadback.state.targetMetadata.generation === loaded.scope.sourceGeneration) {
        const work = await createWorkDirectory(targetInput.sandboxRoot, loaded.scope)
        let preserveWork = false
        try {
          await readGenerationFence(loaded.scope)
          await restoreRepositoryBaseline(loaded, work)
          return normalizedResult(loaded.scope, priorReadback, true)
        } catch (error) {
          preserveWork = true
          throw error
        } finally {
          if (!preserveWork) await cleanupWorkDirectory(work)
        }
      }
      fail('dev126_reset_restore_maintenance_resume_requires_readback', 409)
    }
    const work = await createWorkDirectory(targetInput.sandboxRoot, loaded.scope)
    let preserveWork = false
    try {
      const archivePath = path.join(work.taskDirectory, 'pinned.data.dump')
      await removeTaskFileIfPresent(work.taskDirectory, 'pinned.data.dump')
      await copyVerifiedArchive(loaded.baseline, targetInput, loaded.manifest, archivePath)
      const archiveChildPath = await validatedChildFilePath(archivePath, work.taskDirectory,
        'dev126_reset_restore_archive_path_invalid')
      const ownerLogin = environment.PGUSER
      const password = await passwordResolver(environment, loaded.context.expected, ownerLogin)(
        { host: loaded.context.expected.databaseHost, port: loaded.context.expected.databasePort,
          database: loaded.context.expected.databaseName, user: ownerLogin })
      const childEnv = childEnvironment(environment, loaded.context.expected, ownerLogin, password)
      const executable = process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore'
      const list = await runChild(spawn, executable,
        ['--list', '--no-password', archiveChildPath], childEnv, { captureStdout: true })
      if (list.code !== 0) fail('dev126_reset_restore_archive_toc_invalid', 503)
      validateArchiveToc(list.stdout, loaded.businessRelations, initial.sequences)
      const restoreSqlPath = path.join(work.taskDirectory, 'restore-data.sql')
      await removeTaskFileIfPresent(work.taskDirectory, 'restore-data.sql')
      const restoreSqlChildPath = await validatedChildFilePath(restoreSqlPath, work.taskDirectory,
        'dev126_reset_restore_archive_render_failed', { output: true })
      const render = await runChild(spawn, executable, [
        '--data-only', '--no-owner', '--no-privileges', '--schema=ai_pdm_core',
        '--exit-on-error', `--file=${restoreSqlChildPath}`, archiveChildPath,
      ], childEnv)
      if (render.code !== 0) fail('dev126_reset_restore_archive_render_failed', 503)
      await assertRegularFile(restoreSqlPath, 'dev126_reset_restore_archive_render_failed')
      const restoreSql = await readFile(restoreSqlPath, 'utf8').catch(() => fail('dev126_reset_restore_archive_render_failed', 503))
      const sql = buildRestoreSql({ restoreSql, businessRelations: loaded.businessRelations,
        sequences: initial.sequences, scope: loaded.scope })
      const transactionFile = path.join(work.taskDirectory, 'restore-transaction.sql')
      await removeTaskFileIfPresent(work.taskDirectory, 'restore-transaction.sql')
      await writeFile(transactionFile, sql, { mode: 0o600, flag: 'wx' })
      const transactionChildPath = await validatedChildFilePath(transactionFile, work.taskDirectory,
        'dev126_reset_restore_workdir_invalid')
      await prepareRepositoryStage(loaded, work)
      await readGenerationFence(loaded.scope)
      try {
        await ownerDatabase.markMaintenance(loaded)
      } catch {
        const maintenanceReadback = await ownerDatabase.inspect(loaded).catch(() => null)
        if (!maintenanceReadback) fail('dev126_reset_restore_maintenance_outcome_unknown', 503)
        validateOwnerState(maintenanceReadback, loaded.context, loaded.scope, loaded.manifest, { allowMaintenance: true })
        if (maintenanceReadback.targetMetadata.generation !== loaded.scope.sourceGeneration ||
          maintenanceReadback.targetMetadata.status !== 'maintenance' ||
          maintenanceReadback.databaseMarker !== generationMarker(loaded.scope)) {
          fail('dev126_reset_restore_maintenance_outcome_unknown', 503)
        }
      }
      await readGenerationFence(loaded.scope)
      const latest = await ownerDatabase.inspect(loaded)
      validateOwnerState(latest, loaded.context, loaded.scope, loaded.manifest, { allowMaintenance: true })
      if (latest.targetMetadata.generation !== loaded.scope.sourceGeneration ||
        latest.targetMetadata.status !== 'maintenance' || latest.sourceBindings.some(binding => binding.status === 'pending_central_registration')) {
        fail('dev126_reset_restore_precondition_failed', 409)
      }
      let psqlResult
      let psqlFailure = false
      try {
        psqlResult = await runChild(spawn, process.platform === 'win32' ? 'psql.exe' : 'psql', [
          '--no-password', '--host', loaded.context.expected.databaseHost,
          '--port', String(loaded.context.expected.databasePort), '--dbname', loaded.context.expected.databaseName,
          '--username', ownerLogin, '--single-transaction', '--set', 'ON_ERROR_STOP=on',
          '--file', transactionChildPath,
        ], childEnv)
      } catch {
        psqlFailure = true
      }
      let readback
      try { readback = await ownerDatabase.readBusiness(loaded) } catch {
        fail('dev126_reset_restore_commit_outcome_unknown', 503)
      }
      if (compareBusinessReadback(readback, loaded.manifest, loaded.scope) &&
        readback.state.targetMetadata.generation === loaded.scope.sourceGeneration &&
        readback.state.targetMetadata.status === 'maintenance' &&
        readback.state.databaseMarker === generationMarker(loaded.scope)) {
        await readGenerationFence(loaded.scope)
        try { await restoreRepositoryBaseline(loaded, work) }
        catch (error) { preserveWork = true; throw error }
        return normalizedResult(loaded.scope, readback, psqlFailure || psqlResult?.code !== 0)
      }
      if (psqlFailure || psqlResult?.code !== 0) fail('dev126_reset_restore_commit_outcome_unknown', 503)
      fail('dev126_reset_restore_readback_mismatch', 503)
    } catch (error) {
      if (error instanceof LocalSandboxError) throw error
      // Any psql-started error must be resolved by a fresh provider readback;
      // the facade never replays an unknown write.
      fail('dev126_reset_restore_execution_failed', 503)
    } finally {
      if (!preserveWork) await cleanupWorkDirectory(work)
    }
  }

  async function rebindAndFenceSessions({ targetInput, scope: scopeInput }) {
    const loaded = await loadContext(targetInput, scopeInput)
    await readGenerationFence(loaded.scope)
    const restored = await ownerDatabase.readBusiness(loaded)
    if (restored && compareBusinessReadback(restored, loaded.manifest, loaded.scope) &&
      restored.state.targetMetadata.generation === loaded.scope.generation &&
      restored.state.targetMetadata.status === 'ready' && restored.state.sourceBindings.every(binding => binding.status === 'revoked') &&
      await repositoryMatches(targetInput.repositoryDirectory, loaded.repositoryObjects)) {
      return Object.freeze({ resetId: loaded.scope.resetId, sandboxId: loaded.scope.sandboxId,
        sourceGeneration: loaded.scope.sourceGeneration, generation: loaded.scope.generation,
        targetFingerprint: targetFingerprintForGeneration(targetInput, loaded.scope.generation),
        sessionsCleared: restored.state.principalSessionCount === 0, sourceBindingsRevoked: true, ready: true })
    }
    if (!compareBusinessReadback(restored, loaded.manifest, loaded.scope) ||
      !await repositoryMatches(targetInput.repositoryDirectory, loaded.repositoryObjects) ||
      restored.state.targetMetadata.generation !== loaded.scope.sourceGeneration ||
      restored.state.targetMetadata.status !== 'maintenance' ||
      restored.state.databaseMarker !== generationMarker(loaded.scope)) {
      fail('dev126_reset_restore_rebind_precondition_failed', 409)
    }
    if (restored.state.sourceBindings.some(binding => binding.status === 'pending_central_registration')) {
      fail('dev126_reset_restore_pending_central_registration', 409)
    }
    try {
      await ownerDatabase.rebind(loaded)
    } catch (error) {
      if (error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_pending_central_registration') throw error
      // Commit may have succeeded even if the client lost its response.
      const readback = await ownerDatabase.readBusiness(loaded).catch(() => null)
      if (!readback || !compareBusinessReadback(readback, loaded.manifest, loaded.scope) ||
        !await repositoryMatches(targetInput.repositoryDirectory, loaded.repositoryObjects) ||
        readback.state.targetMetadata.generation !== loaded.scope.generation ||
        readback.state.targetMetadata.status !== 'ready' || readback.state.databaseMarker !== generationMarker(loaded.scope) ||
        readback.state.sourceBindings.some(binding => binding.status !== 'revoked')) {
        fail('dev126_reset_restore_rebind_outcome_unknown', 503)
      }
    }
    const finalState = await ownerDatabase.readBusiness(loaded)
    validateOwnerState(finalState.state, loaded.context, loaded.scope, loaded.manifest, { allowNewGeneration: true })
    if (!compareBusinessReadback(finalState, loaded.manifest, loaded.scope) || finalState.state.targetMetadata.status !== 'ready' ||
      finalState.state.databaseMarker !== generationMarker(loaded.scope) ||
      finalState.state.sourceBindings.some(binding => binding.status !== 'revoked')) {
      fail('dev126_reset_restore_rebind_readback_failed', 503)
    }
    await readGenerationFence(loaded.scope)
    return Object.freeze({ resetId: loaded.scope.resetId, sandboxId: loaded.scope.sandboxId,
      sourceGeneration: loaded.scope.sourceGeneration, generation: loaded.scope.generation,
      targetFingerprint: targetFingerprintForGeneration(targetInput, loaded.scope.generation),
      sessionsCleared: finalState.state.principalSessionCount === 0, sourceBindingsRevoked: true,
      ready: true })
  }

  async function readiness({ targetInput, scope: scopeInput }) {
    const loaded = await loadContext(targetInput, scopeInput)
    const fence = await readGenerationFence(loaded.scope)
    const state = await ownerDatabase.readBusiness(loaded)
    validateOwnerState(state.state, loaded.context, loaded.scope, loaded.manifest, { allowNewGeneration: true })
    const databaseRestored = compareBusinessReadback(state, loaded.manifest, loaded.scope)
    const repositoryRestored = await repositoryMatches(targetInput.repositoryDirectory, loaded.repositoryObjects)
    const restored = databaseRestored && repositoryRestored
    const ready = restored && state.state.targetMetadata.generation === loaded.scope.generation &&
      state.state.targetMetadata.status === 'ready' && state.state.databaseMarker === generationMarker(loaded.scope) &&
      state.state.principalSessionCount === 0 && state.state.sourceBindings.every(binding => binding.status === 'revoked')
    return Object.freeze({ resetId: loaded.scope.resetId, ready, restored, generation: loaded.scope.generation,
      fenceStatus: fence.status, applicationsOffline: fence.applicationsOffline,
      principalSessionCount: state.state.principalSessionCount, repositoryRestored,
      sourceBindingsRevoked: state.state.sourceBindings.every(binding => binding.status === 'revoked') })
  }

  return Object.freeze({ restoreBusinessBaseline, readBusinessRestore, rebindAndFenceSessions,
    readGenerationFence, readiness })
}

export const DEV126_LOCAL_RESET_RESTORE_OWNER_POLICY = Object.freeze({
  schema: SCHEMA,
  ownerRole: OWNER_ROLE,
  scopedLoginPattern: 'local_pdm_seed_[a-f0-9]{16}',
  businessRelationCount: BUSINESS_RELATION_COUNT,
  controlRelations: CONTROL_RELATIONS,
  sessionRelation: SESSION_RELATION,
  transaction: 'psql-single-transaction-no-cascade',
  triggerMode: 'fixed-business-table-user-triggers-only',
  requiredOfflineApplicationCount: REQUIRED_OFFLINE_APPLICATION_COUNT,
  platformFenceContract: Object.freeze({
    method: 'readResetFence',
    readback: Object.freeze(['sandboxId', 'resetId', 'sourceGeneration', 'generation', 'status',
      'sessionsRevoked', 'registryRetained', 'applicationsOffline']),
    status: 'resetting',
    sourceGenerationRevoked: true,
    registryRetained: true,
    allFourApplicationsOffline: true,
  }),
  markerPrefix: MARKER_PREFIX,
})
