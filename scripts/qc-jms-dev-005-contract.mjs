import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptRoot = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appRoot = resolve(scriptRoot, '..')
const contractRoot = join(appRoot, 'contracts', 'jenfu-platform-entitlement', 'v1')
const catalogPath = join(appRoot, 'config', 'access-control', 'jenfu-role-catalog.v1.json')
const mapPath = join(appRoot, 'config', 'access-control', 'jenfu-route-permission-map.v1.json')

function readJson(path) {
  assert.ok(existsSync(path), `missing ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main() {
  const catalog = readJson(catalogPath)
  assert.equal(catalog.contractVersion, 'jenfu.platform-entitlement.v1')
  assert.equal(catalog.applicationId, 'ai-pdm')
  assert.equal(catalog.catalogVersion, 'ai-pdm.role-catalog.2026-09-02.v2')
  assert.equal(catalog.roles.length, 9)
  assert.deepEqual(catalog.roles.map((role) => role.stableRoleId), [
    'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
    'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin'
  ])
  const systemAdmin = catalog.roles.find((role) => role.roleCode === 'system_admin')
  assert.deepEqual({ subjectKind: systemAdmin.subjectKind, recommendationAllowed: systemAdmin.recommendationAllowed, delegationAllowed: systemAdmin.delegationAllowed, scopes: systemAdmin.allowedScopeKinds }, { subjectKind: 'principal', recommendationAllowed: false, delegationAllowed: false, scopes: ['global'] })
  const external = catalog.roles.find((role) => role.roleCode === 'external_specialist')
  assert.deepEqual({ recommendationAllowed: external.recommendationAllowed, delegationAllowed: external.delegationAllowed, scopes: external.allowedScopeKinds }, { recommendationAllowed: false, delegationAllowed: false, scopes: ['project'] })

  const map = readJson(mapPath)
  assert.equal(map.contractVersion, 'jenfu.platform-entitlement.v1')
  assert.equal(map.applicationId, 'ai-pdm')
  assert.deepEqual(map.denominator, { uniqueFiles: 57, uniqueMethods: 71, policyEntries: 79 })
  assert.equal(new Set(map.entries.map((entry) => entry.path)).size, 57)
  assert.equal(new Set(map.entries.map((entry) => `${entry.path}\0${entry.method}`)).size, 71)
  assert.equal(map.entries.length, 79)
  for (const entry of map.entries) {
    assert.ok(['permission', 'authenticated_domain', 'existing_command', 'existing_path', 'retired'].includes(entry.authorizationMode), `${entry.path} mode`)
    if (entry.authorizationMode === 'permission') assert.ok(entry.permissionCode)
    else assert.equal(entry.permissionCode, null)
  }

  const manifest = readJson(join(contractRoot, 'contract-manifest.json'))
  const lock = readJson(join(contractRoot, 'contract-lock.json'))
  assert.equal(manifest.fileCount, 10)
  assert.equal(lock.sha256, manifest.sha256)
  assert.equal(lock.contractVersion, 'jenfu.platform-entitlement.v1')
  process.stdout.write(`${JSON.stringify({ status: 'PASS', catalogRoles: catalog.roles.length, routeFiles: map.denominator.uniqueFiles, routeMethods: map.denominator.uniqueMethods, routeEntries: map.denominator.policyEntries, contractSha256: lock.sha256 })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 contract QC failed: ${error.message}\n`)
  process.exitCode = 1
}
