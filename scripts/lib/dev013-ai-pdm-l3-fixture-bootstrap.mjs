import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEV013_AI_PDM_FIXTURE_VERSION = 'jenfu.dev013.ai-pdm-l3-p-both-fixture.v1'
export const DEV013_AI_PDM_FIXTURE_APPROVAL = 'DEV013-L3-P-BOTH-FIXTURE-AUTHORIZED'
export const DEV013_AI_PDM_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-03.v3'
export const DEV013_AI_PDM_CATALOG_SHA256 = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8'
const DEV013_AI_PDM_ROLE_IDS = [
  'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
  'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin',
]
export const DEV013_AI_PDM_FIXTURE_TARGET = Object.freeze({
  projectId: 'jenfu-platform-nonprod',
  region: 'asia-east1',
  cloudSqlInstance: 'jenfu-platform-nonprod-pg',
  database: 'jenfu_stg',
  databaseUser: 'dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam',
  role: 'jenfu_ai_pdm_migrator',
})

const FIXTURE = Object.freeze({
  principalId: 'principal-dev013-p-both',
  employeeId: 'employee-dev013-p-both',
  userId: 'user-dev013-p-both',
  companyId: 'company-dev013-l3',
  companyCode: 'DEV013L3',
  organizationId: 'organization-dev013-l3',
  organizationKey: 'dev013-l3',
  email: 'dev013-p-both@example.invalid',
  displayName: 'DEV-013 Synthetic P_BOTH',
  role: 'Engineer',
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function canonicalRole(role) {
  return JSON.stringify({
    stableRoleId: role.stableRoleId,
    roleCode: role.roleCode,
    displayName: role.displayName,
    assignable: role.assignable,
    risk: role.risk,
    subjectKind: role.subjectKind,
    recommendationAllowed: role.recommendationAllowed,
    delegationAllowed: role.delegationAllowed,
    allowedScopeKinds: [...role.allowedScopeKinds].sort(),
    assignmentTier: role.assignmentTier,
    permissions: [...role.permissions].sort((a, b) => `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)),
    metadata: role.metadata ?? null,
  })
}

function canonicalCatalog(catalog) {
  return JSON.stringify({
    contractVersion: catalog.contractVersion,
    applicationId: catalog.applicationId,
    catalogVersion: catalog.catalogVersion,
    roles: catalog.roles.map((role) => ({ ...JSON.parse(canonicalRole(role)), roleDefinitionHash: role.roleDefinitionHash })),
  })
}

export function validateDev013AiPdmRoleCatalog(catalog) {
  assert.equal(catalog.contractVersion, 'jenfu.platform-entitlement.v1')
  assert.equal(catalog.applicationId, 'ai-pdm')
  assert.equal(catalog.catalogVersion, DEV013_AI_PDM_CATALOG_VERSION)
  assert.ok(Number.isFinite(Date.parse(catalog.publishedAt)))
  assert.deepEqual(catalog.roles.map((role) => role.stableRoleId), DEV013_AI_PDM_ROLE_IDS)
  assert.equal(catalog.catalogSha256, DEV013_AI_PDM_CATALOG_SHA256)
  assert.equal(sha256(canonicalCatalog(catalog)), DEV013_AI_PDM_CATALOG_SHA256)
  for (const role of catalog.roles) assert.equal(role.roleDefinitionHash, sha256(canonicalRole(role)))
  return catalog
}

export function readDev013AiPdmRoleCatalog(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  return validateDev013AiPdmRoleCatalog(JSON.parse(fs.readFileSync(path.join(root, 'config', 'access-control', 'jenfu-role-catalog.v1.json'), 'utf8')))
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

function expectedRoleFingerprint(role) {
  return { ...JSON.parse(canonicalRole(role)), roleDefinitionHash: role.roleDefinitionHash }
}

export function assertDev013AiPdmFixtureEnvironment(env = process.env) {
  const exact = [
    ['DEV013_L3_FIXTURE_APPROVAL', DEV013_AI_PDM_FIXTURE_APPROVAL],
    ['DEV013_TARGET_PROJECT_ID', DEV013_AI_PDM_FIXTURE_TARGET.projectId],
    ['DEV013_TARGET_REGION', DEV013_AI_PDM_FIXTURE_TARGET.region],
    ['DEV013_TARGET_CLOUD_SQL_INSTANCE', DEV013_AI_PDM_FIXTURE_TARGET.cloudSqlInstance],
    ['DEV013_TARGET_DATABASE', DEV013_AI_PDM_FIXTURE_TARGET.database],
    ['DEV013_DATABASE_USER', DEV013_AI_PDM_FIXTURE_TARGET.databaseUser],
  ]
  for (const [key, expected] of exact) if (env[key] !== expected) throw new Error(`DEV013_FIXTURE_TARGET_MISMATCH:${key}`)
  const identitySubject = String(env.DEV013_FIXTURE_FIREBASE_UID ?? '').trim()
  if (!/^[A-Za-z0-9_-]{20,128}$/u.test(identitySubject)) throw new Error('DEV013_FIXTURE_SUBJECT_INVALID')
  return { identitySubject }
}

export function buildDev013AiPdmFixture(identitySubject) {
  if (!/^[A-Za-z0-9_-]{20,128}$/u.test(identitySubject)) throw new Error('DEV013_FIXTURE_SUBJECT_INVALID')
  return {
    fixtureVersion: DEV013_AI_PDM_FIXTURE_VERSION,
    ...FIXTURE,
    identitySubject,
    subjectFingerprintSha256: sha256(identitySubject),
    fixtureFingerprintSha256: sha256(JSON.stringify({ version: DEV013_AI_PDM_FIXTURE_VERSION, ...FIXTURE, subjectFingerprintSha256: sha256(identitySubject) })),
  }
}

function sameBoolean(value, expected) {
  return value === expected || Number(value) === Number(expected)
}

export async function applyDev013AiPdmFixture(client, fixture, rawCatalog = readDev013AiPdmRoleCatalog()) {
  const catalog = validateDev013AiPdmRoleCatalog(rawCatalog)
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s'; SET LOCAL idle_in_transaction_session_timeout = '30s'")
    const identity = (await client.query('SELECT current_database() AS database_name, current_user AS database_user')).rows[0]
    if (identity?.database_name !== DEV013_AI_PDM_FIXTURE_TARGET.database || identity?.database_user !== DEV013_AI_PDM_FIXTURE_TARGET.databaseUser) throw new Error('DEV013_DATABASE_IDENTITY_MISMATCH')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dev013-l3-ai-pdm-p-both'), hashtext(current_database()))")
    await client.query(`SET LOCAL ROLE ${DEV013_AI_PDM_FIXTURE_TARGET.role}`)
    const boundary = (await client.query(`SELECT
      to_regclass('ai_pdm_core.companies') IS NOT NULL AS companies,
      to_regclass('ai_pdm_core.users') IS NOT NULL AS users,
      to_regclass('ai_pdm_core.user_company_memberships') IS NOT NULL AS memberships,
      to_regclass('ai_pdm_core.platform_principal_mappings') IS NOT NULL AS principal_mappings,
      to_regclass('ai_pdm_core.platform_organization_mappings') IS NOT NULL AS organization_mappings,
      to_regclass('ai_pdm_core.role_catalog_publications') IS NOT NULL AS catalog_publications,
      to_regclass('ai_pdm_core.role_catalog_entries') IS NOT NULL AS catalog_entries,
      to_regclass('ai_pdm_core.active_role_catalog') IS NOT NULL AS active_catalog`)).rows[0]
    if (!boundary || Object.values(boundary).some((value) => value !== true)) throw new Error('DEV013_AI_PDM_SCHEMA_INCOMPLETE')

    const publications = (await client.query(`SELECT catalog_sha256,status FROM ai_pdm_core.role_catalog_publications
      WHERE catalog_version=$1 FOR UPDATE`, [catalog.catalogVersion])).rows
    if (publications.length > 1 || publications.some((row) => row.catalog_sha256 !== catalog.catalogSha256 || row.status === 'retired')) throw new Error('DEV013_ROLE_CATALOG_COLLISION')
    const conflictingActive = (await client.query(`SELECT catalog_version FROM ai_pdm_core.role_catalog_publications
      WHERE application_id='ai-pdm' AND status='active' AND catalog_version<>$1 FOR UPDATE`, [catalog.catalogVersion])).rows
    if (conflictingActive.length) throw new Error('DEV013_DIFFERENT_ACTIVE_ROLE_CATALOG_REFUSED')
    let catalogCreated = false
    if (publications.length === 0) {
      await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications
        (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
        VALUES($1,$2,$3,$4,$5,'draft','dev013-l3-owner-bootstrap')`, [catalog.catalogVersion, catalog.contractVersion, catalog.applicationId, catalog.publishedAt, catalog.catalogSha256])
      for (const [displayOrder, role] of catalog.roles.entries()) await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries
        (catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`, [catalog.catalogVersion, displayOrder, role.stableRoleId, role.roleCode, role.displayName, role.assignable, role.risk, role.subjectKind, role.recommendationAllowed, role.delegationAllowed, JSON.stringify(role.allowedScopeKinds), role.assignmentTier, JSON.stringify(role.permissions), JSON.stringify(role.metadata ?? null), role.roleDefinitionHash])
      catalogCreated = true
    } else {
      const stored = (await client.query(`SELECT display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash
        FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1 ORDER BY display_order`, [catalog.catalogVersion])).rows
      if (stored.length !== catalog.roles.length || stored.some((row, index) => row.display_order !== index || JSON.stringify(storedRoleFingerprint(row)) !== JSON.stringify(expectedRoleFingerprint(catalog.roles[index])))) throw new Error('DEV013_ROLE_CATALOG_STORED_PAYLOAD_INVALID')
    }
    const activeCatalog = (await client.query(`SELECT catalog_version FROM ai_pdm_core.active_role_catalog WHERE application_id='ai-pdm' FOR UPDATE`)).rows
    if (activeCatalog.length > 1 || activeCatalog.some((row) => row.catalog_version !== catalog.catalogVersion)) throw new Error('DEV013_ACTIVE_ROLE_CATALOG_COLLISION')
    await client.query(`UPDATE ai_pdm_core.role_catalog_publications SET status='active',retired_at=NULL WHERE catalog_version=$1`, [catalog.catalogVersion])
    if (activeCatalog.length === 0) await client.query(`INSERT INTO ai_pdm_core.active_role_catalog
      (application_id,catalog_version,activated_at,activated_by,activation_reason)
      VALUES('ai-pdm',$1,clock_timestamp(),'dev013-l3-owner-bootstrap','DEV-013 controlled L3 prerequisite')`, [catalog.catalogVersion])
    const catalogReadback = (await client.query(`SELECT stable_role_id,role_code,assignable,allowed_scope_kinds FROM ai_pdm_contract.v_application_role_catalog_v1 ORDER BY display_order`)).rows
    if (catalogReadback.length !== catalog.roles.length || !catalogReadback.some((row) => row.stable_role_id === 'role-rd' && row.role_code === 'rd' && row.assignable === true && Array.isArray(row.allowed_scope_kinds) && row.allowed_scope_kinds.includes('workspace'))) throw new Error('DEV013_ROLE_CATALOG_READBACK_MISMATCH')

    const companies = (await client.query(`SELECT id,company_code,company_kind,display_name FROM ai_pdm_core.companies WHERE id=$1 OR company_code=$2 FOR UPDATE`, [fixture.companyId, fixture.companyCode])).rows
    if (companies.some((row) => row.id !== fixture.companyId || row.company_code !== fixture.companyCode || row.company_kind !== 'business' || row.display_name !== 'DEV-013 Synthetic')) throw new Error('DEV013_COMPANY_COLLISION')
    const users = (await client.query(`SELECT id,email,display_name,role,company_id,account_status,system_role_enabled FROM ai_pdm_core.users WHERE id=$1 OR lower(email)=lower($2) FOR UPDATE`, [fixture.userId, fixture.email])).rows
    if (users.some((row) => row.id !== fixture.userId || row.email !== fixture.email || row.display_name !== fixture.displayName || row.role !== fixture.role || row.company_id !== fixture.companyId || row.account_status !== 'active' || !sameBoolean(row.system_role_enabled, 1))) throw new Error('DEV013_USER_COLLISION')
    const principals = (await client.query(`SELECT platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject FROM ai_pdm_core.platform_principal_mappings
      WHERE platform_principal_id=$1 OR pdm_user_id=$2 OR (mapping_source='shared_iam' AND external_subject=$3) FOR UPDATE`, [fixture.principalId, fixture.userId, fixture.identitySubject])).rows
    if (principals.some((row) => row.platform_principal_id !== fixture.principalId || row.pdm_user_id !== fixture.userId || row.mapping_source !== 'shared_iam' || row.mapping_status !== 'active' || row.external_subject !== fixture.identitySubject)) throw new Error('DEV013_PRINCIPAL_MAPPING_COLLISION')
    const organizations = (await client.query(`SELECT platform_organization_id,pdm_company_id,mapping_source,mapping_status,external_organization_key FROM ai_pdm_core.platform_organization_mappings
      WHERE platform_organization_id=$1 OR pdm_company_id=$2 OR (mapping_source='shared_core' AND external_organization_key=$3) FOR UPDATE`, [fixture.organizationId, fixture.companyId, fixture.organizationKey])).rows
    if (organizations.some((row) => row.platform_organization_id !== fixture.organizationId || row.pdm_company_id !== fixture.companyId || row.mapping_source !== 'shared_core' || row.mapping_status !== 'active' || row.external_organization_key !== fixture.organizationKey)) throw new Error('DEV013_ORGANIZATION_MAPPING_COLLISION')

    const replayed = companies.length === 1 && users.length === 1 && principals.length === 1 && organizations.length === 1
    await client.query(`INSERT INTO ai_pdm_core.companies(id,company_code,company_kind,display_name,created_at,updated_at)
      VALUES($1,$2,'business','DEV-013 Synthetic',clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO NOTHING`, [fixture.companyId, fixture.companyCode])
    await client.query(`INSERT INTO ai_pdm_core.users(id,display_name,email,password_hash,role,company_id,account_status,account_lifecycle_version,system_role_enabled,created_at,updated_at)
      VALUES($1,$2,$3,NULL,$4,$5,'active',1,1,clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO NOTHING`, [fixture.userId, fixture.displayName, fixture.email, fixture.role, fixture.companyId])
    await client.query(`INSERT INTO ai_pdm_core.user_company_memberships(user_id,company_id,is_default,created_at)
      VALUES($1,$2,1,clock_timestamp()) ON CONFLICT(user_id,company_id) DO NOTHING`, [fixture.userId, fixture.companyId])
    await client.query(`INSERT INTO ai_pdm_core.platform_principal_mappings(platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject,created_at,updated_at)
      VALUES($1,$2,'shared_iam','active',$3,clock_timestamp(),clock_timestamp()) ON CONFLICT(platform_principal_id) DO NOTHING`, [fixture.principalId, fixture.userId, fixture.identitySubject])
    await client.query(`INSERT INTO ai_pdm_core.platform_organization_mappings(platform_organization_id,pdm_company_id,mapping_source,mapping_status,external_organization_key,created_at,updated_at)
      VALUES($1,$2,'shared_core','active',$3,clock_timestamp(),clock_timestamp()) ON CONFLICT(platform_organization_id) DO NOTHING`, [fixture.organizationId, fixture.companyId, fixture.organizationKey])

    const readback = (await client.query(`SELECT u.id AS user_id,u.role,u.company_id,u.account_status,u.system_role_enabled,m.is_default,
      p.platform_principal_id,p.mapping_source,p.mapping_status,p.external_subject,o.platform_organization_id,o.mapping_status AS organization_status
      FROM ai_pdm_core.users u
      JOIN ai_pdm_core.user_company_memberships m ON m.user_id=u.id AND m.company_id=u.company_id
      JOIN ai_pdm_core.platform_principal_mappings p ON p.pdm_user_id=u.id
      JOIN ai_pdm_core.platform_organization_mappings o ON o.pdm_company_id=u.company_id
      WHERE u.id=$1`, [fixture.userId])).rows
    if (readback.length !== 1) throw new Error('DEV013_AI_PDM_READBACK_COUNT_MISMATCH')
    const row = readback[0]
    if (row.role !== fixture.role || row.company_id !== fixture.companyId || row.account_status !== 'active' || !sameBoolean(row.system_role_enabled, 1) || !sameBoolean(row.is_default, 1) || row.platform_principal_id !== fixture.principalId || row.mapping_source !== 'shared_iam' || row.mapping_status !== 'active' || row.external_subject !== fixture.identitySubject || row.platform_organization_id !== fixture.organizationId || row.organization_status !== 'active') throw new Error('DEV013_AI_PDM_READBACK_MISMATCH')
    await client.query('COMMIT')
    return { replayed, localAccountCount: readback.length, companyId: row.company_id, role: row.role, catalogCreated, catalogVersion: catalog.catalogVersion, catalogSha256: catalog.catalogSha256, catalogRoleCount: catalogReadback.length }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export function summarizeDev013AiPdmFixture(fixture, result) {
  return {
    schemaVersion: 'jenfu.dev013.ai-pdm-l3-fixture-receipt.v1',
    status: 'PASS',
    fixtureKey: 'P_BOTH',
    fixtureVersion: fixture.fixtureVersion,
    target: DEV013_AI_PDM_FIXTURE_TARGET,
    fixtureFingerprintSha256: fixture.fixtureFingerprintSha256,
    subjectFingerprintSha256: fixture.subjectFingerprintSha256,
    replayed: result.replayed,
    localAccountCount: result.localAccountCount,
    companyFingerprintSha256: sha256(result.companyId),
    role: result.role,
    catalogCreated: result.catalogCreated,
    catalogVersion: result.catalogVersion,
    catalogSha256: result.catalogSha256,
    catalogRoleCount: result.catalogRoleCount,
    containsRawIdentity: false,
  }
}
