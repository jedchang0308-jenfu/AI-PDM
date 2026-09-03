import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTRACT_VERSION = 'jenfu.platform-entitlement.v1'
const CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-03.v3'
const EXPECTED_CATALOG_SHA256 = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8'
const EXPECTED_ROLE_IDS = [
  'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
  'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin',
]

const scriptRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptRoot, '..')
const platformCandidates = [
  process.env.JENFU_MANAGEMENT_SYSTEM_ROOT?.trim(),
  resolve(appRoot, '..', 'Jenfu-Management-system'),
  resolve(appRoot, '..', '..', '..', 'Jenfu-Management-system'),
  resolve(appRoot, '..', '..', '..', '..', 'Jenfu-Management-system'),
].filter(Boolean)
const platformRoot = platformCandidates.find((candidate) => existsSync(join(candidate, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json'))) ?? platformCandidates[0]
const sourcePath = join(platformRoot, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json')
const targetPath = join(appRoot, 'config', 'access-control', 'jenfu-role-catalog.v1.json')

function sha256(value) {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex')
}

function canonicalRole(role) {
  return {
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
  }
}

function canonicalCatalog(value) {
  return JSON.stringify({
    contractVersion: value.contractVersion,
    applicationId: value.applicationId,
    catalogVersion: value.catalogVersion,
    roles: value.roles.map((role) => ({ ...canonicalRole(role), roleDefinitionHash: role.roleDefinitionHash })),
  })
}

function buildCatalog(source) {
  assert.equal(source.contractVersion, CONTRACT_VERSION)
  assert.equal(source.applicationId, 'ai-pdm')
  assert.equal(source.catalogVersion, CATALOG_VERSION)
  assert.deepEqual(source.roles.map((role) => role.stableRoleId), EXPECTED_ROLE_IDS)
  const roles = source.roles.map((role) => ({
    ...role,
    allowedScopeKinds: [...role.allowedScopeKinds].sort(),
    permissions: [...role.permissions].sort((a, b) => `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)),
    roleDefinitionHash: sha256(JSON.stringify(canonicalRole(role))),
  }))
  const catalog = {
    contractVersion: CONTRACT_VERSION,
    applicationId: 'ai-pdm',
    catalogVersion: CATALOG_VERSION,
    publishedAt: new Date().toISOString(),
    roles,
    catalogSha256: '',
  }
  catalog.catalogSha256 = sha256(canonicalCatalog(catalog))
  return catalog
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.dev005-${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, path)
}

function validateCatalog(value) {
  assert.equal(value.contractVersion, CONTRACT_VERSION)
  assert.equal(value.applicationId, 'ai-pdm')
  assert.equal(value.catalogVersion, CATALOG_VERSION)
  assert.deepEqual(value.roles.map((role) => role.stableRoleId), EXPECTED_ROLE_IDS)
  assert.equal(value.catalogSha256, EXPECTED_CATALOG_SHA256, 'same version must use the approved catalog payload')
  assert.equal(value.catalogSha256, sha256(canonicalCatalog(value)), 'catalog aggregate hash drift')
  for (const role of value.roles) {
    assert.equal(role.roleDefinitionHash, sha256(JSON.stringify(canonicalRole(role))), `${role.roleCode} definition hash drift`)
    if (role.roleCode === 'system_admin') {
      assert.equal(role.subjectKind, 'principal')
      assert.equal(role.recommendationAllowed, false)
      assert.equal(role.delegationAllowed, false)
    }
    if (role.roleCode === 'external_specialist') {
      assert.equal(role.recommendationAllowed, false)
      assert.equal(role.delegationAllowed, false)
      assert.deepEqual(role.allowedScopeKinds, ['project'])
    }
  }
}

function main() {
  const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--write') ? 'write' : null
  assert.ok(mode, 'choose --check or --write')
  assert.ok(existsSync(sourcePath), `missing platform catalog source: ${sourcePath}`)
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const candidate = buildCatalog(source)
  validateCatalog(candidate)
  if (mode === 'write') writeAtomic(targetPath, candidate)
  assert.ok(existsSync(targetPath), `missing app-owned catalog: ${targetPath}`)
  const catalog = JSON.parse(readFileSync(targetPath, 'utf8'))
  validateCatalog(catalog)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', mode, path: targetPath, catalogVersion: catalog.catalogVersion, roles: catalog.roles.length, catalogSha256: catalog.catalogSha256 })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 role catalog publication failed: ${error.message}\n`)
  process.exitCode = 1
}
