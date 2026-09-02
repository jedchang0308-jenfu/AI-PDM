import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptRoot = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appRoot = resolve(scriptRoot, '..')
const mapPath = join(appRoot, 'config', 'access-control', 'jenfu-route-permission-map.v1.json')
const catalogPath = join(appRoot, 'config', 'access-control', 'jenfu-role-catalog.v1.json')
const routeMap = JSON.parse(readFileSync(mapPath, 'utf8'))
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

function routePathMatches(template, actual) {
  const templateParts = template.split('/')
  const actualParts = actual.split('/')
  return templateParts.length === actualParts.length && templateParts.every((part, index) => /^\[[^\]]+\]$/u.test(part) ? actualParts[index].length > 0 : part === actualParts[index])
}

function samplePath(template) {
  return template.split('/').map((part) => /^\[[^\]]+\]$/u.test(part) ? 'qc-value' : part).join('/')
}

function resolveEntries(path, method) {
  return routeMap.entries.filter((entry) => routePathMatches(entry.path, path) && entry.method === method && entry.discriminator === null)
}

function main() {
  assert.deepEqual(routeMap.denominator, { uniqueFiles: 57, uniqueMethods: 71, policyEntries: 79 })
  const catalogPermissionCodes = new Set(catalog.roles.flatMap((role) => role.permissions.map((permission) => permission.code)))
  const permissionEntries = routeMap.entries.filter((entry) => entry.authorizationMode === 'permission')
  for (const entry of permissionEntries) assert.ok(catalogPermissionCodes.has(entry.permissionCode), `route permission missing from catalog: ${entry.permissionCode}`)

  const sourceByPath = new Map()
  for (const entry of routeMap.entries) {
    const sourcePath = join(appRoot, ...entry.path.split('/'))
    assert.ok(existsSync(sourcePath), `route source missing: ${entry.path}`)
    if (!sourceByPath.has(entry.path)) sourceByPath.set(entry.path, readFileSync(sourcePath, 'utf8'))
  }
  const legacyRoleBypassFiles = []
  const directRoleGateFiles = []
  for (const [path, source] of sourceByPath) {
    if (/requireRoleAsync\b/u.test(source)) legacyRoleBypassFiles.push(path)
    if (/(?:auth\.user|user|session)\.role\s*(?:===|!==|==|!=)/u.test(source)) directRoleGateFiles.push(path)
  }
  assert.deepEqual(legacyRoleBypassFiles, [], `legacy role helper remains in route source: ${legacyRoleBypassFiles.join(', ')}`)
  assert.deepEqual(directRoleGateFiles, [], `direct user.role authorization gate remains in route source: ${directRoleGateFiles.join(', ')}`)
  for (const entry of permissionEntries) assert.match(sourceByPath.get(entry.path), /requirePdmRouteAuthorizationAsync\s*\(/u, `permission route is not behind the PDM entitlement boundary: ${entry.path}`)

  const unresolvedSingleMethodEntries = []
  for (const entry of routeMap.entries.filter((candidate) => candidate.discriminator === null)) {
    const matches = resolveEntries(samplePath(entry.path), entry.method)
    if (matches.length !== 1) unresolvedSingleMethodEntries.push(`${entry.method} ${entry.path}`)
  }
  assert.deepEqual(unresolvedSingleMethodEntries, [], `single route policy did not resolve: ${unresolvedSingleMethodEntries.join(', ')}`)
  assert.ok(sourceByPath.get('src/app/api/pdm/file-assets/[fileAssetId]/route.ts').includes('{ permissionCode: "approval.request.decide" }'), 'conditional approval evidence path must pass an explicit permission discriminator')

  const roleCapabilityFiles = [
    'src/app/api/settings/access/role-capabilities/route.ts',
    'src/app/api/settings/access/role-capabilities/publish/route.ts',
    'src/app/api/settings/access/role-capabilities/preview/route.ts',
    'src/app/api/settings/access/role-capabilities/change-feed/route.ts',
    'src/app/api/settings/access/role-capabilities/commands/[commandId]/route.ts',
    'src/app/api/settings/access/role-capabilities/commands/[commandId]/resolve-unknown/route.ts',
  ]
  for (const path of roleCapabilityFiles) {
    const source = readFileSync(join(appRoot, ...path.split('/')), 'utf8')
    assert.match(source, /requirePdmRouteAuthorizationAsync\s*\(/u, `role capability route is not behind the PDM entitlement boundary: ${path}`)
  }
  process.stdout.write(`${JSON.stringify({ status: 'PASS', uniqueFiles: routeMap.denominator.uniqueFiles, uniqueMethods: routeMap.denominator.uniqueMethods, policyEntries: routeMap.denominator.policyEntries, catalogPermissionCodes: catalogPermissionCodes.size, legacyRoleBypassFiles: 0, directRoleGateFiles: 0, conditionalRouteOverrides: 1 })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 runtime boundary check failed: ${error.message}\n`)
  process.exitCode = 1
}
