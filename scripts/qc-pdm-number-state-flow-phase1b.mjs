#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  NUMBER_STATE_FLOW_V1_FLAG,
  isNumberStateFlowV1Enabled,
  numberStateFlowV1ClientStatus
} from "../src/lib/number-state-flow-feature.ts";
import {
  isProductionSliceAllowedApiMutation,
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

const draftMutationPaths = [
  ["POST", "/api/numbering/draft-workspaces"],
  ["PATCH", "/api/numbering/draft-workspaces/workspace-1"],
  ["POST", "/api/numbering/draft-workspaces/workspace-1/candidate-numbers"],
  ["POST", "/api/numbering/draft-workspaces/workspace-1/cancel"]
];
record(
  "routes",
  "NSF-UI-SLICE-api-gate",
  draftMutationPaths.every(([method, pathname]) => isProductionSliceAllowedApiMutation(method, pathname, productionEnabledEnv)) &&
    draftMutationPaths.every(([method, pathname]) => !isProductionSliceAllowedApiMutation(method, pathname, productionDisabledEnv)),
  "new workspace mutations must require both the production slice and Phase 1B flag"
);
record(
  "routes",
  "NSF-UI-SLICE-page-gate",
  ["/upload", "/handoff"].every((pathname) => isProductionSliceOpenPagePath(pathname, productionEnabledEnv)) &&
    ["/upload", "/handoff"].every((pathname) => isProductionSliceOpenPagePath(pathname, productionDisabledEnv)) &&
    ["/upload", "/handoff"].every((pathname) => !shouldBlockProductionSlicePagePath(pathname, productionDisabledEnv)),
  "retired compatibility routes must remain guidance/redirect surfaces even when the rollback kill switch is off"
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
const partsPage = read("src/app/parts/page.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
const css = read("src/app/globals.css");

record(
  "ui",
  "NSF-UI-001-owner-entrypoints",
  partsPage.includes("NumberStateOwnerCreateAction") &&
    drawingsPage.includes("NumberStateOwnerCreateAction") &&
    searchPage.includes("NumberStateOwnerCreateAction") &&
    workspace.includes("建立保留號"),
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
    workspace.includes("保留號") &&
    workspace.includes("PAGE_SIZE = 20") &&
    workspace.includes("numberEffectiveness") &&
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
    workspace.includes("建立並保留號碼") &&
    workspace.includes("關閉視窗不會寫入資料") &&
    workspace.includes("Idempotency-Key"),
  "all four create modes must create the application and reserve numbers in one idempotent action"
);
record(
  "ui",
  "NSF-UI-004-server-projection",
  workspace.includes("NumberStateProjection") &&
    workspace.includes("ProjectionBadges") &&
    workspace.includes("NowWhatPanel") &&
    workspace.includes("useNumberStateActionPermissions") &&
    workspace.includes('actionPermissions?.["numbering.workspace.create"] === true') &&
    workspace.includes("canAcquireCandidates: boolean") &&
    workspace.includes("workspace.capabilities.canCancel"),
  "the client must render server projection/capabilities and one Now What panel"
);
record(
  "ui",
  "NSF-UI-005-candidate-safety",
  workspace.includes("已保留，尚不可正式使用") &&
    workspace.includes('workspace.projection.numberQualification === "candidate"') &&
    workspace.includes("確認取消保留號") &&
    workspace.includes("確認正式發布") &&
    workspace.includes("正式發布"),
  "reserved-number watermark must be state-scoped and destructive or publishing actions require explicit confirmation"
);
record(
  "ui",
  "NSF-UI-006-error-recovery",
  ["401", "403", "404", "409", "503"].every((status) => workspace.includes(`response.status === ${status}`)) &&
    workspace.includes("returnTo") &&
    workspace.includes("workspace_version_conflict") &&
    workspace.includes("表單已保留") &&
    workspace.includes("recoveryHref"),
  "auth, scope, stale-write, outage, retry, and blocked-recovery states must be explicit"
);
record(
  "ui",
  "NSF-UI-007-responsive-accessible",
  ["@media (max-width: 1024px)", "@media (max-width: 768px)", "@media (max-width: 520px)"].every((query) => css.includes(query)) &&
    css.includes(".number-state-drawer") &&
    css.includes(".pdm-identity-table td::before") &&
    css.includes("content: attr(data-label)") &&
    css.includes("grid-template-columns: minmax(90px, 0.38fr) minmax(0, 1fr)") &&
    workspace.includes('className="pdm-identity-table number-state-table"') &&
    workspace.includes('data-label={moduleConfig.reservedCodeLabel}') &&
    workspace.includes('data-label="申請名稱"') &&
    workspace.includes('data-label="內容"') &&
    workspace.includes('data-label="申請狀態 / 號碼效力"') &&
    workspace.includes("<th>申請狀態 / 號碼效力</th>") &&
    !workspace.includes("number-state-next-label") &&
    !workspace.includes('<div className="pdm-identity-meta">{draftModeLabel(workspace.draftMode)}</div>') &&
    !workspace.includes('data-label="操作"') &&
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
    workspace.includes('NUMBER_STATE_DRAWER_WIDTH_STORAGE_KEY = "pdm-number-state-detail-drawer-width"') &&
    workspace.includes("defaultWidth: NUMBER_STATE_DRAWER_DEFAULT_WIDTH") &&
    workspace.includes('className="pdm-detail-drawer-resize-handle"') &&
    workspace.includes('aria-label="調整保留號明細寬度"') &&
    workspace.includes("onStartResize(event.clientX)") &&
    workspace.includes('"--pdm-detail-drawer-width"') &&
    css.includes("width: min(var(--pdm-detail-drawer-width, 620px), 94vw);") &&
    css.includes(".pdm-detail-drawer-resize-handle") &&
    css.includes("body.pdm-drawer-resizing"),
  "the shared reserved-number detail drawer must support drag resizing, viewport clamping, and remembered width across owner surfaces"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: requestedSuite, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
