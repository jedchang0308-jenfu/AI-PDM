import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { canonicalRole, validateRoleCatalog } from './jms-dev-005-role-catalog.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const SAFE_ID = /^[A-Za-z0-9._:@/-]+$/u

export const DEV013_CATALOG_TARGET = Object.freeze({
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  instance: 'jenfu-platform-prod-pg',
  connectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  database: 'jenfu_prod',
  applicationId: 'ai-pdm',
  jobName: 'ai-pdm-prod-dev013-role-catalog-publisher',
  serviceAccount: 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com',
  login: 'aipdm-prod-migrator@jenfu-platform-prod.iam',
  migratorRole: 'jenfu_ai_pdm_migrator',
  releaseBucket: 'jenfu-platform-prod-aipdm-release',
  operationPrefix: 'source/migration-bundles/dev013/role-catalog',
  receiptPrefix: 'receipts/releases/DEV013-ROLE-CATALOG',
  actor: 'jedchang0308@jenfu.com.tw',
})

export class Dev013CatalogPublicationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') { throw new Dev013CatalogPublicationError(code, detail) }
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}

export function parseCatalogRunnerArgs(argv) {
  const required = ['--operation-ref', '--operation-sha256', '--source-revision', '--output-ref']
  const allowed = new Set(required)
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const name = key?.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    if (!allowed.has(key) || !argv[index + 1] || parsed[name]) fail('DEV013_CATALOG_ARGUMENT_INVALID', String(key))
    parsed[name] = argv[index + 1]
  }
  if (Object.keys(parsed).length !== required.length || !H40.test(parsed.sourceRevision ?? '') || !H64.test(parsed.operationSha256 ?? '')) fail('DEV013_CATALOG_ARGUMENT_INVALID')
  return parsed
}

export function assertCatalogRunnerTarget(environment, target = DEV013_CATALOG_TARGET) {
  const observed = {
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    connectionName: environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
    database: environment.POSTGRES_DATABASE,
    login: environment.POSTGRES_IAM_LOGIN,
    socket: environment.POSTGRES_SOCKET,
    job: environment.CLOUD_RUN_JOB,
    sourceRevision: environment.SOURCE_REVISION,
  }
  const expected = {
    projectId: target.projectId,
    region: target.region,
    connectionName: target.connectionName,
    database: target.database,
    login: target.login,
    socket: `/cloudsql/${target.connectionName}`,
    job: target.jobName,
    sourceRevision: environment.SOURCE_REVISION,
  }
  if (!H40.test(observed.sourceRevision ?? '') || canonicalize(observed) !== canonicalize(expected)) fail('DEV013_CATALOG_TARGET_MISMATCH')
  return observed
}

export function buildCatalogOperation({ sourceRevision, deadlineAt, catalog }) {
  validateRoleCatalog(catalog)
  if (!H40.test(sourceRevision ?? '') || !Number.isFinite(Date.parse(deadlineAt))) fail('DEV013_CATALOG_OPERATION_BUILD_INPUT_INVALID')
  return {
    schemaVersion: 'jenfu.dev013.production-role-catalog-operation.v1',
    sourceRevision,
    projectId: DEV013_CATALOG_TARGET.projectId,
    region: DEV013_CATALOG_TARGET.region,
    instance: DEV013_CATALOG_TARGET.instance,
    database: DEV013_CATALOG_TARGET.database,
    applicationId: DEV013_CATALOG_TARGET.applicationId,
    catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256,
    operationId: `dev013-ai-pdm-role-catalog-${sourceRevision.slice(0, 12)}`,
    actor: DEV013_CATALOG_TARGET.actor,
    reason: 'DEV-013 publish missing AI-PDM Production role catalog prerequisite',
    deadlineAt,
  }
}

export function encodeCatalogOperation(operation) {
  const bytes = Buffer.from(`${canonicalize(operation)}\n`, 'utf8')
  return { bytes, sha256: sha256(bytes) }
}

export function assertCatalogOperation(value, { bytes, operationSha256, sourceRevision, catalog, now = new Date() }) {
  validateRoleCatalog(catalog)
  const keys = ['schemaVersion', 'sourceRevision', 'projectId', 'region', 'instance', 'database', 'applicationId', 'catalogVersion', 'catalogSha256', 'operationId', 'actor', 'reason', 'deadlineAt']
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256 || !exactKeys(value, keys)
    || value.schemaVersion !== 'jenfu.dev013.production-role-catalog-operation.v1'
    || value.sourceRevision !== sourceRevision || !H40.test(value.sourceRevision)
    || value.projectId !== DEV013_CATALOG_TARGET.projectId || value.region !== DEV013_CATALOG_TARGET.region
    || value.instance !== DEV013_CATALOG_TARGET.instance || value.database !== DEV013_CATALOG_TARGET.database
    || value.applicationId !== DEV013_CATALOG_TARGET.applicationId
    || value.catalogVersion !== catalog.catalogVersion || value.catalogSha256 !== catalog.catalogSha256
    || value.actor !== DEV013_CATALOG_TARGET.actor || !SAFE_ID.test(value.operationId ?? '')
    || typeof value.reason !== 'string' || value.reason.trim().length < 8 || value.reason.length > 240
    || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.deadlineAt) <= now.getTime()
    || Date.parse(value.deadlineAt) - now.getTime() > 8 * 60 * 60 * 1000) fail('DEV013_CATALOG_OPERATION_INVALID')
  return structuredClone(value)
}

function expectedRoleFingerprint(role) {
  return { ...JSON.parse(canonicalRole(role)), roleDefinitionHash: role.roleDefinitionHash }
}

function storedRoleFingerprint(row) {
  return {
    stableRoleId: row.stable_role_id,
    roleCode: row.role_code,
    displayName: row.display_name,
    assignable: row.assignable,
    risk: row.risk,
    subjectKind: row.subject_kind,
    recommendationAllowed: row.recommendation_allowed,
    delegationAllowed: row.delegation_allowed,
    allowedScopeKinds: row.allowed_scope_kinds,
    assignmentTier: row.assignment_tier,
    permissions: row.permissions,
    metadata: row.metadata ?? null,
    roleDefinitionHash: row.role_definition_hash,
  }
}

async function readState(database, catalog) {
  const publications = (await database.query(`SELECT catalog_version,catalog_sha256,status,published_by
    FROM ai_pdm_core.role_catalog_publications
    WHERE application_id=$1 ORDER BY catalog_version`, [catalog.applicationId])).rows
  const entries = (await database.query(`SELECT display_order,stable_role_id,role_code,display_name,assignable,risk,
      subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash
    FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1 ORDER BY display_order`, [catalog.catalogVersion])).rows
  const active = (await database.query(`SELECT application_id,catalog_version,activated_at,activated_by,activation_reason
    FROM ai_pdm_core.active_role_catalog WHERE application_id=$1`, [catalog.applicationId])).rows
  const contract = (await database.query(`SELECT catalog_version,catalog_sha256,display_order,stable_role_id,role_code
    FROM ai_pdm_contract.v_application_role_catalog_v1 WHERE application_id=$1 ORDER BY display_order`, [catalog.applicationId])).rows
  return { publications, entries, active, contract }
}

function assertExactState(state, catalog, { allowEmpty, operation = null }) {
  if (allowEmpty && state.publications.length === 0 && state.entries.length === 0 && state.active.length === 0 && state.contract.length === 0) return 'empty'
  if (state.publications.length !== 1 || state.publications[0].catalog_version !== catalog.catalogVersion
    || state.publications[0].catalog_sha256 !== catalog.catalogSha256 || state.publications[0].status !== 'active'
    || state.entries.length !== catalog.roles.length || state.active.length !== 1
    || state.active[0].application_id !== catalog.applicationId || state.active[0].catalog_version !== catalog.catalogVersion
    || state.contract.length !== catalog.roles.length) fail('DEV013_CATALOG_STATE_INVALID')
  if (operation && (state.publications[0].published_by !== operation.operationId
    || state.active[0].activated_by !== operation.operationId || state.active[0].activation_reason !== operation.reason)) fail('DEV013_CATALOG_OPERATION_PROVENANCE_INVALID')
  state.entries.forEach((row, index) => {
    if (Number(row.display_order) !== index || !isDeepStrictEqual(storedRoleFingerprint(row), expectedRoleFingerprint(catalog.roles[index]))) fail('DEV013_CATALOG_ENTRY_INVALID', catalog.roles[index].stableRoleId)
  })
  state.contract.forEach((row, index) => {
    const role = catalog.roles[index]
    if (row.catalog_version !== catalog.catalogVersion || row.catalog_sha256 !== catalog.catalogSha256
      || Number(row.display_order) !== index || row.stable_role_id !== role.stableRoleId || row.role_code !== role.roleCode) fail('DEV013_CATALOG_CONTRACT_READBACK_INVALID')
  })
  return 'active'
}

export async function publishProductionRoleCatalog({ database, operation, catalog, target = DEV013_CATALOG_TARGET, now = () => new Date().toISOString() }) {
  validateRoleCatalog(catalog)
  const boundary = (await database.query("SELECT current_database() AS database,current_user AS \"user\",current_setting('server_version_num')::integer / 10000 AS \"postgresMajor\",pg_has_role(current_user,$1,'MEMBER') AS \"migratorMember\"", [target.migratorRole])).rows[0]
  if (boundary?.database !== target.database || boundary?.user !== target.login || Number(boundary?.postgresMajor) !== 17 || boundary?.migratorMember !== true) fail('DEV013_CATALOG_DATABASE_BOUNDARY_FAILED')
  await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  let before
  let mutationCount = 0
  try {
    await database.query("SELECT pg_advisory_xact_lock(hashtext('dev013-ai-pdm-role-catalog'),hashtext(current_database()))")
    await database.query(`SET LOCAL ROLE ${target.migratorRole}`)
    before = await readState(database, catalog)
    const disposition = assertExactState(before, catalog, { allowEmpty: true, operation })
    if (disposition === 'empty') {
      await database.query(`INSERT INTO ai_pdm_core.role_catalog_publications
        (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
        VALUES($1,$2,$3,$4,$5,'active',$6)`, [catalog.catalogVersion, catalog.contractVersion, catalog.applicationId, catalog.publishedAt, catalog.catalogSha256, operation.operationId])
      mutationCount += 1
      for (const [displayOrder, role] of catalog.roles.entries()) {
        await database.query(`INSERT INTO ai_pdm_core.role_catalog_entries
          (catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`, [catalog.catalogVersion, displayOrder, role.stableRoleId, role.roleCode, role.displayName, role.assignable, role.risk, role.subjectKind, role.recommendationAllowed, role.delegationAllowed, JSON.stringify(role.allowedScopeKinds), role.assignmentTier, JSON.stringify(role.permissions), JSON.stringify(role.metadata ?? null), role.roleDefinitionHash])
        mutationCount += 1
      }
      await database.query(`INSERT INTO ai_pdm_core.active_role_catalog
        (application_id,catalog_version,activated_at,activated_by,activation_reason)
        VALUES($1,$2,clock_timestamp(),$3,$4)`, [catalog.applicationId, catalog.catalogVersion, operation.operationId, operation.reason])
      mutationCount += 1
    }
    const after = await readState(database, catalog)
    assertExactState(after, catalog, { allowEmpty: false, operation })
    await database.query('COMMIT')
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
  const committed = await readState(database, catalog)
  assertExactState(committed, catalog, { allowEmpty: false, operation })
  const core = {
    schemaVersion: 'jenfu.dev013.production-role-catalog-receipt.v1',
    sourceRevision: operation.sourceRevision,
    operationId: operation.operationId,
    manifestDeadlineAt: operation.deadlineAt,
    target: { projectId: target.projectId, region: target.region, instance: target.instance, database: target.database, applicationId: target.applicationId },
    boundary,
    catalog: { catalogVersion: catalog.catalogVersion, catalogSha256: catalog.catalogSha256, roleCount: catalog.roles.length },
    before: { publicationCount: 0, entryCount: 0, activeCount: 0, contractCount: 0 },
    after: { publicationCount: committed.publications.length, entryCount: committed.entries.length, activeCount: committed.active.length, contractCount: committed.contract.length },
    databaseEffect: 'APPLIED_ONCE',
    mutationCount: catalog.roles.length + 2,
    replaySafe: true,
    committedAt: new Date(committed.active[0].activated_at).toISOString(),
    status: 'PASS',
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}
