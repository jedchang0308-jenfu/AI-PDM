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
const repository = read("src/lib/repositories/drawing-workbench-async-repository.ts");

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
  (routes.match(/cache-control": "private, no-store"/gu)?.length ?? 0) === 2 &&
  has(service, ["drawingWorkbenchErrorResponse", "workbench_invalid_cursor"]));
record("DEV053-HTTP-005 contextual create uses candidate API plus idempotency",
  (contextual.match(/fetch\("\/api\/numbering\/draft-workspaces"/gu)?.length ?? 0) >= 2 &&
  (contextual.match(/"Idempotency-Key": idempotencyKey/gu)?.length ?? 0) >= 2 &&
  has(contextual, ["sourceDrawingNumberId", "sourcePartNumberId", "sourceLinkType", "autoAcquireCandidates: true"]));
record("DEV053-HTTP-006 new-flag missing IDs fail closed without direct-master fallback",
  has(contextual, [
    "目前找不到來源圖號識別",
    "目前找不到主根識別",
    "製造圖必須先選定來源料號",
    "系統不會直接建立正式料號",
    "系統不會直接建立正式圖號",
    "window.location.assign(`/numbering/drawings?view=work&detail="
  ]) && (contextual.match(/if \(drawingWorkbenchEnabled\)/gu)?.length ?? 0) >= 2);
record("DEV053-HTTP-007 production mutation allowlist remains closed",
  !productionSlice.includes("drawings/workbench") && !productionSlice.includes("sourceDrawingNumberId") && !productionSlice.includes("sourcePartNumberId"),
  "DEV-053 remains local-only; no production route was opened");

process.env.NODE_ENV = "test";
process.env.PDM_AUTH_SECRET = "dev053-http-secret";
try {
  const { normalizeDrawingWorkbenchQuery } = await import("@/lib/drawing-workbench");
  const normalized = normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=work&stage=bundle_ready&limit=100&query=%20A005%20&purposeCode=M&recordStatus=Active"));
  let stageCode = "";
  let limitCode = "";
  let purposeCode = "";
  let recordStatusCode = "";
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?stage=not-real")); } catch (error) { stageCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?limit=101")); } catch (error) { limitCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?purposeCode=INVALID")); } catch (error) { purposeCode = error?.code ?? String(error); }
  try { normalizeDrawingWorkbenchQuery(new URL("http://local.test/?recordStatus=INVALID")); } catch (error) { recordStatusCode = error?.code ?? String(error); }
record("DEV053-HTTP-008 query contract normalizes valid input and rejects invalid bounds",
    normalized.view === "work" && normalized.stage === "bundle_ready" && normalized.limit === 100 && normalized.query === "A005" &&
    normalized.purposeCode === "M" && normalized.recordStatus === "Active" &&
    stageCode === "workbench_invalid_stage" && limitCode === "workbench_invalid_limit" &&
    purposeCode === "workbench_invalid_purpose" && recordStatusCode === "workbench_invalid_record_status",
    JSON.stringify({ normalized, stageCode, limitCode, purposeCode, recordStatusCode }));
  record("DEV053-HTTP-009 pagination is a bounded repository keyset before hydration",
    has(repository, [
      "async readListPage",
      "ORDER BY updated_at DESC, row_key ASC",
      "LIMIT :scanLimit",
      "updated_at < :cursorUpdatedAt",
      "getWorkspacesByIds(candidateIds",
      "listDrawingModuleRecordsByIds(drawingIds"
    ]) && !service.includes("findIndex((row)") && !repository.includes("MAX_SNAPSHOT_IDENTITIES"));
  record("DEV053-HTTP-010 formal purpose and status filters execute inside the bounded identity query",
    has(repository, [
      "d.purpose_code = :purposeCode",
      "d.record_status = :recordStatus",
      "purposeCode: input.purposeCode",
      "recordStatus: input.recordStatus"
    ]) && has(service, [
      "purposeCode: query.purposeCode",
      "recordStatus: query.recordStatus",
      "includeCandidates: actor.permissions.workspaceView && !query.purposeCode && !query.recordStatus"
    ]));
} catch (error) {
  record("DEV053-HTTP-runtime", false, error instanceof Error ? error.stack ?? error.message : String(error));
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
