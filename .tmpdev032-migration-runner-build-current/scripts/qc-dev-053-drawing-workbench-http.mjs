#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const listRoutePath = "src/app/api/numbering/drawings/workbench/route.ts";
const detailRoutePath = "src/app/api/numbering/drawings/workbench/[rowKey]/route.ts";
const listRoute = read(listRoutePath);
const detailRoute = read(detailRoutePath);
const routes = `${listRoute}\n${detailRoute}`;
const contextual = read("src/components/numbering-contextual-entrypoints.tsx");
const productionSlice = read("src/lib/production-slice.ts");
const service = read("src/lib/drawing-workbench.ts");
const cursorService = read("src/lib/pdm-workbench-cursor.ts");
const lifecycleService = read("src/lib/number-lifecycle-simplification.ts");
const repository = read("src/lib/repositories/drawing-workbench-async-repository.ts");
const lifecycleRepository = read("src/lib/repositories/number-lifecycle-simplification-async-repository.ts");
const existingFileVerificationRoute = read("src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts");

record("DEV053-HTTP-001 exact GET-only workbench routes exist",
  fs.existsSync(path.join(root, listRoutePath)) && fs.existsSync(path.join(root, detailRoutePath)) &&
  (routes.match(/export async function GET/gu)?.length ?? 0) === 2 &&
  !/export async function (POST|PATCH|PUT|DELETE)/u.test(routes));
record("DEV053-HTTP-002 list and detail are flag and page-permission gated",
  (routes.match(/isUnifiedDrawingWorkbenchV1Enabled\(\)/gu)?.length ?? 0) === 2 &&
  (routes.match(/requireNumberingPageAsync\(request, "numbering\.drawings\.view"\)/gu)?.length ?? 0) === 2);
record("DEV053-HTTP-003 tenant and candidate visibility are server-derived",
  has(routes, ["resolveNumberingCompanyContextAsync", "numbering.workspace.view", "companyResult.company.companyId"]) &&
  !routes.includes("request.nextUrl.searchParams.get(\"companyId\")"));
record("DEV053-HTTP-004 responses are private no-store and errors are structured",
  (routes.match(/DRAWING_WORKBENCH_NO_STORE_HEADERS/gu)?.length ?? 0) >= 6 &&
  has(service, ["drawingWorkbenchErrorResponse", "PdmWorkbenchCursorError", "headers: DRAWING_WORKBENCH_NO_STORE_HEADERS"]) &&
  cursorService.includes('readonly code = "workbench_invalid_cursor"'));
record("DEV053-HTTP-005 contextual create uses candidate API plus idempotency",
  (contextual.match(/fetch\("\/api\/numbering\/draft-workspaces"/gu)?.length ?? 0) >= 2 &&
  (contextual.match(/"Idempotency-Key": idempotencyKey/gu)?.length ?? 0) >= 2 &&
  has(contextual, ["sourceDrawingNumberId", "sourcePartNumberId", "sourceLinkType", "autoAcquireCandidates: true"]));
record("DEV053-HTTP-006 new-flag missing IDs fail closed without direct-master fallback",
  has(contextual, [
    "目前找不到來源圖號識別",
    "目前找不到主根識別",
    "製造圖必須先選定來源料號",
    "系統不會直接建立料號",
    "系統不會直接建立圖號",
    "window.location.assign(`/numbering/drawings?view=work&detail="
  ]) && (contextual.match(/if \(drawingWorkbenchEnabled\)/gu)?.length ?? 0) >= 2);
record("DEV053-HTTP-007 production mutation allowlist remains closed",
  !productionSlice.includes("drawings/workbench") && !productionSlice.includes("sourceDrawingNumberId") && !productionSlice.includes("sourcePartNumberId"),
  "DEV-053 remains local-only; no production route was opened");

process.env.NODE_ENV = "test";
process.env.PDM_AUTH_SECRET = "dev053-http-secret";
try {
  const { normalizeDrawingWorkbenchQuery } = await import("@/lib/drawing-workbench");
  const { isLocalDevelopmentPublicationEvidenceEnabled } = await import("@/lib/publication-evidence");
  const normalized = normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=work&stage=bundle_ready&limit=100&query=%20A005%20&purposeCode=M&recordStatus=Active"));
  let stageCode = "";
  let limitCode = "";
  let purposeCode = "";
  let recordStatusCode = "";
  let historyCode = "";
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?stage=not-real")); } catch (error) { stageCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?limit=101")); } catch (error) { limitCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?purposeCode=INVALID")); } catch (error) { purposeCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?recordStatus=INVALID")); } catch (error) { recordStatusCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?history=all")); } catch (error) { historyCode = error?.code ?? String(error); }
record("DEV053-HTTP-008 query contract normalizes valid input and rejects invalid bounds",
    normalized.view === "work" && normalized.stage === "bundle_ready" && normalized.limit === 100 && normalized.query === "A005" &&
    normalized.purposeCode === "M" && normalized.recordStatus === "Active" &&
    stageCode === "workbench_invalid_stage" && limitCode === "workbench_invalid_limit" &&
    purposeCode === "workbench_invalid_purpose" && recordStatusCode === "workbench_invalid_record_status" && historyCode === "workbench_invalid_history",
    JSON.stringify({ normalized, stageCode, limitCode, purposeCode, recordStatusCode, historyCode }));
  record("DEV053-HTTP-009 pagination is a bounded repository keyset before hydration",
    has(repository, [
      "async readListPage",
      "ORDER BY sort_value ${orderDirection}, row_key ASC",
      "LIMIT :scanLimit",
      "sort_value < :cursorSortValue",
      "getWorkspacesByIds(candidateIds",
      "listDrawingModuleRecordsByIds(drawingIds",
      "unifiedDrawingRepository.getByIds"
    ]) && !service.includes("findIndex((row)") && !repository.includes("MAX_SNAPSHOT_IDENTITIES"));
  record("DEV053-HTTP-010 formal purpose and status filters execute inside the bounded identity query",
    has(repository, [
      "canonical.purpose_code = :purposeCode",
      "formal.record_status = :recordStatus",
      "purposeCode: input.purposeCode",
      "recordStatus: input.recordStatus"
    ]) && has(service, [
      "purposeCode: query.purposeCode",
      "recordStatus: query.recordStatus",
      "includeCandidates: actor.permissions.workspaceView && !query.recordStatus"
    ]));
  const defaultQuery = normalizeDrawingWorkbenchQuery(new URL("http://local.test/"));
  const historyQuery = normalizeDrawingWorkbenchQuery(new URL("http://local.test/?history=include"));
  record("DEV053-HTTP-011 default-all and explicit history contract are server normalized",
    defaultQuery.view === "all" && defaultQuery.includeHistory === false && historyQuery.includeHistory === true &&
    has(service, ['query.includeHistory || row.stage !== "history_only"', 'stage === "history_only" ? "&history=include" : ""']));
  record("DEV053-HTTP-012 permission guidance is derived only from server permissions",
    has(routes, [
      'canUserUseNumberingActionAsync(auth.user, "numbering.draft.update")',
      'canUserUseNumberingActionAsync(auth.user, "numbering.attachments.manage")',
      'canUserUseNumberingActionAsync(auth.user, "settings.admin_matrix")'
    ]) && has(service, ["permissionCode", "contactRole", "adminHref", '"/settings/workflow"']));
  record("DEV053-HTTP-013 local evidence is enabled only for explicit non-production validation",
    isLocalDevelopmentPublicationEvidenceEnabled({ NODE_ENV: "development", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true" }) === true &&
    isLocalDevelopmentPublicationEvidenceEnabled({ NODE_ENV: "production", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true" }) === false &&
    isLocalDevelopmentPublicationEvidenceEnabled({ NODE_ENV: "development" }) === false &&
    has(lifecycleService, [
      "verifyObjectHash(stored.key, stored.sha256)",
      "candidate_file_verification_failed",
      "local-development-validation",
      "cleanupTarget.current",
      "storageService.deleteObject(target.key)"
    ]));
  record("DEV053-HTTP-014 existing-file verification is target-only, idempotent, permission-gated and production fail-closed",
    has(existingFileVerificationRoute, [
      "export async function PATCH",
      'requireNumberStateCommandAccessAsync(request, "numbering.draft.update", body)',
      "validateNumberStateMutationRequest",
      "requireIdempotency: true",
      "verifyExistingNumberingCandidateRevisionFile"
    ]) && has(lifecycleService, [
      "candidateFileVerificationSource",
      "storagePointerFromRecord",
      "createFileStorageServiceForPointer",
      "getObjectMetadata",
      "verifyObjectHash(pointer.key, source.contentHash)",
      "isLocalDevelopmentPublicationEvidenceEnabled()",
      "candidate_file_existing_verification_not_available",
      "numbering.candidate_revision.existing_file_verified.v1"
    ]) && has(lifecycleRepository, [
      "verifyExistingCandidateFile",
      "publication_evidence_id IS NULL",
      "pdm.numbering.verify_existing_candidate_revision_file",
      "CANDIDATE_FILE_VERIFICATION_STALE"
    ]) && !existingFileVerificationRoute.includes("companyId"));
} catch (error) {
  record("DEV053-HTTP-runtime", false, error instanceof Error ? error.stack ?? error.message : String(error));
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
