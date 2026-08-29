#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  NUMBER_STATE_FLOW_V1_FLAG,
  isNumberStateFlowV1Enabled,
  numberStateFlowV1ClientStatus
} from "../src/lib/number-state-flow-feature.ts";
import {
  getProductionSliceState,
  isProductionSliceOpenPagePath,
  shouldBlockProductionSlicePagePath
} from "../src/lib/production-slice.ts";
import { resolveNumberStateLegacyRedirect } from "../src/lib/number-state-flow-legacy-route.ts";

const root = process.cwd();
const requestedSuite = process.argv.includes("--suite")
  ? process.argv[process.argv.indexOf("--suite") + 1]
  : "all";
const results = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function record(suite, id, passed, detail) {
  if (requestedSuite !== "all" && requestedSuite !== suite) return;
  results.push({ suite, id, passed: Boolean(passed), detail });
}

const enabledEnv = { PDM_NUMBER_STATE_FLOW_V1: "true" };
const defaultEnv = {};
const disabledEnv = { PDM_NUMBER_STATE_FLOW_V1: "false" };
const productionEnabledEnv = {
  PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
  PDM_NUMBER_STATE_FLOW_V1: "true"
};
const productionDisabledEnv = {
  PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
  PDM_NUMBER_STATE_FLOW_V1: "false"
};
const localFullFunctionValidationEnv = {
  NODE_ENV: "development",
  PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
  PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
  PDM_NUMBER_STATE_FLOW_V1: "true"
};
const productionCannotBypassSliceEnv = {
  NODE_ENV: "production",
  PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
  PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
  PDM_NUMBER_STATE_FLOW_V1: "true"
};

record(
  "routes",
  "NSF-UI-FLAG-default-on",
  isNumberStateFlowV1Enabled(defaultEnv) &&
    !isNumberStateFlowV1Enabled(disabledEnv) &&
    ["1", "true", "on", "enabled"].every((value) => isNumberStateFlowV1Enabled({ PDM_NUMBER_STATE_FLOW_V1: value })) &&
    !isNumberStateFlowV1Enabled({ PDM_NUMBER_STATE_FLOW_V1: "yes" }) &&
    numberStateFlowV1ClientStatus(defaultEnv).flag === NUMBER_STATE_FLOW_V1_FLAG,
  "DEV-048 owner surfaces are canonical by default; the server-only flag remains an explicit rollback kill switch"
);

record(
  "routes",
  "NSF-UI-SLICE-page-gate",
  ["/upload", "/handoff"].every((pathname) => isProductionSliceOpenPagePath(pathname, productionEnabledEnv)) &&
    ["/upload", "/handoff"].every((pathname) => isProductionSliceOpenPagePath(pathname, productionDisabledEnv)) &&
    ["/upload", "/handoff"].every((pathname) => !shouldBlockProductionSlicePagePath(pathname, productionDisabledEnv)),
  "retired compatibility routes must remain guidance/redirect surfaces even when the rollback kill switch is off"
);
record(
  "routes",
  "NSF-UI-SLICE-canonical-create-page-gate",
  [productionEnabledEnv, productionDisabledEnv].every((env) =>
    isProductionSliceOpenPagePath("/numbering/create", env) &&
    !shouldBlockProductionSlicePagePath("/numbering/create", env)
  ),
  "the canonical create page must remain reachable whenever the official numbering mutation contract is open"
);
record(
  "routes",
  "NSF-UI-SLICE-local-full-function-boundary",
  !getProductionSliceState(localFullFunctionValidationEnv).configured &&
    getProductionSliceState(localFullFunctionValidationEnv).localFullFunctionValidation &&
    getProductionSliceState(productionCannotBypassSliceEnv).configured &&
    !getProductionSliceState(productionCannotBypassSliceEnv).localFullFunctionValidation,
  "the fixed localhost 3000 entrypoint may disable the production slice only in NODE_ENV=development; production remains fail-closed"
);

const statusRoute = read("src/app/api/numbering/state-flow/status/route.ts");
const rootLayout = read("src/app/layout.tsx");
const sidebar = read("src/components/sidebar-nav.tsx");
record(
  "routes",
  "NSF-UI-FLAG-server-projection",
  statusRoute.includes("numberStateFlowV1ClientStatus") &&
    statusRoute.includes("private, no-store") &&
    rootLayout.includes("<SidebarNav />") &&
    ["/numbering/part-drafts", "/numbering/request", "/upload", "/handoff"].every((pathname) => !sidebar.includes(`\"${pathname}\"`)) &&
    sidebar.includes("/technical-transfer"),
  "retired navigation entries must not return when the rollback kill switch is off"
);

const retiredPages = [
  "src/app/numbering/part-drafts/page.tsx",
  "src/app/numbering/part-drafts/layout.tsx",
  "src/app/numbering/request/page.tsx",
  "src/app/numbering/request/layout.tsx"
];
record(
  "routes",
  "NSF-UI-ROUTE-retired-pages-absent",
  retiredPages.every((relativePath) => !fs.existsSync(path.join(root, relativePath))),
  "DEV-048 retired numbering request and part-draft pages must be physically absent; middleware owns compatibility redirects"
);

const compatibilityLayouts = [
  ["src/app/upload/layout.tsx", "/numbering/search?legacyIntent=upload", "upload"],
  ["src/app/handoff/layout.tsx", "/technical-transfer?tab=published", "redirect"]
];
record(
  "routes",
  "NSF-UI-ROUTE-legacy-layouts",
  compatibilityLayouts.every(([relativePath, destination, strategy]) => {
    const source = read(relativePath);
    return !source.includes("return children") &&
      source.includes(`destination=\"${destination}\"`) &&
      (strategy === "redirect" || source.includes(`strategy=\"${strategy}\"`));
  }),
  "remaining upload and handoff compatibility pages must not mount their old child mutation flows"
);
const legacyRoute = read("src/components/number-state-legacy-route.tsx");
const middleware = read("src/middleware.ts");
const legacyMapping = read("src/lib/number-state-flow-legacy-route.ts");
record(
  "routes",
  "NSF-UI-ROUTE-preserve-intent",
  legacyRoute.includes("source.searchParams.forEach") &&
    legacyRoute.includes("legacyFrom") &&
    legacyRoute.includes("drawingNumber") &&
    legacyRoute.includes("submission-workbench") &&
    legacyRoute.includes("window.location.replace") &&
    !legacyRoute.includes("useMemo") &&
    middleware.includes("numberStateLegacyRedirect") &&
    middleware.includes("resolveNumberStateLegacyRedirect") &&
    legacyMapping.includes("nextSearchParams.set(\"legacyFrom\", pathname)") &&
    legacyMapping.includes("/numbering/part-drafts") &&
    legacyMapping.includes("/numbering/request") &&
    legacyMapping.includes("submission-workbench"),
  "server compatibility routing must preserve query/returnTo and contextual upload; the fallback must avoid hydration-time window reads"
);

const requestRedirect = resolveNumberStateLegacyRedirect(
  "/numbering/request",
  new URLSearchParams("returnTo=%2Fparts%3Ftab%3Ddrafts&foo=bar")
);
const uploadRedirect = resolveNumberStateLegacyRedirect(
  "/upload",
  new URLSearchParams("drawingNumber=A0001-M01&returnTo=%2Fparts")
);
const uploadGuidance = resolveNumberStateLegacyRedirect(
  "/upload",
  new URLSearchParams("returnTo=%2Fparts")
);
record(
  "routes",
  "NSF-UI-ROUTE-runtime-redirects",
  requestRedirect?.pathname === "/numbering/search" &&
    requestRedirect.searchParams.get("returnTo") === "/parts?tab=drafts" &&
    requestRedirect.searchParams.get("foo") === "bar" &&
    requestRedirect.searchParams.get("tab") === "reserved" &&
    requestRedirect.searchParams.get("create") === "new_bundle" &&
    requestRedirect.searchParams.get("legacyFrom") === "/numbering/request" &&
    uploadRedirect?.pathname === "/drawings/A0001-M01/submission-workbench" &&
    uploadRedirect.searchParams.get("returnTo") === "/parts" &&
    uploadGuidance === null &&
    resolveNumberStateLegacyRedirect("/numbering/request", new URLSearchParams())?.pathname === "/numbering/search",
  "middleware mapping must preserve request intent, redirect contextual upload, leave context-free upload on guidance, and never revive retired mutation pages"
);

const workspace = read("src/components/number-state-workspace.tsx");
const candidateRevisionEditor = read("src/components/numbering-candidate-revision-editor.tsx");
const drawingWorkspaceDrawer = read("src/components/drawing-workspace-drawer.tsx");
const drawingDetailContent = read("src/components/drawing-detail-content.tsx");
const drawingDetailPreview = read("src/components/drawing-detail-preview.tsx");
const partsPage = read("src/components/part-detail-content.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
const css = read("src/app/globals.css");
const detailDrawer = read("src/components/pdm-detail-drawer.tsx");
const entityDetailDrawer = read("src/components/pdm-entity-detail-drawer.tsx");

record(
  "ui",
  "NSF-UI-001-owner-entrypoints",
  partsPage.includes("NumberStateOwnerCreateAction") &&
    drawingsPage.includes("NumberStateOwnerCreateAction") &&
    searchPage.includes("NumberStateOwnerCreateAction") &&
    workspace.includes("建立編號"),
  "parts, drawings, and search owner surfaces must expose the shared create action"
);
record(
  "ui",
  "NSF-UI-002-reserved-number-list-separation",
  partsPage.includes("NumberStateWorkspaceWorkbench") &&
    drawingsPage.includes('<NumberStateWorkspaceWorkbench module="drawings"') &&
    searchPage.includes('<NumberStateWorkspaceWorkbench module="search"') &&
    workspace.includes("/parts?tab=drafts") &&
    workspace.includes("/numbering/search?tab=reserved") &&
    workspace.includes("/numbering/drawings?tab=reserved") &&
    workspace.includes("編號申請") &&
    workspace.includes("PAGE_SIZE = 20") &&
    !workspace.includes("numberEffectiveness") &&
    workspace.includes("ownerScope") &&
    workspace.includes("workspaceMatchesModule(workspace, module)") &&
    workspace.includes("candidateCodesForModule(workspace, module)") &&
    workspace.includes('reservedCodeLabel: "圖號"') &&
    workspace.includes('reservedCodeLabel: "料號"'),
  "reserved numbers require distinct module tabs with owner/lifecycle/number-effectiveness/search filters and stable pagination"
);
record(
  "ui",
  "NSF-UI-003-auto-reserve-four-modes",
  ["new_bundle", "append_drawing", "append_part", "append_drawing_part"].every((mode) => workspace.includes(`value: \"${mode}\"`)) &&
    workspace.includes("autoAcquireCandidates: true") &&
    workspace.includes("建立編號申請") &&
    workspace.includes("關閉視窗不會寫入資料") &&
    workspace.includes("Idempotency-Key"),
  "all four create modes must create the application and reserve numbers in one idempotent action"
);
record(
  "ui",
  "NSF-UI-004-server-projection",
  workspace.includes("NumberStateProjection") &&
    workspace.includes("WorkspaceHeaderStatus") &&
    workspace.includes("workspaceHeaderPrimaryAction") &&
    workspace.includes("NowWhatPanel") &&
    workspace.includes("LifecycleV2PendingPanel") &&
    (workspace.includes("shouldRenderLifecycleV2Pending(workspace.lifecycleV2.stage)") || workspace.includes("shouldRenderLifecycleV2Pending(projectNumberLifecycleUserView(workspace.lifecycleV2).stage)")) &&
    workspace.includes('!["official_controlled", "history_only"].includes(workspace.lifecycleV2.stage)') &&
    drawingDetailContent.includes('dataSection="drawing-pending"') &&
    workspace.includes("useNumberStateActionPermissions") &&
    workspace.includes('actionPermissions?.["numbering.workspace.create"] === true') &&
    workspace.includes("canAcquireCandidates: boolean") &&
    workspace.includes("workspace.capabilities.canCancel"),
  "the client must render server projection/capabilities through one header status/action and one pending/Now What section"
);
record(
  "ui",
  "NSF-UI-005-candidate-safety",
    workspace.includes("編號仍在申請流程，發布前不能使用") &&
    candidateRevisionEditor.includes('busyKey === `create:${drawing.id}` ? "建立中..." : "建立首版"') &&
    !workspace.includes("準備首版圖面") &&
    !candidateRevisionEditor.includes("準備首版圖面") &&
    !workspace.includes("完成首版圖面") &&
    !candidateRevisionEditor.includes("完成首版圖面") &&
    workspace.includes('workspace.projection.numberQualification === "candidate"') &&
    workspace.includes("<DrawingWorkspaceDrawer") &&
    drawingWorkspaceDrawer.includes('detailFamily = "drawing_number"') &&
    drawingWorkspaceDrawer.includes("drawingDetailSkeleton") &&
    workspace.includes("<NumberingCandidateRevisionEditor") &&
    !workspace.includes('href="#candidate-revision-files"') &&
    workspace.includes("尚未建立版次") &&
    !workspace.includes("先在上方加入") &&
    candidateRevisionEditor.includes("尚未建立首版") &&
    !workspace.includes("number-state-candidate-watermark") &&
    workspace.includes("確認取消編號申請") &&
    workspace.includes("確認發布") &&
    workspace.includes("發布"),
  "candidate availability must be a concise overview hint while destructive or publishing actions retain explicit confirmation"
);
record(
  "ui",
  "NSF-UI-006-error-recovery",
  ["401", "403", "404", "409", "503"].every((status) => workspace.includes(`response.status === ${status}`)) &&
    workspace.includes("returnTo") &&
    workspace.includes("workspace_version_conflict") &&
    workspace.includes("表單內容已保留") &&
    workspace.includes("recoveryHref"),
  "auth, scope, stale-write, outage, retry, and blocked-recovery states must be explicit"
);
record(
  "ui",
  "NSF-UI-007-responsive-accessible",
  ["@media (max-width: 1024px)", "@media (max-width: 768px)", "@media (max-width: 520px)"].every((query) => css.includes(query)) &&
    css.includes(".number-state-workspace-drawer") &&
    css.includes(".pdm-identity-table td::before") &&
    css.includes("content: attr(data-label)") &&
    css.includes("grid-template-columns: minmax(90px, 0.38fr) minmax(0, 1fr)") &&
    workspace.includes('className="pdm-identity-table number-state-table"') &&
    workspace.includes('data-label={moduleConfig.reservedCodeLabel}') &&
    workspace.includes('data-label="申請名稱"') &&
    workspace.includes('data-label="內容"') &&
    (/data-label=\{lifecycleV2Enabled\s*&&\s*module\s*===\s*"drawings"\s*\?\s*"首版準備 \/ 整包狀態"\s*:\s*"申請狀態"\}/u.test(workspace) || /data-label=\{lifecycleV2Enabled\s*&&\s*module\s*===\s*"drawings"\s*\?\s*"目前階段"\s*:\s*"申請狀態"\}/u.test(workspace)) &&
    (/<th>\{lifecycleV2Enabled\s*&&\s*module\s*===\s*"drawings"\s*\?\s*"首版準備 \/ 整包狀態"\s*:\s*"申請狀態"\}<\/th>/u.test(workspace) || /<th>\{lifecycleV2Enabled\s*&&\s*module\s*===\s*"drawings"\s*\?\s*"目前階段"\s*:\s*"申請狀態"\}<\/th>/u.test(workspace)) &&
    !workspace.includes("number-state-next-label") &&
    !workspace.includes('<div className="pdm-identity-meta">{draftModeLabel(workspace.draftMode)}</div>') &&
    !workspace.includes('data-label="操作"') &&
    workspace.includes("DrawingWorkspaceDrawer") &&
    drawingWorkspaceDrawer.includes("DrawingDetailContent") &&
    workspace.includes('className="number-state-workspace-drawer"') &&
    workspace.includes("const entityLabel = presentation?.entityLabel ?? \"圖號\";") &&
    workspace.includes('entityTitle = presentation?.title ?? drawingCode ?? "尚未產生圖號"') &&
    ["drawing-overview", "drawing-pending", "drawing-more"].every((key) => drawingDetailContent.includes(`dataSection="${key}"`) || drawingDetailContent.includes(`data-drawing-detail-section="${key}"`)) &&
    ["drawing-revision-files"].every((key) => workspace.includes(`data-drawing-detail-section="${key}"`)) &&
    drawingDetailPreview.includes('data-drawing-detail-section={dataSection}') &&
    !workspace.slice(workspace.indexOf("export function WorkspaceDrawer"), workspace.indexOf("function WorkspaceHeaderStatus")).includes("aria-modal=\"true\"") &&
    workspace.includes("useOverlayLifecycle") &&
    workspace.includes("aria-modal=\"true\"") &&
    workspace.includes("event.key !== \"Tab\"") &&
    workspace.includes("event.key === \"Escape\""),
  "responsive layouts, bounded overflow, focus trap, focus restore, and Escape handling are required"
);
record(
  "ui",
  "NSF-UI-008-resizable-detail-drawer",
  workspace.includes("useRememberedDrawerWidth") &&
    workspace.includes("DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY") &&
    workspace.includes("defaultWidth: DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH") &&
    workspace.includes("resizeLabel={`調整${entityLabel}明細寬度`}") &&
    entityDetailDrawer.includes("resizeLabel={resizeLabel}") &&
    detailDrawer.includes('className="pdm-detail-drawer-resize-handle"') &&
    detailDrawer.includes("onStartResize(event.clientX)") &&
    detailDrawer.includes('"--pdm-detail-drawer-width"') &&
    css.includes("width: min(var(--pdm-detail-drawer-width, 620px), 94vw);") &&
    css.includes(".pdm-detail-drawer-resize-handle") &&
    css.includes("body.pdm-drawer-resizing"),
  "the shared reserved-number detail drawer must support drag resizing, viewport clamping, and remembered width across owner surfaces"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: requestedSuite, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
