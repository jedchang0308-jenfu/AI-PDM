import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

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

function parseFunctions(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const functions = new Map()
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      functions.set(statement.name.text, statement)
      continue
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) functions.set(declaration.name.text, declaration)
    }
  }
  return { sourceFile, functions }
}

function handlerGraph(path, method, source) {
  const { sourceFile, functions } = parseFunctions(path, source)
  const root = functions.get(method)
  if (!root) return null
  const visited = new Set()
  const fragments = []
  function visitFunction(name) {
    if (visited.has(name)) return
    visited.add(name)
    const node = functions.get(name)
    if (!node) return
    fragments.push(node.getText(sourceFile))
    function visit(nodePart) {
      if (ts.isCallExpression(nodePart) && ts.isIdentifier(nodePart.expression) && functions.has(nodePart.expression.text)) visitFunction(nodePart.expression.text)
      ts.forEachChild(nodePart, visit)
    }
    visit(node)
  }
  visitFunction(method)
  return fragments.join('\n')
}

function discriminatorActionCodes(discriminator) {
  if (!discriminator) return []
  const match = discriminator.match(/\{([^}]+)\}/u)
  return match ? match[1].split(',').map((value) => value.trim()).filter(Boolean) : []
}

function boundaryFailures(entries, sources) {
  const failures = []
  for (const entry of entries) {
    const source = sources.get(entry.path)
    const graph = source ? handlerGraph(entry.path, entry.method, source) : null
    const label = `${entry.method} ${entry.path}${entry.discriminator ? ` [${entry.discriminator}]` : ''}`
    if (!graph) {
      failures.push(`${label}: exported handler missing`)
      continue
    }
    if (entry.authorizationMode === 'permission') {
      if (!/requirePdmRouteAuthorizationAsync\s*\(/u.test(graph)) failures.push(`${label}: PDM entitlement guard missing from handler graph`)
      if (entry.discriminator && entry.permissionCode && !graph.includes(entry.permissionCode)) failures.push(`${label}: explicit discriminator permission ${entry.permissionCode} missing`)
      continue
    }
    if (entry.authorizationMode === 'authenticated_domain') {
      if (!/(?:requirePdmRouteAuthorizationAsync|requireAuthAsync)\s*\(/u.test(graph)) failures.push(`${label}: authenticated-domain guard missing`)
      continue
    }
    if (entry.authorizationMode === 'existing_command') {
      const guard = entry.authorizationTarget.split(':').at(-1)?.trim()
      if (!guard || !graph.includes(`${guard}(`)) failures.push(`${label}: preserved command guard ${guard ?? 'unknown'} missing`)
      continue
    }
    if (entry.authorizationMode === 'existing_path') {
      const permissionCode = entry.authorizationTarget.match(/[a-z]+(?:\.[a-z_]+)+/u)?.[0]
      if (!/(?:requireNumberingPageAsync|resolveDev087RouteActor)\s*\(/u.test(graph) || (permissionCode && !graph.includes(permissionCode))) {
        failures.push(`${label}: preserved permission path ${permissionCode ?? 'unknown'} missing`)
      }
      continue
    }
    if (entry.authorizationMode === 'retired') {
      if (!/status\s*:\s*410/u.test(graph)) failures.push(`${label}: retired branch does not return 410`)
      for (const actionCode of discriminatorActionCodes(entry.discriminator)) {
        if (!graph.includes(actionCode)) failures.push(`${label}: retired discriminator ${actionCode} missing`)
      }
    }
  }
  return failures
}

function mutateHandlerGuard(path, method, source) {
  const { sourceFile, functions } = parseFunctions(path, source)
  const handler = functions.get(method)
  assert.ok(handler, `mutant handler missing: ${method} ${path}`)
  const start = handler.getStart(sourceFile)
  const end = handler.getEnd()
  const fragment = source.slice(start, end)
  const mutated = fragment.replace(/requirePdmRouteAuthorizationAsync\s*\(/u, 'removedPdmRouteAuthorizationAsync(')
  assert.notEqual(mutated, fragment, `mutant could not remove guard: ${method} ${path}`)
  return `${source.slice(0, start)}${mutated}${source.slice(end)}`
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
  assert.deepEqual(boundaryFailures(routeMap.entries, sourceByPath), [], 'method/discriminator authorization boundary failed')

  const unresolvedSingleMethodEntries = []
  for (const entry of routeMap.entries.filter((candidate) => candidate.discriminator === null)) {
    const matches = resolveEntries(samplePath(entry.path), entry.method)
    if (matches.length !== 1) unresolvedSingleMethodEntries.push(`${entry.method} ${entry.path}`)
  }
  assert.deepEqual(unresolvedSingleMethodEntries, [], `single route policy did not resolve: ${unresolvedSingleMethodEntries.join(', ')}`)

  const mutantPath = 'src/app/api/admin/account-invitations/route.ts'
  const mutantSources = new Map(sourceByPath)
  mutantSources.set(mutantPath, mutateHandlerGuard(mutantPath, 'GET', sourceByPath.get(mutantPath)))
  const mutantFailures = boundaryFailures(routeMap.entries.filter((entry) => entry.path === mutantPath && entry.method === 'GET'), mutantSources)
  assert.ok(mutantFailures.length > 0, 'method-level guard mutant was not detected')

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
  process.stdout.write(`${JSON.stringify({ status: 'PASS', uniqueFiles: routeMap.denominator.uniqueFiles, uniqueMethods: routeMap.denominator.uniqueMethods, policyEntries: routeMap.denominator.policyEntries, catalogPermissionCodes: catalogPermissionCodes.size, legacyRoleBypassFiles: 0, directRoleGateFiles: 0, methodGuardEntries: routeMap.entries.length, methodGuardMutant: 'detected', roleCapabilityFiles: roleCapabilityFiles.length })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 runtime boundary check failed: ${error.message}\n`)
  process.exitCode = 1
}
