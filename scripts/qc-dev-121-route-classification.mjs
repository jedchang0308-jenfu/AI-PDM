#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const routeRoot = join(appRoot, "src", "app", "api");
const routeMap = JSON.parse(readFileSync(join(appRoot, "config", "access-control", "jenfu-route-permission-map.v1.json"), "utf8"));
const roleCatalog = JSON.parse(readFileSync(join(appRoot, "config", "access-control", "jenfu-role-catalog.v1.json"), "utf8"));
const routePolicyDispositions = JSON.parse(readFileSync(join(appRoot, "config", "access-control", "jenfu-route-policy-dispositions.v1.json"), "utf8"));
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function routeFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) routeFiles(full, found);
    else if (entry.isFile() && entry.name === "route.ts") found.push(full);
  }
  return found;
}

function exportedHandlers(sourceFile) {
  const handlers = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (methods.has(statement.name.text)) handlers.push({ method: statement.name.text, node: statement });
    }
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !methods.has(declaration.name.text) || !declaration.initializer) continue;
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) handlers.push({ method: declaration.name.text, node: declaration });
    }
  }
  return handlers;
}

function functionGraph(sourceFile, rootName) {
  const functions = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) functions.set(statement.name.text, statement);
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) functions.set(declaration.name.text, declaration);
    }
  }
  const root = functions.get(rootName);
  if (!root) return "";
  const visited = new Set();
  const fragments = [];
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const node = functions.get(name);
    if (!node) return;
    fragments.push(node.getText(sourceFile));
    function scan(part) {
      if (ts.isCallExpression(part) && ts.isIdentifier(part.expression) && functions.has(part.expression.text)) visit(part.expression.text);
      ts.forEachChild(part, scan);
    }
    scan(node);
  }
  visit(rootName);
  return fragments.join("\n");
}

const identityProtocolRoutes = new Map([
  ["POST /api/account-invitations/accept", "acceptAccountInvitationAsync"],
  ["GET /api/account-invitations/lookup", "lookupAccountInvitationAsync"],
  ["POST /api/account-recovery/complete", "completeAccountRecoveryAsync"],
  ["POST /api/account-recovery/handoff", "requestProviderRecoveryHandoffByEmailAsync"],
  ["POST /api/account-recovery/lookup", "lookupAccountRecoveryAsync"],
  ["POST /api/auth/employee-login-intents", "issueEmployeeLoginIntentAsync"],
  ["POST /api/auth/firebase/session", "getPlatformSessionKeyRing"],
  ["GET /api/auth/google/callback", "completeGoogleOAuth"],
  ["GET /api/auth/google/start", "beginGoogleOAuth"],
  ["GET /api/auth/jenfu-sso/callback", "jenfuSsoCallback"],
  ["GET /api/auth/jenfu-sso/start", "jenfuSsoStart"],
  ["POST /api/auth/local-quick-login", "findLocalQuickLoginAccount"],
  ["GET /api/auth/login", "ensureDemoUserAsync"],
  ["POST /api/auth/login", "verifyPassword"],
  ["POST /api/auth/logout", "verifyJenfuPlatformSessionV1"],
  ["GET /api/auth/mode", "getFirebaseWebConfig"],
  ["POST /api/auth/token", "generateToken"]
]);
const publicStatusRoutes = new Map([
  ["GET /api/health/ready", "verifyAsyncDatabaseReadiness"],
  ["GET /api/production-slice/status", "productionSliceClientStatus"],
  ["GET /api/numbering/state-flow/status", "numberStateFlowV1ClientStatus"]
]);
const retiredRoutes = new Map([
  ["POST /api/numbering/drawings/[drawingNumber]/attachments", "DRAWING_REFERENCE_UPLOAD_RETIRED"],
  ["POST /api/numbering/reviews/[reviewId]/approve-confirmed-impact-release", "handleDrawingRevisionReviewAction"],
  ["POST /api/numbering/reviews/[reviewId]/confirm-original-part-reuse", "handleDrawingRevisionReviewAction"],
  ["POST /api/numbering/reviews/[reviewId]/return-for-replacement-part", "handleDrawingRevisionReviewAction"]
]);
const explicitPermissionCalls = new Map([
  ["GET /api/notifications", ["settings.storage_evidence.view"]],
  ["GET /api/numbering/admin/matrix", ["settings.admin_matrix"]],
  ["PATCH /api/numbering/admin/matrix", ["settings.admin_matrix"]],
  ["POST /api/numbering/admin/matrix", ["settings.admin_matrix"]],
  ["POST /api/numbering/approval-decisions", ["approval.request.decide"]],
  ["GET /api/numbering/drawings", ["approval.request.decide"]],
  ["POST /api/submissions/[id]/cancel", ["submission.view", "submission.review"]]
]);
const centralPermissionGuard = /\b(?:requirePdmRouteAuthorizationAsync|requireNumbering(?:Permission|Page|Action)Async|requireNumberingPlatformCommandAsync|requireNumberState(?:Read|Command)AccessAsync|requireTransferPackageAccessAsync|resolveDev087RouteActor|resolveRelationMatrixActor)\s*\(/u;
const sessionGuard = /\brequireAuthAsync\s*\(/u;
const workerCapabilityGuard = /\b(?:requireWorkerServiceToken|requirePreviewWorkerToken|requireRecognitionWorker)\s*\(/u;

function containsAll(source, needles, label) {
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${label}: required boundary implementation missing ${needle}`);
  }
}

function validateRoutePolicyDispositions() {
  if (routePolicyDispositions.contractVersion !== "jenfu.platform-entitlement.v1" || routePolicyDispositions.applicationId !== "ai-pdm") {
    throw new Error("DEV-121 route-policy disposition contract mismatch");
  }
  const allowed = new Set(routePolicyDispositions.allowedDispositions);
  const seen = new Set();
  for (const entry of routePolicyDispositions.entries) {
    if (!entry || typeof entry.code !== "string" || !entry.code.trim() || seen.has(entry.code)) {
      throw new Error("DEV-121 route-policy disposition has a missing or duplicate code");
    }
    if (!allowed.has(entry.disposition)) throw new Error(`DEV-121 route-policy disposition is invalid: ${entry.code}`);
    if (!Array.isArray(entry.evidenceRequired) || entry.evidenceRequired.length === 0) {
      throw new Error(`DEV-121 route-policy disposition evidence is missing: ${entry.code}`);
    }
    seen.add(entry.code);
  }
  return new Map(routePolicyDispositions.entries.map((entry) => [entry.code, entry]));
}

function dispositionResolutionIssues(entry, catalogPermissionCodes) {
  if (entry.disposition === "pending_owner_decision") return [];
  const resolution = entry.resolution;
  const issues = [];
  if (!resolution || typeof resolution !== "object") return ["resolution_record_missing"];
  if (!Array.isArray(resolution.evidenceRefs) || resolution.evidenceRefs.length === 0 || resolution.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim())) issues.push("evidence_refs_missing");
  if (typeof resolution.allowOrDenyCase !== "string" || !["allow", "deny"].includes(resolution.allowOrDenyCase)) issues.push("allow_or_deny_case_invalid");
  if (entry.disposition === "reuse_existing") {
    if (typeof resolution.canonicalPermissionCode !== "string" || !catalogPermissionCodes.has(resolution.canonicalPermissionCode)) issues.push("canonical_permission_code_invalid");
    if (resolution.allowOrDenyCase !== "allow") issues.push("reuse_existing_requires_allow");
  }
  if (entry.disposition === "add_catalog_grant") {
    if (resolution.catalogPermissionCode !== entry.code) issues.push("catalog_permission_code_mismatch");
    if (!catalogPermissionCodes.has(entry.code)) issues.push("catalog_permission_code_not_published");
    if (typeof resolution.targetCatalogVersion !== "string" || !resolution.targetCatalogVersion.trim()) issues.push("target_catalog_version_missing");
    if (resolution.allowOrDenyCase !== "allow") issues.push("add_catalog_grant_requires_allow");
  }
  if (entry.disposition === "deny_or_retire") {
    if (![403, 410].includes(resolution.expectedStatus)) issues.push("expected_status_must_be_403_or_410");
    if (!["deny", "retire"].includes(resolution.outcome)) issues.push("deny_or_retire_outcome_invalid");
    if (resolution.allowOrDenyCase !== "deny") issues.push("deny_or_retire_requires_deny");
  }
  return issues;
}

function permissionReferences(sourceFile) {
  const references = [];
  const lineAt = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const literalAt = (node, index, callName) => {
    const argument = node.arguments[index];
    if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
      references.push({ code: argument.text, call: callName, line: lineAt(node) });
    }
  };
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (["requireNumberingPermissionAsync", "requireNumberingPageAsync", "requireNumberingActionAsync", "canUserUseNumberingActionAsync", "requireNumberStateReadAccessAsync", "requireNumberStateCommandAccessAsync"].includes(name)) literalAt(node, 1, name);
      if (name === "requireTransferPackageAccessAsync") literalAt(node, 2, name);
      if (name === "requireNumberingPlatformCommandAsync" && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        let actionCode = "";
        let permissionCode = "";
        for (const property of node.arguments[1].properties) {
          if (!ts.isPropertyAssignment(property) || !(ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) continue;
          if (property.name.getText(sourceFile) === "action") actionCode = property.initializer.text;
          if (property.name.getText(sourceFile) === "permissionCode") permissionCode = property.initializer.text;
        }
        if (permissionCode || actionCode) references.push({ code: permissionCode || actionCode, call: name, line: lineAt(node) });
      }
      if (name === "checkNumberingPermissionAsync" && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        for (const property of node.arguments[0].properties) {
          if (ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "permissionCode" && (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) {
            references.push({ code: property.initializer.text, call: name, line: lineAt(node) });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}

function main() {
  const dispositionByCode = validateRoutePolicyDispositions();
  const observedMethods = new Map();
  const sourceCache = new Map();
  const permissionCodeReferences = [];
  const categories = new Map();
  function assign(key, category) {
    if (categories.has(key)) throw new Error(`DEV-121 route classified more than once: ${key}`);
    categories.set(key, category);
  }
  for (const file of routeFiles(routeRoot)) {
    const relativeFile = relative(appRoot, file).split(sep).join("/");
    const routePath = `/api/${relative(routeRoot, file).split(sep).join("/").replace(/\/route\.ts$/u, "")}`;
    const text = readFileSync(file, "utf8");
    sourceCache.set(relativeFile, text);
    const sourceFile = ts.createSourceFile(relativeFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    permissionCodeReferences.push(...permissionReferences(sourceFile).map((reference) => ({ ...reference, source: relativeFile })));
    for (const handler of exportedHandlers(sourceFile)) {
      const key = `${handler.method} ${routePath}`;
      observedMethods.set(key, { relativeFile, sourceFile });
      const mapped = routeMap.entries.some((entry) => entry.path === relativeFile && entry.method === handler.method);
      if (mapped) { assign(key, "permission_manifest"); continue; }
      const graph = functionGraph(sourceFile, handler.method);
      if (centralPermissionGuard.test(graph)) {
        for (const permissionCode of explicitPermissionCalls.get(key) ?? []) {
          if (!graph.includes(permissionCode)) throw new Error(`${key}: canonical permission ${permissionCode} missing`);
        }
        assign(key, "central_permission_guard");
        continue;
      }
      if (sessionGuard.test(graph)) { assign(key, "authenticated_domain"); continue; }
      if (workerCapabilityGuard.test(graph)) { assign(key, "worker_capability"); continue; }
      const identityMarker = identityProtocolRoutes.get(key);
      if (identityMarker) {
        if (!graph.includes(identityMarker)) throw new Error(`${key}: identity protocol handler lost ${identityMarker}`);
        assign(key, "identity_protocol");
        continue;
      }
      const publicStatusMarker = publicStatusRoutes.get(key);
      if (publicStatusMarker) {
        if (!graph.includes(publicStatusMarker)) throw new Error(`${key}: public status handler lost ${publicStatusMarker}`);
        assign(key, "public_status");
        continue;
      }
      if (key.startsWith("GET /api/public/shares/") || key.startsWith("POST /api/public/shares/")) {
        if (!routePath.includes("[token]") || !/getPublicShareAsync\s*\(\s*token\s*\)/u.test(graph)) {
          throw new Error(`${key}: signed share capability token validation is missing`);
        }
        assign(key, "signed_share_capability");
        continue;
      }
      const retiredMarker = retiredRoutes.get(key);
      if (retiredMarker) {
        if (!graph.includes(retiredMarker)) throw new Error(`${key}: retired route marker ${retiredMarker} missing`);
        assign(key, "retired_route");
      }
    }
  }

  for (const routeMapEntry of routeMap.entries) {
    const routePath = routeMapEntry.path.replace(/^src\/app\/api/u, "/api").replace(/\/route\.ts$/u, "");
    const key = `${routeMapEntry.method} ${routePath}`;
    if (!observedMethods.has(key)) throw new Error(`DEV-121 permission manifest points to a missing API handler: ${key}`);
  }
  for (const expected of [identityProtocolRoutes, publicStatusRoutes, retiredRoutes]) {
    for (const key of expected.keys()) if (!observedMethods.has(key)) throw new Error(`DEV-121 public/retired route allowlist is stale: ${key}`);
  }
  for (const key of explicitPermissionCalls.keys()) if (!observedMethods.has(key)) throw new Error(`DEV-121 permission route assertion is stale: ${key}`);
  const unclassified = [...observedMethods.keys()].filter((key) => !categories.has(key));
  if (unclassified.length) throw new Error(`DEV-121 API methods have no authorization class: ${unclassified.join(", ")}`);

  const directRoleGates = [];
  for (const [relativeFile, source] of sourceCache) {
    if (/(?:auth\.user|user|session)\.role\s*(?:===|!==|==|!=)/u.test(source)) directRoleGates.push(relativeFile);
  }
  if (directRoleGates.length) throw new Error(`Direct role checks remain in API routes: ${directRoleGates.join(", ")}`);

  const guardedSource = (path) => readFileSync(join(appRoot, ...path.split("/")), "utf8");
  containsAll(guardedSource("src/lib/numbering-permission-async.ts"), ["assertJenfuEnforcePrerequisites", "JenfuPrincipalAdmissionRepository", "JenfuEntitlementRepository", "readOnly: true"], "central authorization evaluator");
  containsAll(guardedSource("src/lib/numbering-permission-guard.ts"), ["checkNumberingPermissionAsync"], "numbering permission helpers");
  containsAll(guardedSource("src/lib/number-state-flow-api.ts"), ["requireNumberingActionAsync", "requireNumberingPlatformCommandAsync"], "number-state helpers");
  containsAll(guardedSource("src/lib/platform-command-context.ts"), ["requireNumberingActionAsync"], "Platform command helper");
  containsAll(guardedSource("src/lib/transfer-package-api.ts"), ["requireNumberStateReadAccessAsync", "requireNumberStateCommandAccessAsync"], "transfer package helpers");
  containsAll(guardedSource("src/lib/pdm-dev087-route.ts"), ["requireNumberingPageAsync", "resolveDev087RouteActor"], "DEV-087 route helpers");
  containsAll(guardedSource("src/app/api/numbering/reviews/_review-action-handler.ts"), ["DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED", "status: 410"], "retired review actions");
  containsAll(guardedSource("src/lib/platform-command-context.ts"), ["input.permissionCode ?? input.action", "scopes: [input.action]"], "business action and permission separation");
  const catalogPermissionCodes = new Set(roleCatalog.roles.flatMap((role) => role.permissions.map((permission) => permission.code)));
  for (const codes of explicitPermissionCalls.values()) {
    for (const code of codes) if (!catalogPermissionCodes.has(code)) throw new Error(`Canonical permission is missing from the application role catalog: ${code}`);
  }
  const unsupportedPermissionReferences = permissionCodeReferences.filter((reference) => !catalogPermissionCodes.has(reference.code));
  const unsupportedPermissionCodes = [...new Set(unsupportedPermissionReferences.map((reference) => reference.code))].sort().map((code) => ({
    code,
    disposition: dispositionByCode.get(code)?.disposition ?? "missing_disposition",
    evidenceRequired: dispositionByCode.get(code)?.evidenceRequired ?? [],
    resolutionIssues: dispositionByCode.has(code) ? dispositionResolutionIssues(dispositionByCode.get(code), catalogPermissionCodes) : ["disposition_record_missing"],
    referenceCount: unsupportedPermissionReferences.filter((reference) => reference.code === code).length,
    routeFiles: [...new Set(unsupportedPermissionReferences.filter((reference) => reference.code === code).map((reference) => reference.source))].sort(),
    references: unsupportedPermissionReferences
      .filter((reference) => reference.code === code)
      .map(({ source, call, line }) => ({ source, call, line }))
      .sort((left, right) => left.source.localeCompare(right.source) || left.line - right.line || left.call.localeCompare(right.call))
  }));
  const missingDispositions = unsupportedPermissionCodes.filter((entry) => entry.disposition === "missing_disposition").map((entry) => entry.code);
  const pendingDispositions = unsupportedPermissionCodes.filter((entry) => entry.disposition === "pending_owner_decision").map((entry) => entry.code);
  const unresolvedDispositions = unsupportedPermissionCodes.filter((entry) => entry.disposition !== "pending_owner_decision" && entry.resolutionIssues.length > 0).map((entry) => entry.code);

  const counts = Object.fromEntries([...new Set(categories.values())].sort().map((category) => [category, [...categories.values()].filter((value) => value === category).length]));
  const status = missingDispositions.length || pendingDispositions.length || unresolvedDispositions.length
    ? "BLOCKED_ROUTE_POLICY_DISPOSITION"
    : "PASS";
  process.stdout.write(`${JSON.stringify({ status, apiRouteFiles: sourceCache.size, apiMethods: observedMethods.size, permissionManifestMethods: counts.permission_manifest ?? 0, authorizationClasses: counts, directRoleGateFiles: directRoleGates.length, explicitPermissionAssertions: explicitPermissionCalls.size, unsupportedPermissionCodeCount: unsupportedPermissionCodes.length, unsupportedPermissionCodes, missingDispositions, pendingDispositions, unresolvedDispositions, allMethodsClassified: true, productionWrites: false })}\n`);
  if (status !== "PASS") process.exitCode = 1;
}

main();
