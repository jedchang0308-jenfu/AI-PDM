import crypto from 'node:crypto'

export const DEV013_AI_PDM_FIXTURE_VERSION = 'jenfu.dev013.ai-pdm-l3-p-both-fixture.v1'
export const DEV013_AI_PDM_FIXTURE_APPROVAL = 'DEV013-L3-P-BOTH-FIXTURE-AUTHORIZED'
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

export async function applyDev013AiPdmFixture(client, fixture) {
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
      to_regclass('ai_pdm_core.platform_organization_mappings') IS NOT NULL AS organization_mappings`)).rows[0]
    if (!boundary || Object.values(boundary).some((value) => value !== true)) throw new Error('DEV013_AI_PDM_SCHEMA_INCOMPLETE')

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
    return { replayed, localAccountCount: readback.length, companyId: row.company_id, role: row.role }
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
    containsRawIdentity: false,
  }
}
