#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const component = read("src/components/drawing-workbench.tsx");
const page = read("src/app/numbering/drawings/page.tsx");
const attachment = read("src/components/master-attachment-panel.tsx");
const contextual = read("src/components/numbering-contextual-entrypoints.tsx");
const css = read("src/app/globals.css");

record("DEV053-UI-001 enabled experience is one workbench without visible tabs",
  has(component, ["<h1>圖號工作台</h1>", "搜尋圖號工作、確認目前工作狀態，並執行唯一下一步。", "drawing-workbench-table"]) &&
  !component.includes("NumberStateModuleTabs") && !component.includes('role="tab"') &&
  page.includes("if (workbenchEnabled) return <DrawingWorkbench />;"));
record("DEV053-UI-002 table exposes exactly the four decision columns",
  component.includes("<thead><tr><th>圖號</th><th>品名</th><th>工作狀態</th><th>下一步</th></tr></thead>") &&
  !component.includes("<th>保留號</th>"));
const normalizer = component.slice(component.indexOf("function normalizeInitialLocation"), component.indexOf("export function DrawingWorkbench"));
record("DEV053-UI-003 legacy reserved deep link normalizes without mutation",
  has(normalizer, ['params.get("tab") === "reserved"', 'params.delete("tab")', 'params.set("view", view)', "window.history.replaceState"]) &&
  !normalizer.includes("fetch(") && !normalizer.includes('method: "POST"'));
record("DEV053-UI-004 rows expose one server-derived next action",
  has(component, ["<PrimaryAction action={row.primaryAction}", "row.primaryAction", "disabledReason", "href"]) &&
  !component.includes("row.actions.map"));
record("DEV053-UI-005 master drawer reuses attachments in read-only mode",
  component.includes("<MasterAttachmentPanel") && component.includes("readOnly") &&
  has(attachment, ["readOnly?: boolean", "受控檔案摘要", "檔案變更請由候選首版或正式版次工作台進行。", "目前沒有可顯示的受控檔案", "!readOnly", "下載"]));
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
    "resetPagination(); setStage",
    "resetPagination(); setSeriesCode",
    "resetPagination(); setPurposeCode",
    "resetPagination(); setRecordStatus"
  ]));
record("DEV053-UI-011 formal filters and linked-part identity remain visible on the unified list",
  has(component, [
    "圖面用途",
    "資料狀態",
    "料號：{row.relatedPartSummary}",
    "pendingApprovalCount",
    "releaseStatusMismatch",
    "warningCount"
  ]));
record("DEV053-UI-012 revision, submission, relation and manufacturing-impact entrypoints are restored",
  has(component, [
    'capability="drawing-revision"',
    'capability="drawing-submission"',
    'capability="drawing-relations"',
    'capability="manufacturing-impact"',
    "/numbering/revisions?drawingNumber=",
    "/submission-workbench",
    "/numbering/search?query=",
    "/numbering/impact?drawingNumber="
  ]));
record("DEV053-UI-013 release mismatch, title-block risk and submission readiness are restored",
  has(component, [
    'data-capability="title-block-risk"',
    'data-capability="release-status-remediation"',
    'data-capability="submission-readiness"',
    "發布狀態待確認",
    "Title block 變體風險",
    "送審檢查"
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
record("DEV053-UI-016 primary action remains singular while duplicate revision entry is removed",
  component.includes('row.primaryAction?.kind === "create_revision"') && component.includes("primaryIsRevision ? null") &&
  !component.includes("row.actions.map") &&
  has(component, ["主要下一步只保留一個", "其他既有管理功能集中在這裡"]));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
