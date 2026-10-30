import { createHash } from 'node:crypto'
import path from 'node:path'
import { contractDigest } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'

const APPLICATION_ID = 'ai-pdm'
const MIGRATOR_ROLE = 'jenfu_ai_pdm_migrator'
const RUNTIME_ROLE = 'jenfu_ai_pdm_runtime'
const NATIVE_SESSION_CONTRACT_VERSION = 'jenfu.ai-pdm-session.v2'
const WORKBENCH_SCHEMA_HASH = 'dev090-v1'
const WORKBENCH_EXPECTED_COMMIT = /^(?:local-dev|[a-f0-9]{40})$/u
const HASH = /^[a-f0-9]{64}$/u
const GENERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,63}$/u
const FIXTURE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1'])

// These are the PDM-owned factory defaults in src/lib/db.ts.
const JENFU_COMPANY = Object.freeze({
  id: 'company-jenfu',
  companyCode: 'JENFU',
  companyKind: 'business',
  displayName: '鉦富',
})

// This order is explicitly limited to the isolated DEV-126 local fixture.
const LOCAL_ROLE_PRIORITY_CODES = Object.freeze([
  'system_admin',
  'pdm_admin',
  'rd_manager',
  'production_planning',
  'qa',
  'rd',
  'manufacturing',
  'procurement',
  'external_specialist',
])

const fail = (code, cause) => {
  const error = new Error(`LOCAL_BUSINESS_BASELINE_${code}`, cause ? { cause } : undefined)
  error.code = `LOCAL_BUSINESS_BASELINE_${code}`
  throw error
}

/** @typedef {{query(sql: string, values?: readonly unknown[]): Promise<{rows: unknown[], rowCount?: number | null}>}} OwnerSqlClient */

/**
 * @typedef {Readonly<{
 *   sandboxId: string,
 *   databaseName: string,
 *   databaseHost: 'localhost' | '127.0.0.1' | '::1',
 *   databasePort: number,
 *   generation: string,
 *   fixtureVersion: string,
 *   fixtureHash: string,
 *   nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
 *   sandboxRoot: string,
 *   dataDirectory: string,
 *   repositoryDirectory: string
 * }>} LocalBusinessBaselineTarget */

/**
 * @typedef {Readonly<{
 *   format: 'ai-pdm.local-role-priority.v1',
 *   sandboxId: string,
 *   roleCodes: readonly string[],
 *   sha256: string
 * }>} LocalRolePriorityPolicy */

/**
 * The caller supplies values already read from the private local configuration,
 * fixture and reset generation. This entry never opens a connection or reads
 * those private files itself.
 *
 * @typedef {Readonly<{
 *   client: OwnerSqlClient,
 *   scopedMigratorSessionUser: string,
 *   target: LocalBusinessBaselineTarget,
 *   localPriorityPolicy: LocalRolePriorityPolicy,
 *   workbenchAuthorityExpectedCommit: 'local-dev' | string
 * }>} InitializeDev126LocalBusinessBaselineInput */

function exactKeys(value, expected) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)))
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function validateInput(input) {
  if (!exactKeys(input, ['client', 'scopedMigratorSessionUser', 'target', 'localPriorityPolicy',
    'workbenchAuthorityExpectedCommit']) ||
    !input.client || typeof input.client.query !== 'function' ||
    typeof input.scopedMigratorSessionUser !== 'string' ||
    !input.scopedMigratorSessionUser.trim() || input.scopedMigratorSessionUser.length > 255 ||
    input.scopedMigratorSessionUser.trim() !== input.scopedMigratorSessionUser ||
    typeof input.workbenchAuthorityExpectedCommit !== 'string' ||
    !WORKBENCH_EXPECTED_COMMIT.test(input.workbenchAuthorityExpectedCommit) ||
    !exactKeys(input.localPriorityPolicy, ['format', 'sandboxId', 'roleCodes', 'sha256']) ||
    !exactKeys(input.target, ['sandboxId', 'databaseName', 'databaseHost', 'databasePort', 'generation',
      'fixtureVersion', 'fixtureHash', 'nativeSessionContractVersion', 'sandboxRoot', 'dataDirectory',
      'repositoryDirectory'])) fail('INPUT_INVALID')

  const target = input.target
  const expectedDatabaseName = typeof target.sandboxId === 'string'
    ? `jenfu_local_${target.sandboxId.replaceAll('-', '_')}` : ''
  if (typeof target.sandboxId !== 'string' || !SANDBOX_ID.test(target.sandboxId) ||
    target.databaseName !== expectedDatabaseName || !/^jenfu_local_[a-z0-9_]{3,51}$/u.test(target.databaseName) ||
    !['localhost', ...LOOPBACK_HOSTS].includes(target.databaseHost) ||
    !Number.isSafeInteger(target.databasePort) || target.databasePort < 1 || target.databasePort > 65535 ||
    typeof target.generation !== 'string' || !GENERATION.test(target.generation) ||
    typeof target.fixtureVersion !== 'string' || !FIXTURE_VERSION.test(target.fixtureVersion) ||
    typeof target.fixtureHash !== 'string' || !HASH.test(target.fixtureHash) ||
    target.nativeSessionContractVersion !== NATIVE_SESSION_CONTRACT_VERSION ||
    ![target.sandboxRoot, target.dataDirectory, target.repositoryDirectory].every(value =>
      typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'))) fail('TARGET_INPUT_INVALID')

  const policy = input.localPriorityPolicy
  if (policy.format !== 'ai-pdm.local-role-priority.v1' || policy.sandboxId !== target.sandboxId ||
    !Array.isArray(policy.roleCodes) || policy.roleCodes.length !== LOCAL_ROLE_PRIORITY_CODES.length ||
    policy.roleCodes.some((code, index) => code !== LOCAL_ROLE_PRIORITY_CODES[index]) ||
    typeof policy.sha256 !== 'string' || !HASH.test(policy.sha256) ||
    policy.sha256 !== contractDigest({ format: policy.format, sandboxId: policy.sandboxId, roleCodes: policy.roleCodes })) {
    fail('LOCAL_PRIORITY_POLICY_INVALID')
  }

  const sandboxRoot = path.resolve(target.sandboxRoot)
  const dataDirectory = path.resolve(target.dataDirectory)
  const repositoryDirectory = path.resolve(target.repositoryDirectory)
  if (samePath(sandboxRoot, dataDirectory) || samePath(sandboxRoot, repositoryDirectory) ||
    samePath(dataDirectory, repositoryDirectory) || !samePath(path.dirname(dataDirectory), sandboxRoot) ||
    !samePath(path.dirname(repositoryDirectory), sandboxRoot)) fail('TARGET_PATH_INVALID')

  return Object.freeze({
    ...target,
    generation: target.generation.toLowerCase(),
    sandboxRoot,
    dataDirectory,
    repositoryDirectory,
  })
}

async function rows(client, sql, values = []) {
  const result = await client.query(sql, values)
  if (!result || !Array.isArray(result.rows)) fail('READBACK_INVALID')
  return result.rows
}

async function writeOne(client, sql, values) {
  const result = await client.query(sql, values)
  if (!result || result.rowCount !== 1) fail('WRITE_READBACK_INVALID')
}

function serverAddressMatches(expectedHost, observedAddress) {
  if (typeof observedAddress !== 'string' || !LOOPBACK_HOSTS.has(observedAddress.toLowerCase())) return false
  return expectedHost === 'localhost' || expectedHost === observedAddress.toLowerCase()
}

async function assertActualTarget(client, target, sessionUser, expectedCurrentUser) {
  const result = await rows(client, `
    SELECT current_database()::text AS database_name,
           current_user::text AS current_user,
           session_user::text AS session_user,
           host(inet_server_addr())::text AS server_address,
           inet_server_port()::integer AS server_port,
           (SELECT shobj_description(oid,'pg_database') FROM pg_catalog.pg_database
            WHERE datname=current_database()) AS marker
  `)
  if (result.length !== 1) fail('TARGET_READBACK_INVALID')
  const row = result[0]
  if (row.database_name !== target.databaseName || row.session_user !== sessionUser ||
    row.current_user !== expectedCurrentUser || !serverAddressMatches(target.databaseHost, row.server_address) ||
    Number(row.server_port) !== target.databasePort ||
    row.marker !== `jenfu.local-principal-bootstrap.v1:${target.sandboxId}:${target.generation}`) {
    fail('TARGET_IDENTITY_MISMATCH')
  }
}

async function assertZeroPrincipalSessions(client) {
  const result = await rows(client, `
    SELECT (SELECT count(*)::int FROM ai_pdm_core.principal_session_records) AS sessions,
           (SELECT count(*)::int FROM ai_pdm_core.local_sandbox_principal_session_bindings) AS bindings
  `)
  if (result.length !== 1 || !Number.isSafeInteger(Number(result[0].sessions)) ||
    !Number.isSafeInteger(Number(result[0].bindings))) fail('PRINCIPAL_SESSION_READBACK_INVALID')
  if (Number(result[0].sessions) !== 0 || Number(result[0].bindings) !== 0) {
    fail('TARGET_HAS_PRINCIPAL_SESSIONS')
  }
}

async function assertSchemaOwner(client) {
  const result = await rows(client, `
    SELECT pg_catalog.pg_get_userbyid(nspowner) AS schema_owner
    FROM pg_catalog.pg_namespace WHERE nspname=$1
  `, ['ai_pdm_core'])
  if (result.length !== 1 || result[0].schema_owner !== MIGRATOR_ROLE) fail('SCHEMA_OWNER_MISMATCH')
}

async function assertRuntimeMetadataReadOnly(client) {
  const result = await rows(client, `
    SELECT c.relkind,
           pg_catalog.pg_get_userbyid(c.relowner) AS relation_owner,
           has_table_privilege($1,c.oid,'SELECT') AS runtime_select,
           has_table_privilege($1,c.oid,'INSERT') AS runtime_insert,
           has_table_privilege($1,c.oid,'UPDATE') AS runtime_update,
           has_table_privilege($1,c.oid,'DELETE') AS runtime_delete,
           has_table_privilege($1,c.oid,'TRUNCATE') AS runtime_truncate,
           has_table_privilege($1,c.oid,'REFERENCES') AS runtime_references,
           has_table_privilege($1,c.oid,'TRIGGER') AS runtime_trigger,
           EXISTS (
             SELECT 1
             FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
             LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
             WHERE acl.grantee=0 OR
               (grantee.rolname=$1 AND acl.privilege_type <> 'SELECT')
           ) AS forbidden_acl
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$2 AND c.relname=$3
  `, [RUNTIME_ROLE, 'ai_pdm_core', 'local_sandbox_target_metadata'])
  if (result.length !== 1 || result[0].relkind !== 'r' ||
    result[0].relation_owner !== MIGRATOR_ROLE || result[0].runtime_select !== true ||
    ['runtime_insert', 'runtime_update', 'runtime_delete', 'runtime_truncate', 'runtime_references', 'runtime_trigger']
      .some(key => result[0][key] !== false) || result[0].forbidden_acl !== false) {
    fail('RUNTIME_METADATA_PRIVILEGE_MISMATCH')
  }
}

async function assertRuntimeWorkbenchAuthorityReadOnly(client) {
  const result = await rows(client, `
    SELECT c.relkind,
           pg_catalog.pg_get_userbyid(c.relowner) AS relation_owner,
           has_table_privilege($1,c.oid,'SELECT') AS runtime_select,
           has_table_privilege($1,c.oid,'INSERT') AS runtime_insert,
           has_table_privilege($1,c.oid,'UPDATE') AS runtime_update,
           has_table_privilege($1,c.oid,'DELETE') AS runtime_delete,
           has_table_privilege($1,c.oid,'TRUNCATE') AS runtime_truncate,
           has_table_privilege($1,c.oid,'REFERENCES') AS runtime_references,
           has_table_privilege($1,c.oid,'TRIGGER') AS runtime_trigger,
           EXISTS (
             SELECT 1
             FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
             LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
             WHERE acl.grantee=0 OR
               (grantee.rolname=$1 AND acl.privilege_type <> 'SELECT')
           ) AS forbidden_acl
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$2 AND c.relname=$3
  `, [RUNTIME_ROLE, 'ai_pdm_core', 'pdm_workbench_state_authority_control'])
  if (result.length !== 1 || result[0].relkind !== 'r' ||
    result[0].relation_owner !== MIGRATOR_ROLE || result[0].runtime_select !== true ||
    ['runtime_insert', 'runtime_update', 'runtime_delete', 'runtime_truncate', 'runtime_references', 'runtime_trigger']
      .some(key => result[0][key] !== false) || result[0].forbidden_acl !== false) {
    fail('RUNTIME_WORKBENCH_AUTHORITY_PRIVILEGE_MISMATCH')
  }
}

function workbenchAuthorityResult(row) {
  return Object.freeze({
    id: Number(row.id),
    mode: row.mode,
    expectedCommit: row.expected_commit,
    schemaHash: row.schema_hash,
    rowVersion: Number(row.row_version),
    switchedAt: row.switched_at instanceof Date ? row.switched_at.toISOString() : row.switched_at,
  })
}

async function ensureCanonicalWorkbenchAuthority(client, expectedCommit, readOnly = false) {
  const select = `
    SELECT id,mode,expected_commit,schema_hash,row_version,switched_at
    FROM ai_pdm_core.pdm_workbench_state_authority_control
    WHERE id=1
    ${readOnly ? '' : 'FOR UPDATE'}
  `
  const existing = await rows(client, select)
  if (existing.length !== 1 || Number(existing[0].id) !== 1 ||
    !Number.isSafeInteger(Number(existing[0].row_version)) || Number(existing[0].row_version) < 1) {
    fail('WORKBENCH_AUTHORITY_ROW_INVALID')
  }

  const row = existing[0]
  if (row.mode !== 'canonical_only' || row.schema_hash !== WORKBENCH_SCHEMA_HASH) {
    fail('WORKBENCH_AUTHORITY_NOT_CANONICAL')
  }
  if (row.expected_commit === expectedCommit) {
    return Object.freeze({ bound: false, ...workbenchAuthorityResult(row) })
  }
  if (readOnly && row.expected_commit === '') fail('WORKBENCH_AUTHORITY_COMMIT_UNBOUND')
  if (row.expected_commit !== '') fail('WORKBENCH_AUTHORITY_COMMIT_COLLISION')

  const rowVersion = Number(row.row_version)
  await writeOne(client, `
    UPDATE ai_pdm_core.pdm_workbench_state_authority_control
    SET expected_commit=$1,row_version=row_version+1,switched_at=clock_timestamp()
    WHERE id=1 AND mode='canonical_only' AND schema_hash=$2 AND expected_commit='' AND row_version=$3
  `, [expectedCommit, WORKBENCH_SCHEMA_HASH, rowVersion])
  const readback = await rows(client, select)
  if (readback.length !== 1 || Number(readback[0].id) !== 1 || readback[0].mode !== 'canonical_only' ||
    readback[0].expected_commit !== expectedCommit || readback[0].schema_hash !== WORKBENCH_SCHEMA_HASH ||
    Number(readback[0].row_version) !== rowVersion + 1) fail('WORKBENCH_AUTHORITY_WRITE_READBACK_FAILED')
  return Object.freeze({ bound: true, ...workbenchAuthorityResult(readback[0]) })
}

function companyMatches(row) {
  return row.id === JENFU_COMPANY.id && row.company_code === JENFU_COMPANY.companyCode &&
    row.company_kind === JENFU_COMPANY.companyKind && row.display_name === JENFU_COMPANY.displayName
}

async function ensureJenfuCompany(client, readOnly = false) {
  const select = `
    SELECT id,company_code,company_kind,display_name
    FROM ai_pdm_core.companies
    WHERE id=$1 OR company_code=$2
    ORDER BY id
    ${readOnly ? '' : 'FOR UPDATE'}
  `
  const existing = await rows(client, select, [JENFU_COMPANY.id, JENFU_COMPANY.companyCode])
  if (existing.length > 1) fail('COMPANY_IDENTITY_COLLISION')
  if (existing.length === 1) {
    if (!companyMatches(existing[0])) fail('COMPANY_IDENTITY_COLLISION')
    return Object.freeze({ created: false, companyId: JENFU_COMPANY.id })
  }
  if (readOnly) fail('COMPANY_BASELINE_MISSING')

  await writeOne(client, `
    INSERT INTO ai_pdm_core.companies
      (id,company_code,company_kind,display_name,created_at,updated_at)
    VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp())
  `, [JENFU_COMPANY.id, JENFU_COMPANY.companyCode, JENFU_COMPANY.companyKind, JENFU_COMPANY.displayName])
  const readback = await rows(client, select, [JENFU_COMPANY.id, JENFU_COMPANY.companyCode])
  if (readback.length !== 1 || !companyMatches(readback[0])) fail('COMPANY_WRITE_READBACK_FAILED')
  return Object.freeze({ created: true, companyId: JENFU_COMPANY.id })
}

function parseRolePriority(value, knownRoleCodes) {
  if (typeof value !== 'string') fail('ROLE_PRIORITY_INVALID')
  let priority
  try { priority = JSON.parse(value) } catch { fail('ROLE_PRIORITY_INVALID') }
  if (!Array.isArray(priority) || priority.length === 0 ||
    !priority.every(code => typeof code === 'string' && code.length > 0 && code.trim() === code) ||
    new Set(priority).size !== priority.length || priority.some(code => !knownRoleCodes.has(code))) {
    fail('ROLE_PRIORITY_UNKNOWN_OR_INVALID')
  }
  return priority
}

function jsonValue(value, code) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { fail(code) }
}

function readCatalogPermissions(value) {
  const permissions = jsonValue(value, 'PUBLISHED_CATALOG_PERMISSIONS_INVALID')
  if (!Array.isArray(permissions) || permissions.some(permission =>
    !exactKeys(permission, ['code', 'kind', 'allowed']) ||
    typeof permission.code !== 'string' || !permission.code || permission.code.trim() !== permission.code ||
    !['page', 'action'].includes(permission.kind) || typeof permission.allowed !== 'boolean') ||
    new Set(permissions.map(permission => `${permission.kind}\0${permission.code}`)).size !== permissions.length) {
    fail('PUBLISHED_CATALOG_PERMISSIONS_INVALID')
  }
  return Object.freeze(permissions.map(permission => Object.freeze({
    code: permission.code, kind: permission.kind, allowed: permission.allowed,
  })))
}

async function readPublishedCatalog(client, priorityPolicy) {
  const publishedRows = await rows(client, `
    SELECT active.catalog_version AS active_catalog_version,
           publication.application_id,publication.status AS publication_status,publication.catalog_sha256,
           entry.display_order,entry.stable_role_id,entry.role_code,entry.display_name,entry.assignable,
           entry.permissions,entry.role_definition_hash
    FROM ai_pdm_core.active_role_catalog active
    JOIN ai_pdm_core.role_catalog_publications publication
      ON publication.catalog_version=active.catalog_version
    JOIN ai_pdm_core.role_catalog_entries entry
      ON entry.catalog_version=active.catalog_version
    WHERE active.application_id=$1
    ORDER BY entry.display_order,entry.stable_role_id
  `, [APPLICATION_ID])
  if (publishedRows.length !== 9) fail('PUBLISHED_CATALOG_CARDINALITY_INVALID')

  const catalogVersion = publishedRows[0].active_catalog_version
  const catalogSha256 = publishedRows[0].catalog_sha256
  const roles = publishedRows.map((row, index) => {
    if (Number(row.display_order) !== index || row.active_catalog_version !== catalogVersion ||
      row.application_id !== APPLICATION_ID || row.publication_status !== 'active' ||
      row.catalog_sha256 !== catalogSha256 || typeof row.stable_role_id !== 'string' ||
      !/^[a-z][a-z0-9-]{1,127}$/u.test(row.stable_role_id) || typeof row.role_code !== 'string' ||
      !/^[a-z][a-z0-9_]{0,63}$/u.test(row.role_code) || typeof row.display_name !== 'string' ||
      !row.display_name.trim() || row.display_name.trim() !== row.display_name ||
      typeof row.assignable !== 'boolean' || typeof row.role_definition_hash !== 'string' ||
      !HASH.test(row.role_definition_hash)) fail('PUBLISHED_CATALOG_ENTRY_INVALID')
    return Object.freeze({
      displayOrder: index,
      stableRoleId: row.stable_role_id,
      roleCode: row.role_code,
      displayName: row.display_name,
      assignable: row.assignable,
      permissions: readCatalogPermissions(row.permissions),
    })
  })
  if (typeof catalogVersion !== 'string' || !catalogVersion || typeof catalogSha256 !== 'string' ||
    !HASH.test(catalogSha256) || new Set(roles.map(role => role.stableRoleId)).size !== 9 ||
    new Set(roles.map(role => role.roleCode)).size !== 9) fail('PUBLISHED_CATALOG_IDENTITY_INVALID')

  const policyCodes = [...priorityPolicy.roleCodes].sort()
  const catalogCodes = roles.map(role => role.roleCode).sort()
  if (policyCodes.length !== catalogCodes.length || policyCodes.some((code, index) => code !== catalogCodes[index])) {
    fail('LOCAL_PRIORITY_POLICY_ROLE_SET_MISMATCH')
  }
  return Object.freeze({ catalogVersion, catalogSha256, roles: Object.freeze(roles) })
}

function permissionRowId(catalogVersion, role, permission) {
  const digest = createHash('sha256').update([
    catalogVersion, role.stableRoleId, permission.kind, permission.code,
  ].join('\n')).digest('hex')
  return `local-catalog-permission-${digest.slice(0, 32)}`
}

function catalogProjection(catalog) {
  const roles = catalog.roles.map(role => ({
    id: role.stableRoleId,
    role_code: role.roleCode,
    title: role.displayName,
    system_defined: 1,
    enabled: 1,
  })).sort((left, right) => left.id.localeCompare(right.id))
  const rolePermissions = catalog.roles.flatMap(role => role.permissions.map(permission => ({
    id: permissionRowId(catalog.catalogVersion, role, permission),
    role_id: role.stableRoleId,
    permission_kind: permission.kind,
    permission_code: permission.code,
    allowed: permission.allowed ? 1 : 0,
  }))).sort((left, right) => left.id.localeCompare(right.id))
  return Object.freeze({ roles: Object.freeze(roles), rolePermissions: Object.freeze(rolePermissions) })
}

function exactRows(observed, expected, keys, numericKeys = []) {
  if (observed.length !== expected.length) return false
  const normalize = row => Object.fromEntries(keys.map(key => [key,
    numericKeys.includes(key) ? Number(row[key]) : row[key]]))
  const normalizeAndSort = values => values.map(normalize).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)))
  return JSON.stringify(normalizeAndSort(observed)) === JSON.stringify(normalizeAndSort(expected))
}

async function ensureCatalogRoleProjection(client, catalog, readOnly = false) {
  const expected = catalogProjection(catalog)
  const selectRoles = `
    SELECT id,role_code,title,system_defined,enabled
    FROM ai_pdm_core.roles ORDER BY id ${readOnly ? '' : 'FOR UPDATE'}
  `
  const selectPermissions = `
    SELECT id,role_id,permission_kind,permission_code,allowed
    FROM ai_pdm_core.role_permissions ORDER BY id ${readOnly ? '' : 'FOR UPDATE'}
  `
  const observedRoles = await rows(client, selectRoles)
  const observedPermissions = await rows(client, selectPermissions)
  if (observedRoles.length > 0 || observedPermissions.length > 0) {
    if (!exactRows(observedRoles, expected.roles,
      ['id', 'role_code', 'title', 'system_defined', 'enabled'], ['system_defined', 'enabled']) ||
      !exactRows(observedPermissions, expected.rolePermissions,
        ['id', 'role_id', 'permission_kind', 'permission_code', 'allowed'], ['allowed'])) {
      fail('NATIVE_ROLE_PROJECTION_COLLISION')
    }
    return Object.freeze({ created: false, catalogVersion: catalog.catalogVersion,
      roleCount: expected.roles.length, permissionCount: expected.rolePermissions.length })
  }
  if (readOnly) fail('NATIVE_ROLE_PROJECTION_MISSING')

  for (const role of expected.roles) await writeOne(client, `
    INSERT INTO ai_pdm_core.roles
      (id,role_code,title,system_defined,enabled,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp())
  `, [role.id, role.role_code, role.title, role.system_defined, role.enabled])
  for (const permission of expected.rolePermissions) await writeOne(client, `
    INSERT INTO ai_pdm_core.role_permissions
      (id,role_id,permission_kind,permission_code,allowed,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp())
  `, [permission.id, permission.role_id, permission.permission_kind,
    permission.permission_code, permission.allowed])

  const readbackRoles = await rows(client, selectRoles)
  const readbackPermissions = await rows(client, selectPermissions)
  if (!exactRows(readbackRoles, expected.roles,
    ['id', 'role_code', 'title', 'system_defined', 'enabled'], ['system_defined', 'enabled']) ||
    !exactRows(readbackPermissions, expected.rolePermissions,
      ['id', 'role_id', 'permission_kind', 'permission_code', 'allowed'], ['allowed'])) {
    fail('NATIVE_ROLE_PROJECTION_WRITE_READBACK_FAILED')
  }
  return Object.freeze({ created: true, catalogVersion: catalog.catalogVersion,
    roleCount: expected.roles.length, permissionCount: expected.rolePermissions.length })
}

function priorityId(target, policy) {
  const digest = createHash('sha256').update([
    APPLICATION_ID, target.sandboxId, target.generation, target.fixtureHash, policy.sha256,
  ].join('\n')).digest('hex')
  return Object.freeze({ id: `role-priority-local-${digest.slice(0, 24)}`,
    versionCode: `role-priority-local-${digest.slice(24, 48)}` })
}

function samePriorityRow(row, expected) {
  return row.id === expected.id && row.version_code === expected.versionCode &&
    row.priority_json === expected.priorityJson && row.status === 'active' && row.created_by == null
}

async function ensureActiveRolePriority(client, target, catalog, policy, readOnly = false) {
  const publishedRoleSet = new Set(catalog.roles.map(role => role.roleCode))
  const active = await rows(client, `
    SELECT id,version_code,priority_json,status,created_by
    FROM ai_pdm_core.role_priority_versions WHERE status='active' ORDER BY id ${readOnly ? '' : 'FOR UPDATE'}
  `)
  if (active.length > 1) fail('ROLE_PRIORITY_ACTIVE_CARDINALITY_INVALID')
  if (active.length === 1) {
    const priority = parseRolePriority(active[0].priority_json, publishedRoleSet)
    if (priority.length !== publishedRoleSet.size ||
      [...publishedRoleSet].some(code => !priority.includes(code))) fail('ROLE_PRIORITY_ACTIVE_CATALOG_MISMATCH')
    return Object.freeze({ created: false, versionCode: active[0].version_code,
      priority: Object.freeze(priority), policySha256: policy.sha256 })
  }
  if (readOnly) fail('ROLE_PRIORITY_ACTIVE_MISSING')

  const identity = priorityId(target, policy)
  const priorityJson = JSON.stringify(policy.roleCodes)
  const collisions = await rows(client, `
    SELECT id,version_code,status,priority_json,created_by
    FROM ai_pdm_core.role_priority_versions
    WHERE id=$1 OR version_code=$2
    ORDER BY id
    FOR UPDATE
  `, [identity.id, identity.versionCode])
  if (collisions.length !== 0) fail('ROLE_PRIORITY_IDENTITY_COLLISION')

  await writeOne(client, `
    INSERT INTO ai_pdm_core.role_priority_versions
      (id,version_code,priority_json,status,created_by,created_at)
    VALUES ($1,$2,$3,'active',NULL,clock_timestamp())
  `, [identity.id, identity.versionCode, priorityJson])
  const expected = { ...identity, priorityJson }
  const readback = await rows(client, `
    SELECT id,version_code,priority_json,status,created_by
    FROM ai_pdm_core.role_priority_versions WHERE id=$1
  `, [identity.id])
  if (readback.length !== 1 || !samePriorityRow(readback[0], expected)) fail('ROLE_PRIORITY_WRITE_READBACK_FAILED')
  const activeReadback = await rows(client, `
    SELECT id,version_code,priority_json,status,created_by
    FROM ai_pdm_core.role_priority_versions WHERE status='active' ORDER BY id FOR UPDATE
  `)
  if (activeReadback.length !== 1 || !samePriorityRow(activeReadback[0], expected)) {
    fail('ROLE_PRIORITY_ACTIVE_READBACK_FAILED')
  }
  return Object.freeze({ created: true, versionCode: identity.versionCode,
    priority: policy.roleCodes, policySha256: policy.sha256 })
}

function targetFingerprint(target) {
  return contractDigest({
    applicationId: APPLICATION_ID,
    sandboxId: target.sandboxId,
    databaseName: target.databaseName,
    sandboxRoot: target.sandboxRoot,
    dataDirectory: target.dataDirectory,
    repositoryDirectory: target.repositoryDirectory,
    generation: target.generation,
    fixtureVersion: target.fixtureVersion,
    fixtureHash: target.fixtureHash,
    nativeSessionContractVersion: NATIVE_SESSION_CONTRACT_VERSION,
  })
}

function metadataMatches(row, target, fingerprint) {
  return row.application_id === APPLICATION_ID && row.sandbox_id === target.sandboxId &&
    row.database_name === target.databaseName && row.generation === target.generation &&
    row.fixture_version === target.fixtureVersion && row.fixture_hash === target.fixtureHash &&
    row.native_session_contract_version === NATIVE_SESSION_CONTRACT_VERSION &&
    row.sandbox_root === target.sandboxRoot && row.data_directory === target.dataDirectory &&
    row.repository_directory === target.repositoryDirectory && row.target_fingerprint === fingerprint
}

function metadataFingerprint(row) {
  if (typeof row.sandbox_root !== 'string' || !path.isAbsolute(row.sandbox_root) ||
    typeof row.data_directory !== 'string' || !path.isAbsolute(row.data_directory) ||
    typeof row.repository_directory !== 'string' || !path.isAbsolute(row.repository_directory)) return null
  return contractDigest({
    applicationId: row.application_id,
    sandboxId: row.sandbox_id,
    databaseName: row.database_name,
    sandboxRoot: path.resolve(row.sandbox_root),
    dataDirectory: path.resolve(row.data_directory),
    repositoryDirectory: path.resolve(row.repository_directory),
    generation: row.generation,
    fixtureVersion: row.fixture_version,
    fixtureHash: row.fixture_hash,
    nativeSessionContractVersion: row.native_session_contract_version,
  })
}

function previousMaintenanceMetadataIsKnown(row, target) {
  return row.status === 'maintenance' && row.application_id === APPLICATION_ID &&
    row.sandbox_id === target.sandboxId && row.database_name === target.databaseName &&
    GENERATION.test(row.generation ?? '') && FIXTURE_VERSION.test(row.fixture_version ?? '') &&
    HASH.test(row.fixture_hash ?? '') &&
    row.native_session_contract_version === NATIVE_SESSION_CONTRACT_VERSION &&
    row.sandbox_root === target.sandboxRoot && row.data_directory === target.dataDirectory &&
    row.repository_directory === target.repositoryDirectory &&
    HASH.test(row.target_fingerprint ?? '') && row.target_fingerprint === metadataFingerprint(row)
}

async function advanceMaintenanceMetadata(client, oldRow, target, fingerprint) {
  const result = await client.query(`
    UPDATE ai_pdm_core.local_sandbox_target_metadata
    SET status='ready',generation=$12,fixture_version=$13,fixture_hash=$14,
        native_session_contract_version=$15,sandbox_root=$16,data_directory=$17,
        repository_directory=$18,target_fingerprint=$19,updated_at=clock_timestamp()
    WHERE application_id=$1 AND sandbox_id=$2 AND status='maintenance' AND database_name=$3
      AND generation=$4 AND fixture_version=$5 AND fixture_hash=$6
      AND native_session_contract_version=$7 AND sandbox_root=$8 AND data_directory=$9
      AND repository_directory=$10 AND target_fingerprint=$11
  `, [oldRow.application_id, oldRow.sandbox_id, oldRow.database_name, oldRow.generation,
    oldRow.fixture_version, oldRow.fixture_hash, oldRow.native_session_contract_version,
    oldRow.sandbox_root, oldRow.data_directory, oldRow.repository_directory, oldRow.target_fingerprint,
    target.generation, target.fixtureVersion, target.fixtureHash, NATIVE_SESSION_CONTRACT_VERSION,
    target.sandboxRoot, target.dataDirectory, target.repositoryDirectory, fingerprint])
  if (!result || result.rowCount !== 1) fail('TARGET_METADATA_READY_TRANSITION_FAILED')
  const select = `
    SELECT application_id,sandbox_id,database_name,status,generation,fixture_version,fixture_hash,
           native_session_contract_version,sandbox_root,data_directory,repository_directory,target_fingerprint
    FROM ai_pdm_core.local_sandbox_target_metadata
    WHERE application_id=$1 AND sandbox_id=$2
    FOR UPDATE
  `
  const readback = await rows(client, select, [APPLICATION_ID, target.sandboxId])
  if (readback.length !== 1 || readback[0].status !== 'ready' ||
    !metadataMatches(readback[0], target, fingerprint)) fail('TARGET_METADATA_WRITE_READBACK_FAILED')
}

async function ensureReadyTargetMetadata(client, target, fingerprint, readOnly = false) {
  const select = `
    SELECT application_id,sandbox_id,database_name,status,generation,fixture_version,fixture_hash,
           native_session_contract_version,sandbox_root,data_directory,repository_directory,target_fingerprint
    FROM ai_pdm_core.local_sandbox_target_metadata
    WHERE application_id=$1 AND sandbox_id=$2
    ${readOnly ? '' : 'FOR UPDATE'}
  `
  const key = [APPLICATION_ID, target.sandboxId]
  const existing = await rows(client, select, key)
  if (existing.length > 1) fail('TARGET_METADATA_CARDINALITY_INVALID')
  if (existing.length === 1) {
    const row = existing[0]
    if (row.status === 'ready') {
      if (!metadataMatches(row, target, fingerprint)) fail('TARGET_METADATA_COLLISION')
      return Object.freeze({ created: false, status: 'ready' })
    }
    if (readOnly) fail('TARGET_METADATA_NOT_READY')
    if (!metadataMatches(row, target, fingerprint) && !previousMaintenanceMetadataIsKnown(row, target)) {
      fail('TARGET_METADATA_COLLISION')
    }
    await advanceMaintenanceMetadata(client, row, target, fingerprint)
    return Object.freeze({ created: false, status: 'ready' })
  }

  if (readOnly) fail('TARGET_METADATA_MISSING')

  await writeOne(client, `
    INSERT INTO ai_pdm_core.local_sandbox_target_metadata
      (application_id,sandbox_id,database_name,status,generation,fixture_version,fixture_hash,
       native_session_contract_version,sandbox_root,data_directory,repository_directory,target_fingerprint,
       created_at,updated_at)
    VALUES ($1,$2,$3,'ready',$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp(),clock_timestamp())
  `, [APPLICATION_ID, target.sandboxId, target.databaseName, target.generation, target.fixtureVersion,
    target.fixtureHash, NATIVE_SESSION_CONTRACT_VERSION, target.sandboxRoot, target.dataDirectory,
    target.repositoryDirectory, fingerprint])
  const readback = await rows(client, select, key)
  if (readback.length !== 1 || readback[0].status !== 'ready' ||
    !metadataMatches(readback[0], target, fingerprint)) fail('TARGET_METADATA_WRITE_READBACK_FAILED')
  return Object.freeze({ created: true, status: 'ready' })
}

/**
 * Return only the durable business-baseline fields used for coordinator resume
 * receipts. Capture and verify-only must hash the same material.
 */
export function dev126LocalBusinessBaselineResultMaterial(result) {
  return Object.freeze({
    companyId: result.company.companyId,
    catalogProjection: Object.freeze({ catalogVersion: result.catalogProjection.catalogVersion,
      roleCount: result.catalogProjection.roleCount, permissionCount: result.catalogProjection.permissionCount }),
    rolePriority: Object.freeze({ versionCode: result.rolePriority.versionCode,
      priority: result.rolePriority.priority, policySha256: result.rolePriority.policySha256 }),
    workbenchAuthority: Object.freeze({ id: result.workbenchAuthority.id, mode: result.workbenchAuthority.mode,
      expectedCommit: result.workbenchAuthority.expectedCommit, schemaHash: result.workbenchAuthority.schemaHash,
      rowVersion: result.workbenchAuthority.rowVersion, switchedAt: result.workbenchAuthority.switchedAt }),
    metadata: Object.freeze({ status: result.metadata.status, targetFingerprint: result.metadata.targetFingerprint }),
  })
}

/**
 * Verify the complete business baseline under one repeatable, read-only
 * snapshot. This entry never repairs missing or drifted state.
 *
 * @param {InitializeDev126LocalBusinessBaselineInput} input
 */
export async function verifyDev126LocalBusinessBaseline(input) {
  const target = validateInput(input)
  const { client, scopedMigratorSessionUser } = input
  if (scopedMigratorSessionUser !== 'postgres') fail('VERIFY_ADMIN_SESSION_REQUIRED')

  await assertActualTarget(client, target, 'postgres', 'postgres')
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  let commitAttempted = false
  try {
    await client.query(`SET LOCAL ROLE ${MIGRATOR_ROLE}`)
    await assertActualTarget(client, target, 'postgres', MIGRATOR_ROLE)
    await assertSchemaOwner(client)
    await assertRuntimeMetadataReadOnly(client)
    await assertRuntimeWorkbenchAuthorityReadOnly(client)
    await assertZeroPrincipalSessions(client)

    const workbenchAuthority = await ensureCanonicalWorkbenchAuthority(client,
      input.workbenchAuthorityExpectedCommit, true)
    const company = await ensureJenfuCompany(client, true)
    const catalog = await readPublishedCatalog(client, input.localPriorityPolicy)
    const catalogProjection = await ensureCatalogRoleProjection(client, catalog, true)
    const rolePriority = await ensureActiveRolePriority(client, target, catalog, input.localPriorityPolicy, true)
    const fingerprint = targetFingerprint(target)
    const metadata = await ensureReadyTargetMetadata(client, target, fingerprint, true)
    const result = Object.freeze({ company, catalogProjection, rolePriority, workbenchAuthority,
      metadata: Object.freeze({ ...metadata, targetFingerprint: fingerprint }) })

    commitAttempted = true
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (commitAttempted) fail('COMMIT_RESULT_UNKNOWN', error)
    throw error
  }
}

/**
 * Create only the canonical JENFU business company, project the active published
 * catalog into native roles/permissions, establish a sandbox-bound local role
 * priority only when absent, bind an existing DEV-090 canonical authority row
 * only when its expected commit is blank, and publish exact 091 target metadata.
 * It never advances the workbench mode or repairs an authority/schema mismatch.
 * All writes are one scoped-migrator transaction.
 *
 * @param {InitializeDev126LocalBusinessBaselineInput} input
 */
export async function initializeDev126LocalBusinessBaseline(input) {
  const target = validateInput(input)
  const { client, scopedMigratorSessionUser } = input

  await assertActualTarget(client, target, scopedMigratorSessionUser, scopedMigratorSessionUser)
  await client.query('BEGIN')
  let commitAttempted = false
  try {
    await client.query(`SET LOCAL ROLE ${MIGRATOR_ROLE}`)
    await assertActualTarget(client, target, scopedMigratorSessionUser, MIGRATOR_ROLE)
    await assertSchemaOwner(client)
    await client.query(`
      LOCK TABLE ai_pdm_core.pdm_workbench_state_authority_control,
                 ai_pdm_core.companies,
                 ai_pdm_core.roles,
                 ai_pdm_core.role_permissions,
                 ai_pdm_core.role_priority_versions,
                 ai_pdm_core.local_sandbox_target_metadata
      IN SHARE ROW EXCLUSIVE MODE
    `)
    await assertRuntimeMetadataReadOnly(client)
    await assertRuntimeWorkbenchAuthorityReadOnly(client)

    const workbenchAuthority = await ensureCanonicalWorkbenchAuthority(client,
      input.workbenchAuthorityExpectedCommit)

    const company = await ensureJenfuCompany(client)
    const catalog = await readPublishedCatalog(client, input.localPriorityPolicy)
    const catalogProjection = await ensureCatalogRoleProjection(client, catalog)
    const rolePriority = await ensureActiveRolePriority(client, target, catalog, input.localPriorityPolicy)
    const fingerprint = targetFingerprint(target)
    const metadata = await ensureReadyTargetMetadata(client, target, fingerprint)
    const result = Object.freeze({
      company,
      catalogProjection,
      rolePriority,
      workbenchAuthority,
      metadata: Object.freeze({ ...metadata, targetFingerprint: fingerprint }),
    })

    commitAttempted = true
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (commitAttempted) fail('COMMIT_RESULT_UNKNOWN', error)
    throw error
  }
}
