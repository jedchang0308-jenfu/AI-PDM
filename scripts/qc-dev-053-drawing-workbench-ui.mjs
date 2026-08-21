#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const component = read("src/components/drawing-workbench.tsx");
const service = read("src/lib/drawing-workbench.ts");
const statusEngine = read("src/lib/drawing-workbench-status.ts");
const page = read("src/app/numbering/drawings/page.tsx");
const attachment = read("src/components/master-attachment-panel.tsx");
const contextual = read("src/components/numbering-contextual-entrypoints.tsx");
const revisionWorkbench = read("src/app/numbering/revisions/page.tsx");
const candidateEditor = read("src/components/numbering-candidate-revision-editor.tsx");
const submissionResultComponent = read("src/components/numbering-submission-result.tsx");
const drawingWorkspaceDrawer = read("src/components/drawing-workspace-drawer.tsx");
const sharedWorkbenchList = read("src/components/pdm-workbench-list.tsx");
const sharedWorkbenchController = read("src/components/use-pdm-workbench-controller.ts");
const sharedListKeyboard = read("src/components/use-list-keyboard-shortcuts.ts");
const numberStateWorkspace = read("src/components/number-state-workspace.tsx");
const sharedPreview = read("src/components/drawing-detail-preview.tsx");
const candidateFileRoute = read("src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/route.ts");
const approvalPage = read("src/app/approvals/page.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
const css = read("src/app/globals.css");

record("DEV053-UI-001 enabled experience is one workbench without visible tabs",
  has(component, ["<h1>圖號工作台</h1>", "搜尋圖號工作、確認目前工作狀態，並執行唯一下一步。", "drawing-workbench-table"]) &&
  !component.includes("NumberStateModuleTabs") && !component.includes('role="tab"') &&
  page.includes("if (workbenchEnabled) return <DrawingWorkbench />;"));
record("DEV053-UI-002 table exposes four scan columns with part number separated from name",
  has(component, ['key: "code"', 'key: "name"', 'header: "品名"', 'key: "part"', 'header: "料號"', 'key: "status"', 'header: "工作狀態"']) &&
  (component.includes('header: "圖號"') || component.includes('header: <NumberSortHeader label="圖號"')) &&
  component.includes('className: "drawing-workbench-layout-spacer pdm-identity-layout-spacer"') &&
  component.includes('<SearchHighlight value={row.displayName} query={query} />') &&
  component.includes('<SearchHighlight value={row.relatedPartSummary} query={query} />') &&
  has(sharedWorkbenchList, ["<thead>", "columns.map", "column.dataLabel"]) &&
  !component.includes('data-label="下一步"') &&
  !component.includes("<th>保留號</th>"));
const normalizer = component.slice(component.indexOf("function readDrawingWorkbenchLocation"), component.indexOf("export function DrawingWorkbench"));
record("DEV053-UI-003 legacy reserved deep link normalizes without mutation",
  has(normalizer, ['params.get("tab") === "reserved"', 'if (canonicalize)', 'params.delete("tab")', 'params.set("view", view)', "window.history.replaceState"]) &&
  !normalizer.includes("fetch(") && !normalizer.includes('method: "POST"'));
record("DEV053-UI-004 server-derived next action is kept in the drawer, not repeated in list rows",
  (component.match(/<PrimaryAction action=\{row\.primaryAction\}/gu) ?? []).length === 1 &&
  has(component, ["DrawingWorkspaceDrawer", "primaryAction=", "row.primaryAction", "disabledReason", "href"]) &&
  has(drawingWorkspaceDrawer, ['dataComponent="drawing-workspace-drawer"', 'data-drawing-primary-action-slot="true"']) &&
  !component.includes('data-label="下一步"') &&
  !component.includes("row.actions.map"));
record("DEV053-UI-005 controlled revision files remain the only drawing file authority",
  has(component, ['authorityMode="controlled_summary"', "isManufacturingDrawingPurpose"]) &&
  !component.includes('authorityMode="reference_manager"') &&
  has(attachment, ['"combined_legacy" | "controlled_summary" | "reference_manager"', "isControlledRevisionAttachment", "受控版次檔案", "effectiveReadOnly", "下載", 'entityType === "drawing_number" && !effectiveReadOnly']));
record("DEV053-UI-006 error, empty, busy and accessibility states are visible",
  has(component, ['role="alert"', 'role="status"', "目前沒有符合條件的圖號工作", "正在載入圖號工作", 'ariaLabel="圖號工作清單"']) &&
  has(component, ["useRememberedDrawerWidth", "aria-live=\"polite\""]) && has(sharedWorkbenchList, ["aria-selected", 'role="region"']));
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
    "updateWorkbenchQuery({ query:",
    "onApply={(value) => updateWorkbenchQuery({ humanStatus: value })}",
    "onApply={(value) => updateWorkbenchQuery({ seriesCode: value })}",
    "onApply={(value) => updateWorkbenchQuery({ purposeCode: value })}",
    "onApply={(value) => updateWorkbenchQuery({ recordStatus: value })}",
    "PdmWorkbenchMultiSelectFilter"
  ]) && has(sharedWorkbenchController, ["const setQuery = useCallback", "resetPagination();"]));
record("DEV053-UI-011 formal filters and linked-part identity remain visible on the unified list",
  has(component, [
    "圖面用途",
    "資料狀態",
    'dataLabel: "料號"',
    "row.relatedPartSummary",
    "<PdmWorkbenchMultiSelectFilter label=\"工作狀態\"",
    "WORK_STATUS_MULTI_SELECT_OPTIONS",
    "<HumanStatusBadge status={row.humanStatus} responsibilityStatus={row.responsibilityStatus} viewerActionability={row.viewerActionability} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} />"
  ]) && has(statusEngine, [
    "releaseStatusMismatch",
    "projectDrawingHumanStatus",
    "humanStatus"
  ]));
record("DEV053-UI-012 state-driven primary action and contextual maintenance entrypoints remain",
  has(component, [
    'capability="drawing-revision"',
    "NumberingContextualEntrypoints",
    'mode="drawing"',
    "withDrawingReturnTo",
    "returnTo="
  ]) && !component.includes('capability="drawing-submission"') &&
  !component.includes('capability="drawing-relations"') &&
  !component.includes('capability="manufacturing-impact"') &&
  !component.includes("<DrawingRevisionWorkbench") &&
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
record("DEV053-UI-014 same-root part identity stays visible without duplicate inline mutation authority",
  has(component, [
    'data-capability="same-root-part-management"',
    "PartMasterDataCard",
    "材質",
    "顏色",
    "表面處理",
    "變體",
    "主要製造圖"
  ]) &&
  !component.includes('data-capability="part-variant-maintenance"') &&
  !component.includes('/api/parts/${encodeURIComponent(part.partNumber)}/variant'));
record("DEV053-UI-015 production-slice restrictions stay visible and fail closed",
  has(component, [
    "/api/production-slice/status",
    "routeIsUnopened",
    "drawing-workbench-unopened-action",
    "未開放",
    "productionSliceEnforced={Boolean(productionSlice?.configured)}"
  ]) && has(css, [".drawing-workbench-unopened-action", ".drawing-workbench-inline-unopened"]));
record("DEV053-UI-016 one server primary action remains while secondary tools route to shared work pages",
  !component.includes("row.actions.map") &&
  has(component, ["<PrimaryAction action={row.primaryAction}", "row.primaryAction", "withDrawingReturnTo"]) &&
  !component.includes("DrawingMoreMenu"));
record("DEV053-UI-017 default-all, deep-link history and terminal guidance remain compatible",
  has(component, [
    'view: "all"',
    "parseWorkStatusSelection",
    "const includeHistory = workStatusQuery.includeHistory",
    'history: query.includeHistory ? "include" : "exclude"',
    'row.stage === "history_only"',
    "row.terminal.reasonLabel",
    "row.terminal.nextStepLabel"
  ]) && !component.includes('className="drawing-workbench-history-toggle"'));
record("DEV053-UI-018 list concurrency, stale cursor and keyboard interaction are guarded",
  has(component, ["usePdmWorkbenchController", "useListKeyboardShortcuts"]) && has(sharedWorkbenchController, [
    "listRequestRef",
    "listAbortRef.current?.abort()",
    "response.status === 400 && currentCursor",
    "清單內容已更新，已回到第一頁"
  ]) && has(sharedListKeyboard, [
    'event.key === "ArrowDown"',
    'event.key === "Enter"',
    "copyTextToClipboardBestEffort"
  ]));
record("DEV053-UI-019 candidate revision upload is multi-file, sequential and actionable",
  has(candidateEditor, [
    "PendingCandidateFile",
    "queuedFiles.map",
    "idempotencyKey",
    "safeIdempotencyHeader",
    "上傳並完成驗證",
    "都已就緒，現在可送交審核",
    "RevisionFileRequirementsHelp",
    "送審檔案需求",
    "建議",
    "requiredPrimaryRoles",
    "hasRequiredPrimaryEvidence",
    "系統會自動辨識格式",
    "uploadCandidateFile",
    "uploadProgress",
    "candidate-revision-upload-progress",
    "正在處理第",
    "傳輸中",
    "伺服器驗證中...",
    "上傳逾時"
  ]) &&
  !candidateEditor.includes("檔案類別") &&
  !candidateEditor.includes("candidate-primary-") &&
  !candidateEditor.includes('form.set("role"') &&
  !candidateEditor.includes('form.set("isPrimary"') &&
  has(numberStateWorkspace, [
    "shouldRenderLifecycleV2Pending(projectNumberLifecycleUserView(workspace.lifecycleV2).stage)",
    '!["drawing_preparation", "drawing_addendum_required", "bundle_ready"].includes(stage)',
    "DrawingDetailPreview"
  ]) &&
  has(sharedPreview, ['data-component="drawing-detail-preview"', "3D 模型", "2D 圖面"]) &&
  !numberStateWorkspace.includes("先在上方加入"));
record("DEV053-UI-020 permission guidance names the missing permission and safe admin route",
  has(component, ["PermissionGuidance", "action.disabledReason", "action.adminHref", "前往權限設定"]) &&
  has(service, ["permissionCode", "contactRole", "adminHref"]));
record("DEV053-UI-021 required primary files cannot use legacy verification while non-primary files keep recovery",
  has(candidateEditor, [
    "verifyExistingFiles",
    "/candidate-revisions/${encodeURIComponent(candidate.id)}/files",
    'method: "PATCH"',
    "fileId: file.id",
    "!isRequiredPrimaryRole(file.role)",
    "主要 2D 圖面與 3D 模型需重新上傳",
    "本版不可沿用舊 primary 證據",
    "可驗證已保存的非 primary 檔案",
    "驗證既有檔案（${verifiableExistingFiles.length}）",
    "原檔與編號都不會改變",
    "已成功驗證的檔案會保留",
    "expectedRowVersion = latestCandidate?.rowVersion"
  ]) && has(css, [
    ".candidate-revision-existing-verification",
    "@media (max-width: 760px)"
  ]) && submissionResultComponent.includes("需要先驗證，才能送審"));
record("DEV053-UI-022 historical backfill parser remains compatible without loose-attachment write UI",
  has(attachment, [
    "historicalBackfillGroups",
    "currentControlledRevision",
    "currentReleasedRevisionPackageId",
    "supplementCandidateAttachments",
    "未送審舊版",
    "核准後只進歷史",
    "補登 {group.revision} 歷史版",
    "onBackfillHistoricalRevision"
  ]) && !component.includes("onBackfillHistoricalRevision=") && has(revisionWorkbench, [
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
  ]) && !component.includes("drawing-revision-embed") && !component.includes('authorityMode="reference_manager"'));

record("DEV053-UI-023 candidate, formal and approval drawers use one content renderer",
  has(drawingWorkspaceDrawer, ["DrawingDetailContent", "content?: DrawingDetailContentModel"]) &&
  has(component, ["DrawingDetailContent as SharedDrawingDetailContent", "<SharedDrawingDetailContent", "bodyClassName={embedded ? \"drawing-detail-content\" : \"pdm-entity-drawer-body\"}"]) &&
  has(component, ["content={{", "bodyTitle: \"圖面與附件\""]) &&
  has(numberStateWorkspace, ["content={{", "bodyTitle: \"圖面與附件\""]) &&
  has(approvalPage, ["content={{", "bodyTitle: \"圖面與附件\""]) &&
  has(sharedPreview, ["PreviewMedia", "預覽正在準備", "預覽等待逾時", "重新整理預覽"]));

record("DEV053-UI-024 pending preview polling is console-clean and kind-specific",
  has(sharedPreview, ['response.status === 202', 'kind === "three-d" ? "3D" : "2D"', "預覽轉檔完成後會自動顯示"]) &&
  has(candidateFileRoute, ['status: 202', '"retry-after": "2"', '"x-pdm-preview-state": "pending"']));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
