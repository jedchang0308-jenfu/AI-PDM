import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const scriptRoot = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appRoot = resolve(scriptRoot, '..')
const mapPath = join(appRoot, 'config', 'access-control', 'jenfu-route-permission-map.v1.json')
const currentMapPath = join(appRoot, 'config', 'access-control', 'jenfu-route-permission-map.v2.json')
const catalogPath = join(appRoot, 'config', 'access-control', 'jenfu-role-catalog.v4.json')
const routeMap = JSON.parse(readFileSync(mapPath, 'utf8'))
const currentRouteMap = JSON.parse(readFileSync(currentMapPath, 'utf8'))
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

function currentPolicy(entry) {
  const matches = currentRouteMap.entries.filter((candidate) => candidate.path === entry.path &&
    candidate.method === entry.method && candidate.discriminator === entry.discriminator)
  assert.equal(matches.length, 1, `current route policy is ambiguous: ${entry.method} ${entry.path}`)
  return matches[0]
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
  if (discriminator === 'approval_apply:retired_candidate' || discriminator === 'approval_decision:retired_candidate') {
    return ['numbering.candidate_bundle_review', 'numbering.candidate_publication_review']
  }
  return []
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
    if (entry.path === 'src/app/api/pdm/file-assets/[fileAssetId]/route.ts' &&
        entry.method === 'GET') {
      const policy = currentPolicy(entry)
      const expectedCodes = {
        'file_read:approval_evidence': ['approval.request.decide'],
        'file_read:drawing_read': ['numbering.drawings.view'],
        'file_read:drawing_revision_work': ['numbering.workspace.view'],
        'file_read:part_attachment': ['numbering.search'],
        'file_read:review_request': ['approval.inbox.view', 'approval.request.decide']
      }[entry.discriminator]
      const required = [
        /principalSessionTokenFromRequest\s*\(/u,
        /if\s*\(!token\)\s*return\s+principalRequestFailure\s*\(/u,
        /principalFileRead\s*\(/u,
        /resolveJenfuRouteAuthorization\s*\(/u,
        /withVerifiedJenfuPrincipalRequest\s*\(/u,
        /evaluatePrincipalWorkspacePermissionsInSnapshot\s*\(/u,
        /resolveSource\s*\(/u
      ]
      if (!expectedCodes || policy.authorizationMode !== entry.authorizationMode ||
          required.some((guard) => !guard.test(graph)) ||
          expectedCodes.some((code) => !graph.includes(code)) ||
          /(?:requirePdmRouteAuthorizationAsync|requireAuthAsync|requireNumberingPageAsync|resolveDev087RouteActor)\s*\(/u.test(graph)) {
        failures.push(label + ': Principal file-read guard missing or old authorization restored')
      }
      continue
    }
    if (entry.authorizationMode === 'permission') {
      if (entry.discriminator === null && currentPolicy(entry).authorizationMode === 'retired') {
        if (!/status\s*:\s*410/u.test(graph) ||
            /(?:requirePdmRouteAuthorizationAsync|resolveDev087RouteActor|requireAuthAsync)\s*\(/u.test(graph)) {
          failures.push(`${label}: current retired route still calls old authorization or lacks 410`)
        }
        continue
      }
      if ((entry.path === 'src/app/api/file-metadata/detect/route.ts' && entry.method === 'POST') ||
          (entry.path === 'src/app/api/storage/evidence/route.ts' && entry.method === 'GET')) {
        if (!/authorizePrincipalWorkspaceExternalRead\s*\(/u.test(graph) ||
            !graph.includes(entry.permissionCode)) {
          failures.push(`${label}: principal external-read guard missing`)
        }
        continue
      }
      if (entry.path === 'src/app/api/settings/route.ts' && entry.method === 'POST') {
        if (!/withPrincipalCompanyWrite\s*\(/u.test(graph) ||
            !graph.includes(entry.permissionCode)) {
          failures.push(`${label}: principal settings write guard missing`)
        }
        continue
      }
      if (entry.method === 'GET' &&
          ['src/app/api/settings/access/role-capabilities/route.ts',
            'src/app/api/settings/access/role-capabilities/change-feed/route.ts',
            'src/app/api/settings/access/role-capabilities/commands/[commandId]/route.ts',
            'src/app/api/settings/gdrive/folders/route.ts',
            'src/app/api/settings/secrets/route.ts'].includes(entry.path)) {
        if (!/authorizePrincipalWorkspaceExternalRead\s*\(/u.test(graph) ||
            !graph.includes(entry.permissionCode)) {
          failures.push(`${label}: principal external-read guard missing`)
        }
        continue
      }
      if (entry.path === 'src/app/api/settings/route.ts' && entry.method === 'GET') {
        if (!/withPrincipalCompanyRead\s*\(/u.test(graph) ||
            !graph.includes(entry.permissionCode)) {
          failures.push(`${label}: principal settings read guard missing`)
        }
        continue
      }
      if (entry.path === 'src/app/api/admin/account-invitations/route.ts' &&
          entry.method === 'POST') {
        for (const required of [
          /principalSessionTokenFromRequest\s*\(/u,
          /withVerifiedJenfuPrincipalRequest\s*\(/u,
          /principal_enrollment_required/u,
          /requirePdmRouteAuthorizationAsync\s*\(/u
        ]) {
          if (!required.test(graph)) failures.push(`${label}: principal enrollment retirement missing: ${required}`)
        }
        continue
      }
      if (entry.method === 'GET' && !entry.discriminator &&
          ['src/app/api/admin/accounts/route.ts',
            'src/app/api/admin/accounts/[userId]/route.ts'].includes(entry.path)) {
        for (const required of [
          /requirePdmRouteAuthorizationAsync\s*\(/u,
          /withVerifiedJenfuPrincipalRequest\s*\(/u,
          /evaluatePrincipalWorkspacePermissionsInSnapshot\s*\(/u,
          /JenfuPrincipalAdminAccountRepository\s*\(/u
        ]) {
          if (!required.test(graph)) failures.push(`${label}: principal account reader guard missing: ${required}`)
        }
        if (!graph.includes(entry.permissionCode)) failures.push(`${label}: permission code missing`)
        continue
      }
      if (entry.path === 'src/app/api/admin/accounts/route.ts' &&
          entry.discriminator === 'view:principal-candidate') {
        for (const required of [
          /resolveJenfuRoutePolicy\s*\(/u,
          /withVerifiedJenfuPrincipalRequest\s*\(/u,
          /evaluatePrincipalWorkspacePermissionsInSnapshot\s*\(/u,
          /JenfuPrincipalCandidateRepository\s*\(/u
        ]) {
          if (!required.test(graph)) failures.push(`${label}: principal candidate guard missing: ${required}`)
        }
        if (!graph.includes(entry.permissionCode)) failures.push(`${label}: permission code missing`)
        continue
      }
      if (entry.path === 'src/app/api/admin/accounts/route.ts' && entry.method === 'POST') {
        for (const required of [
          /isAllowedRequestOrigin\s*\(/u,
          /resolveJenfuRoutePolicy\s*\(/u,
          /principalSessionTokenFromRequest\s*\(/u,
          /provisionPrincipalAccount\s*\(/u
        ]) {
          if (!required.test(graph)) failures.push(`${label}: principal provisioning guard missing: ${required}`)
        }
        if (!graph.includes(entry.permissionCode)) failures.push(`${label}: permission code missing`)
        continue
      }
      if (entry.path === 'src/app/api/admin/accounts/[userId]/lifecycle/route.ts' &&
          entry.method === 'POST') {
        for (const required of [
          /isAllowedRequestOrigin\s*\(/u,
          /resolveJenfuRoutePolicy\s*\(/u,
          /principalSessionTokenFromRequest\s*\(/u,
          /updatePrincipalAccountLifecycle\s*\(/u
        ]) {
          if (!required.test(graph)) failures.push(`${label}: principal lifecycle guard missing: ${required}`)
        }
        if (!graph.includes(entry.permissionCode)) failures.push(`${label}: permission code missing`)
        continue
      }
      if (entry.path === 'src/app/api/approvals/inbox/route.ts' && entry.method === 'GET') {
        for (const required of [
          /principalSessionTokenFromRequest\s*\(/u,
          /resolveJenfuRoutePolicy\s*\(/u,
          /withVerifiedJenfuPrincipalRequest\s*\(/u,
          /evaluatePrincipalWorkspacePermissionsInSnapshot\s*\(/u,
          /listPrincipalWorkReviewInbox\s*\(/u
        ]) {
          if (!required.test(graph)) failures.push(`${label}: principal inbox guard missing: ${required}`)
        }
        if (!graph.includes(entry.permissionCode)) failures.push(`${label}: principal inbox permission missing`)
        continue
      }
      if (entry.path === 'src/app/api/submissions/preflight-lock/route.ts' &&
          entry.method === 'POST') {
        const principalPolicy = currentPolicy(entry)
        if (principalPolicy.authorizationMode !== 'permission' ||
            principalPolicy.permissionCode !== entry.permissionCode ||
            !/resolveJenfuRoutePolicy\s*\(/u.test(graph) ||
            !/withPrincipalCompanyRead\s*\(/u.test(graph) ||
            !/findActiveItemLockForSubmissionIdentifiers\s*\(/u.test(graph) ||
            /(?:requirePdmRouteAuthorizationAsync|requireAuthAsync)\s*\(/u.test(graph)) {
          failures.push(`${label}: principal lock preflight guard missing or old authorization restored`)
        }
        continue
      }
      if (!entry.path.startsWith('src/app/api/pdm/') &&
          !/(?:requirePdmRouteAuthorizationAsync|resolveDev087RouteActor)\s*\(/u.test(graph)) {
        failures.push(`${label}: PDM entitlement guard missing from handler graph`)
      }
      if (entry.path.startsWith('src/app/api/pdm/')) {
        if (!/principalSessionTokenFromRequest\s*\(/u.test(graph) ||
            !/(?:withPrincipalDev087Route|withVerifiedJenfuPrincipalRequest|(?:uploadFilePrincipal|removeFilePrincipal))\s*\(/u.test(graph)) {
          failures.push(`${label}: principal session boundary missing from handler graph`)
        }
        if (/(?:uploadFilePrincipal|removeFilePrincipal)\s*\(/u.test(graph) &&
            !/principalDev087RoutePolicyAvailable\s*\(/u.test(graph)) {
          failures.push(`${label}: principal file command policy missing`)
        }
        if (!graph.includes(entry.permissionCode)) failures.push(`${label}: principal permission code missing`)
      }
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
  assert.deepEqual(routeMap.denominator, { uniqueFiles: 77, uniqueMethods: 94, policyEntries: 103 })
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

  const principalWorkPath = 'src/app/api/pdm/drawing-revision-works/[workId]/cancel/route.ts'
  const principalWorkSource = sourceByPath.get(principalWorkPath)
  const principalWorkMutant = principalWorkSource.replace(/withPrincipalDev087Route\s*\(/u,
    'removedPrincipalDev087Route(')
  assert.notEqual(principalWorkMutant, principalWorkSource,
    'principal work mutant could not remove the guard')
  const principalWorkFailures = boundaryFailures(routeMap.entries.filter((entry) =>
    entry.path === principalWorkPath && entry.method === 'POST'),
    new Map([[principalWorkPath, principalWorkMutant]]))
  assert.ok(principalWorkFailures.length > 0, 'principal work guard mutant was not detected')

  const principalFilePath = 'src/app/api/pdm/file-assets/[fileAssetId]/route.ts'
  const principalFileSource = sourceByPath.get(principalFilePath)
  const principalFileMutant = principalFileSource.replace(/withVerifiedJenfuPrincipalRequest\s*\(/u,
    'removedPrincipalFileVerification(')
  assert.notEqual(principalFileMutant, principalFileSource,
    'principal file-read mutant could not remove verification')
  const principalFileFailures = boundaryFailures(routeMap.entries.filter((entry) =>
    entry.path === principalFilePath && entry.method === 'GET'),
    new Map([[principalFilePath, principalFileMutant]]))
  assert.ok(principalFileFailures.length > 0, 'principal file-read guard mutant was not detected')

  const principalInboxPath = 'src/app/api/approvals/inbox/route.ts'
  const principalInboxSource = sourceByPath.get(principalInboxPath)
  const principalInboxMutant = principalInboxSource.replace(/withVerifiedJenfuPrincipalRequest\s*\(/u,
    'removedPrincipalSessionVerification(')
  assert.notEqual(principalInboxMutant, principalInboxSource,
    'principal inbox mutant could not remove the guard')
  const principalInboxFailures = boundaryFailures(routeMap.entries.filter((entry) =>
    entry.path === principalInboxPath && entry.method === 'GET'),
    new Map([[principalInboxPath, principalInboxMutant]]))
  assert.ok(principalInboxFailures.length > 0, 'principal inbox guard mutant was not detected')

  const externalPath = 'src/app/api/file-metadata/detect/route.ts'
  const externalSource = sourceByPath.get(externalPath)
  const externalMutant = externalSource.replace(/authorizePrincipalWorkspaceExternalRead\s*\(/u,
    'removedPrincipalExternalRead(')
  assert.notEqual(externalMutant, externalSource, 'principal external-read mutant could not remove the guard')
  assert.ok(boundaryFailures(routeMap.entries.filter((entry) => entry.path === externalPath &&
    entry.method === 'POST'), new Map([[externalPath, externalMutant]])).length > 0,
  'principal external-read guard mutant was not detected')

  const retiredPath = 'src/app/api/settings/access/role-capabilities/preview/route.ts'
  const retiredSource = sourceByPath.get(retiredPath)
  const retiredMutant = retiredSource.replace(/status\s*:\s*410/u, 'status: 200')
  assert.notEqual(retiredMutant, retiredSource, 'retired route mutant could not remove 410')
  assert.ok(boundaryFailures(routeMap.entries.filter((entry) => entry.path === retiredPath &&
    entry.method === 'POST'), new Map([[retiredPath, retiredMutant]])).length > 0,
  'retired route mutant was not detected')

  const accountsPath = 'src/app/api/admin/accounts/route.ts'
  const accountsSource = sourceByPath.get(accountsPath)
  const principalMutant = accountsSource.replace(/provisionPrincipalAccount\s*\(/u, 'removedPrincipalProvision(')
  assert.notEqual(principalMutant, accountsSource, 'principal provision mutant could not remove command')
  const principalFailures = boundaryFailures(routeMap.entries.filter((entry) =>
    entry.path === accountsPath && entry.method === 'POST'), new Map([[accountsPath, principalMutant]]))
  assert.ok(principalFailures.length > 0, 'principal provision guard mutant was not detected')

  const lifecyclePath = 'src/app/api/admin/accounts/[userId]/lifecycle/route.ts'
  const lifecycleSource = sourceByPath.get(lifecyclePath)
  const lifecycleMutant = lifecycleSource.replace(/updatePrincipalAccountLifecycle\s*\(/u,
    'removedPrincipalLifecycle(')
  assert.notEqual(lifecycleMutant, lifecycleSource, 'principal lifecycle mutant could not remove command')
  const lifecycleFailures = boundaryFailures(routeMap.entries.filter((entry) =>
    entry.path === lifecyclePath && entry.method === 'POST'),
    new Map([[lifecyclePath, lifecycleMutant]]))
  assert.ok(lifecycleFailures.length > 0, 'principal lifecycle guard mutant was not detected')

  const invitationPath = 'src/app/api/admin/account-invitations/route.ts'
  const invitationSource = sourceByPath.get(invitationPath)
  const invitationMutant = invitationSource.replace(/withVerifiedJenfuPrincipalRequest\s*\(/u,
    'removedPrincipalSessionVerification(')
  assert.notEqual(invitationMutant, invitationSource, 'principal invitation mutant could not remove session check')
  const invitationFailures = boundaryFailures(routeMap.entries.filter((entry) =>
    entry.path === invitationPath && entry.method === 'POST'),
    new Map([[invitationPath, invitationMutant]]))
  assert.ok(invitationFailures.length > 0, 'principal invitation guard mutant was not detected')

  const roleCapabilityFiles = [
    'src/app/api/settings/access/role-capabilities/route.ts',
    'src/app/api/settings/access/role-capabilities/publish/route.ts',
    'src/app/api/settings/access/role-capabilities/preview/route.ts',
    'src/app/api/settings/access/role-capabilities/change-feed/route.ts',
    'src/app/api/settings/access/role-capabilities/commands/[commandId]/route.ts',
    'src/app/api/settings/access/role-capabilities/commands/[commandId]/resolve-unknown/route.ts',
  ]
  const legacyRoleCapabilityCommands = []
  const retiredRoleCapabilityCommands = []
  for (const path of roleCapabilityFiles) {
    const source = readFileSync(join(appRoot, ...path.split('/')), 'utf8')
    if (/authorizePrincipalWorkspaceExternalRead\s*\(/u.test(source)) continue
    const current = currentRouteMap.entries.filter((entry) => entry.path === path)
    if (current.length === 1 && current[0].authorizationMode === 'retired') {
      assert.match(source, /status\s*:\s*410/u, `retired role command lost 410: ${path}`)
      assert.doesNotMatch(source, /requirePdmRouteAuthorizationAsync\s*\(/u,
        `retired role command still invokes old authorization: ${path}`)
      retiredRoleCapabilityCommands.push(path)
      continue
    }
    assert.match(source, /requirePdmRouteAuthorizationAsync\s*\(/u,
      `role capability route has no entitlement guard: ${path}`)
    legacyRoleCapabilityCommands.push(path)
  }
  process.stdout.write(`${JSON.stringify({ status: 'PASS', uniqueFiles: routeMap.denominator.uniqueFiles, uniqueMethods: routeMap.denominator.uniqueMethods, policyEntries: routeMap.denominator.policyEntries, catalogPermissionCodes: catalogPermissionCodes.size, legacyRoleBypassFiles: 0, directRoleGateFiles: 0, methodGuardEntries: routeMap.entries.length, methodGuardMutant: 'detected', roleCapabilityFiles: roleCapabilityFiles.length, legacyRoleCapabilityCommands, retiredRoleCapabilityCommands })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 runtime boundary check failed: ${error.message}\n`)
  process.exitCode = 1
}
