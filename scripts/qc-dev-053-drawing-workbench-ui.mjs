#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const component = read("src/components/drawing-workbench.tsx");
const statusEngine = read("src/lib/drawing-workbench-status.ts");
const page = read("src/app/numbering/drawings/page.tsx");
const attachment = read("src/components/master-attachment-panel.tsx");
const contextual = read("src/components/numbering-contextual-entrypoints.tsx");
const revisionWorkbench = read("src/app/numbering/revisions/page.tsx");
const candidateEditor = read("src/components/numbering-candidate-revision-editor.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
const css = read("src/app/globals.css");

record("DEV053-UI-001 enabled experience is one workbench without visible tabs",
  has(component, ["<h1>圖號工作台</h1>", "搜尋圖號工作、確認目前工作狀態，並執行唯一下一步。", "drawing-workbench-table"]) &&
  !component.includes("NumberStateModuleTabs") && !component.includes('role="tab"') &&
  page.includes("if (workbenchEnabled) return <DrawingWorkbench />;"));
record("DEV053-UI-002 table exposes exactly three scan columns",
  component.includes("<thead><tr><th>圖號</th><th>品名</th><th>工作狀態</th></tr></thead>") &&
  !component.includes('data-label="下一步"') &&
  !component.includes("<th>保留號</th>"));
const normalizer = component.slice(component.indexOf("function normalizeInitialLocation"), component.indexOf("export function DrawingWorkbench"));
record("DEV053-UI-003 legacy reserved deep link normalizes without mutation",
  has(normalizer, ['params.get("tab") === "reserved"', 'params.delete("tab")', 'params.set("view", view)', "window.history.replaceState"]) &&
  !normalizer.includes("fetch(") && !normalizer.includes('method: "POST"'));
record("DEV053-UI-004 server-derived next action is kept in the drawer, not repeated in list rows",
  (component.match(/<PrimaryAction action=\{row\.primaryAction\}/gu) ?? []).length === 1 &&
  has(component, ["PdmEntityDetailDrawer", "actions=", "row.primaryAction", "disabledReason", "href"]) &&
  !component.includes('data-label="下一步"') &&
  !component.includes("row.actions.map"));
record("DEV053-UI-005 controlled revision files and reference attachments use separate authority views",
  has(component, ['authorityMode="controlled_summary"', 'authorityMode="reference_manager"', "canManageReferenceAttachments"]) &&
  has(attachment, ['"combined_legacy" | "controlled_summary" | "reference_manager"', "isControlledRevisionAttachment", "受控版次檔案", "參考附件", "effectiveReadOnly", "下載"]));
record("DEV053-UI-006 error, empty, busy and accessibility states are visible",
  has(component, ['role="alert"', 'role="status"', "目前沒有符合條件的圖號工作", "正在載入圖號工作", "aria-label=\"圖號工作清單\""]) &&
  has(component, ["useRememberedDrawerWidth", "aria-selected", "aria-live=\"polite\""]));
record("DEV053-UI-007 contextual add operations enter candidate workflow when enabled",
  has(contextual, ["drawingWorkbenchEnabled", "建立圖號工作", "建立料號工作", "/api/numbering/draft-workspaces", "candidate:"]) &&
  has(contextual, ["新增同根圖號", "新增同圖料號"]));
record("DEV053-UI-008 old direct-master behavior remains only behind flag-off branch",
  has(contextual, ["if (drawingWorkbenchEnabled)", "/api/numbering/roots/", "sourceEntrypoint"]) &&
  page.includes("NumberStateModuleTabs module=\"drawings\"") && page.includes("NumberStateWorkspaceWorkbench module=\"drawings\""));
record("DEV053-UI-009 responsive rules cover desktop, 1024 and mobile card layout",
  has(css, [
    ".drawing-workbench-filter-grid",
    "@media (max-width: 1024px)",
    "@media (max-width: 760px)",
    ".drawing-workbench-table td",
    ".drawing-workbench-table tbody tr"
  ]));
record("DEV053-UI-010 client pagination resets before filter state changes",
  has(component, [
    "resetPagination(); setQuery",
    "resetPagination(); setView",
    "resetPagination(); setHumanStatus",
    "resetPagination(); setSeriesCode",
    "resetPagination(); setPurposeCode",
    "resetPagination(); setRecordStatus"
  ]));
record("DEV053-UI-011 formal filters and linked-part identity remain visible on the unified list",
  has(component, [
    "圖面用途",
    "資料狀態",
    "料號：{row.relatedPartSummary}",
    "HUMAN_STATUS_FILTER_OPTIONS.map",
    "<HumanStatusBadge status={row.humanStatus} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />"
  ]) && has(statusEngine, [
    "releaseStatusMismatch",
    "projectDrawingHumanStatus",
    "humanStatus"
  ]));
record("DEV053-UI-012 revision, submission, relation and manufacturing-impact entrypoints are restored",
  has(component, [
    'capability="drawing-revision"',
    'capability="drawing-submission"',
    'capability="drawing-relations"',
    'capability="manufacturing-impact"',
    "buildDrawingRevisionHref",
    "href={revisionHref}",
    "/numbering/search?query=",
    "/numbering/impact?drawingNumber=",
    "returnTo="
  ]) && !component.includes("<DrawingRevisionWorkbench") &&
  has(revisionWorkbench, ["export function DrawingRevisionWorkbench", "getInitialReturnTo", "返回圖號"]));
record("DEV053-UI-013 release mismatch, title-block risk and submission readiness are restored",
  has(component, [
    'data-capability="title-block-risk"',
    'data-capability="release-status-remediation"',
    'data-capability="submission-readiness"',
    "發布狀態待確認",
    "Title block 變體風險",
    "送審檢查"
  ]));
record("DEV053-UI-013A missing standard cost is optional and excluded from blocking readiness",
  has(component, [
    "const hasOutstandingItems = incompleteParts.length > 0 || Boolean(pendingApproval)",
    "const outstandingCount = incompleteParts.length + (pendingApproval?.count ?? 0)",
    "筆未設定・選填",
    "標準成本未設定（選填）"
  ]) &&
  !component.includes("incompleteParts.length + missingCostParts.length") &&
  !component.includes('title="標準成本" state={`${missingCostParts.length} 筆`} tone="danger"') &&
  has(searchPage, [
    "筆未設定（選填）",
    'tone={missingCostParts.length > 0 ? "default" : "success"}'
  ]));
record("DEV053-UI-014 same-root part, variant, cost and primary-drawing management are restored",
  has(component, [
    'data-capability="same-root-part-management"',
    'data-capability="part-variant-maintenance"',
    'data-capability="standard-cost-maintenance"',
    '/api/parts/${encodeURIComponent(part.partNumber)}/variant',
    "材質",
    "顏色",
    "表面處理",
    "變體",
    "主要製造圖"
  ]));
record("DEV053-UI-015 production-slice restrictions stay visible and fail closed",
  has(component, [
    "/api/production-slice/status",
    "routeIsUnopened",
    "drawing-workbench-unopened-action",
    "未開放",
    "formalActionsUnopened={Boolean(productionSlice?.configured)}",
    "mutationsBlocked={Boolean(productionSlice?.configured)}"
  ]) && has(css, [".drawing-workbench-unopened-action", ".drawing-workbench-inline-unopened"]));
record("DEV053-UI-016 one server primary action remains while secondary tools route to shared work pages",
  !component.includes("row.actions.map") &&
  has(component, ["<PrimaryAction action={row.primaryAction}", "主要下一步只保留一個", "其他既有管理功能集中在這裡", "revisionHref"]));
record("DEV053-UI-017 default-all, explicit history and terminal guidance are visible",
  has(component, [
    'useState<DrawingWorkbenchView>("all")',
    'rawView === "mine" ? "mine" : "all"',
    "包含歷史",
    'history: includeHistory ? "include" : "exclude"',
    'row.stage === "history_only"',
    "row.terminal.reasonLabel",
    "row.terminal.nextStepLabel"
  ]));
record("DEV053-UI-018 list concurrency, stale cursor and keyboard interaction are guarded",
  has(component, [
    "listRequestRef",
    "listAbortRef.current?.abort()",
    "response.status === 400 && currentCursor",
    "清單內容已更新，已回到第一頁",
    "aria-keyshortcuts",
    'event.key === "ArrowDown"',
    'event.key === "Enter"',
    "navigator.clipboard.writeText"
  ]));
record("DEV053-UI-019 candidate revision upload is multi-file, sequential and actionable",
  has(candidateEditor, [
    "PendingCandidateFile",
    "queuedFiles.map",
    "idempotencyKey",
    "上傳並完成驗證",
    "主要受控檔已完成，可送審",
    "recommendedFileWarnings"
  ]));
record("DEV053-UI-020 permission guidance names the missing permission and safe admin route",
  has(component, ["PermissionGuidance", "permissionCode", "contactRole", "前往權限設定", "canManageReferenceAttachments"]));
record("DEV053-UI-021 legacy files expose one no-reupload recovery CTA",
  has(candidateEditor, [
    "verifyExistingFiles",
    "/candidate-revisions/${encodeURIComponent(candidate.id)}/files",
    'method: "PATCH"',
    "fileId: file.id",
    "驗證既有檔案（${unverifiedFiles.length}）",
    "不用重新上傳",
    "原檔與編號都不會改變",
    "需要先驗證，才能送審",
    "已成功驗證的檔案會保留",
    "expectedRowVersion = latestCandidate?.rowVersion"
  ]) && has(css, [
    ".candidate-revision-existing-verification",
    "@media (max-width: 760px)"
  ]));
record("DEV053-UI-022 old unsubmitted revisions route to the shared submission page without supplement confusion",
  has(attachment, [
    "historicalBackfillGroups",
    "currentControlledRevision",
    "currentReleasedRevisionPackageId",
    "supplementCandidateAttachments",
    "未送審舊版",
    "核准後只進歷史",
    "補登 {group.revision} 歷史版",
    "onBackfillHistoricalRevision"
  ]) && has(component, [
    "buildDrawingRevisionHref",
    'params.set("source", "historical_backfill")',
    'params.set("revision", historicalBackfill.revision)',
    'params.append("attachmentId", attachmentId)',
    "window.location.assign(buildDrawingRevisionHref",
    "onBackfillHistoricalRevision="
  ]) && has(revisionWorkbench, [
    "getInitialRevision(searchParams)",
    "getInitialAttachmentIds(searchParams)",
    'searchParams.get("source") === "historical_backfill"',
    "getInitialReturnTo(searchParams)",
    "initialRevisionPrefillRef",
    "development mode may run the initial effect twice",
    "preserveInitialRevision",
    "補登舊版；核准後只進歷史，不取代最新版。",
    "返回圖號"
  ]) && has(css, [
    ".master-attachment-historical-backfill",
    ".master-attachment-historical-backfill-heading",
    ".drawing-revision-topbar-actions"
  ]) && !component.includes("drawing-revision-embed"));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
