import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'

export const JENFU_ENTITLEMENT_CONTRACT_VERSION = 'jenfu.platform-entitlement.v1'
export const AI_PDM_APPLICATION_ID = 'ai-pdm'
export const AI_PDM_ROLE_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-02.v2'
export const AI_PDM_ROLE_CATALOG_SHA256 = 'ebdaa2960960e0683b480c721d2c27df59031b4af23b124f2ac7e882309f6b6e'
export const AI_PDM_ROLE_IDS = [
  'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
  'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin',
]

export class AiPdmRoleCatalogPublicationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'AiPdmRoleCatalogPublicationError'
    this.code = code
  }
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function canonicalRole(role) {
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

export function canonicalCatalog(catalog) {
  return JSON.stringify({
    contractVersion: catalog.contractVersion,
    applicationId: catalog.applicationId,
    catalogVersion: catalog.catalogVersion,
    roles: catalog.roles.map((role) => ({ ...JSON.parse(canonicalRole(role)), roleDefinitionHash: role.roleDefinitionHash })),
  })
}

export function validateRoleCatalog(catalog) {
  assert.equal(catalog.contractVersion, JENFU_ENTITLEMENT_CONTRACT_VERSION)
  assert.equal(catalog.applicationId, AI_PDM_APPLICATION_ID)
  assert.equal(catalog.catalogVersion, AI_PDM_ROLE_CATALOG_VERSION)
  assert.ok(Number.isFinite(Date.parse(catalog.publishedAt)), 'publishedAt must be an ISO timestamp')
  assert.deepEqual(catalog.roles.map((role) => role.stableRoleId), AI_PDM_ROLE_IDS)
  assert.match(catalog.catalogSha256, /^[a-f0-9]{64}$/u)
  assert.equal(catalog.catalogSha256, AI_PDM_ROLE_CATALOG_SHA256, 'same version must use the approved catalog payload')
  assert.equal(catalog.catalogSha256, sha256(canonicalCatalog(catalog)), 'catalog aggregate hash drift')
  for (const role of catalog.roles) {
    assert.equal(role.roleDefinitionHash, sha256(canonicalRole(role)), `${role.roleCode} definition hash drift`)
  }
  return catalog
}

export async function readRoleCatalog(path) {
  return validateRoleCatalog(JSON.parse(await readFile(path, 'utf8')))
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
  return {
    ...JSON.parse(canonicalRole(role)),
    roleDefinitionHash: role.roleDefinitionHash,
  }
}

export async function publishRoleCatalog(client, rawCatalog, options = {}) {
  const catalog = validateRoleCatalog(rawCatalog)
  const publishedBy = options.publishedBy?.trim() || 'ai-pdm-role-catalog-publisher'
  const activationReason = options.activationReason?.trim() || 'DEV-005 app-owned role catalog publication'
  if (activationReason.length > 240) throw new AiPdmRoleCatalogPublicationError('ACTIVATION_REASON_INVALID')
  await client.query('BEGIN')
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ai-pdm:dev-005:role-catalog-publication'))")
    await client.query('SET LOCAL ROLE jenfu_platform_migrator')
    const existing = await client.query(
      `SELECT catalog_sha256, status
         FROM ai_pdm_contract.role_catalog_publications
        WHERE catalog_version = $1
        FOR UPDATE`,
      [catalog.catalogVersion],
    )
    let created = false
    let alreadyActive = false
    if (existing.rowCount) {
      const publication = existing.rows[0]
      alreadyActive = publication.status === 'active'
      if (publication.catalog_sha256 !== catalog.catalogSha256) throw new AiPdmRoleCatalogPublicationError('CATALOG_VERSION_PAYLOAD_CONFLICT')
      const storedEntries = await client.query(
        `SELECT display_order, stable_role_id, role_code, display_name, assignable, risk,
                subject_kind, recommendation_allowed, delegation_allowed,
                allowed_scope_kinds, assignment_tier, permissions, metadata, role_definition_hash
           FROM ai_pdm_contract.role_catalog_entries
          WHERE catalog_version = $1
          ORDER BY display_order`,
        [catalog.catalogVersion],
      )
      if (storedEntries.rowCount !== catalog.roles.length) throw new AiPdmRoleCatalogPublicationError('CATALOG_STORED_PAYLOAD_INVALID')
      storedEntries.rows.forEach((row, index) => {
        if (row.display_order !== index || !isDeepStrictEqual(storedRoleFingerprint(row), expectedRoleFingerprint(catalog.roles[index]))) {
          throw new AiPdmRoleCatalogPublicationError('CATALOG_STORED_PAYLOAD_INVALID', catalog.roles[index].stableRoleId)
        }
      })
      if (options.activate !== false && publication.status === 'retired') throw new AiPdmRoleCatalogPublicationError('CATALOG_VERSION_RETIRED')
    } else {
      await client.query(
        `INSERT INTO ai_pdm_contract.role_catalog_publications
          (catalog_version, contract_version, application_id, published_at, catalog_sha256, status, published_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6)`,
        [catalog.catalogVersion, catalog.contractVersion, catalog.applicationId, catalog.publishedAt, catalog.catalogSha256, publishedBy],
      )
      for (const [displayOrder, role] of catalog.roles.entries()) {
        await client.query(
          `INSERT INTO ai_pdm_contract.role_catalog_entries
            (catalog_version, display_order, stable_role_id, role_code, display_name, assignable, risk,
             subject_kind, recommendation_allowed, delegation_allowed, allowed_scope_kinds,
             assignment_tier, permissions, metadata, role_definition_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb, $14::jsonb, $15)`,
          [
            catalog.catalogVersion, displayOrder, role.stableRoleId, role.roleCode, role.displayName,
            role.assignable, role.risk, role.subjectKind, role.recommendationAllowed, role.delegationAllowed,
            JSON.stringify(role.allowedScopeKinds), role.assignmentTier, JSON.stringify(role.permissions),
            JSON.stringify(role.metadata ?? null), role.roleDefinitionHash,
          ],
        )
      }
      created = true
    }
    if (options.activate !== false) {
      const activePointer = await client.query(
        'SELECT catalog_version FROM ai_pdm_contract.active_role_catalog WHERE application_id = $1',
        [catalog.applicationId],
      )
      const pointerMatches = activePointer.rowCount === 1 && activePointer.rows[0].catalog_version === catalog.catalogVersion
      if (!alreadyActive || !pointerMatches) {
        await client.query(
          `UPDATE ai_pdm_contract.role_catalog_publications
              SET status = 'retired', retired_at = now()
            WHERE application_id = $1 AND status = 'active' AND catalog_version <> $2`,
          [catalog.applicationId, catalog.catalogVersion],
        )
        await client.query(
          `UPDATE ai_pdm_contract.role_catalog_publications
              SET status = 'active', retired_at = NULL
            WHERE catalog_version = $1`,
          [catalog.catalogVersion],
        )
        await client.query(
          `INSERT INTO ai_pdm_contract.active_role_catalog
            (application_id, catalog_version, activated_at, activated_by, activation_reason)
           VALUES ($1, $2, now(), $3, $4)
           ON CONFLICT (application_id) DO UPDATE SET
             catalog_version = EXCLUDED.catalog_version,
             activated_at = EXCLUDED.activated_at,
             activated_by = EXCLUDED.activated_by,
             activation_reason = EXCLUDED.activation_reason`,
          [catalog.applicationId, catalog.catalogVersion, publishedBy, activationReason],
        )
      }
    }
    await client.query('COMMIT')
    return { status: created ? 'published' : 'replayed', catalogVersion: catalog.catalogVersion, catalogSha256: catalog.catalogSha256, roles: catalog.roles.length, active: options.activate !== false }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
