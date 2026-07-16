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
const disabledEnv = {};
const productionEnabledEnv = {
  PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
  PDM_NUMBER_STATE_FLOW_V1: "true"
};
const productionDisabledEnv = {
  PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft"
};

record(
  "routes",
  "NSF-UI-FLAG-default-off",
  !isNumberStateFlowV1Enabled(disabledEnv) &&
    ["1", "true", "on", "enabled"].every((value) => isNumberStateFlowV1Enabled({ PDM_NUMBER_STATE_FLOW_V1: value })) &&
    !isNumberStateFlowV1Enabled({ PDM_NUMBER_STATE_FLOW_V1: "yes" }) &&
    numberStateFlowV1ClientStatus(disabledEnv).flag === NUMBER_STATE_FLOW_V1_FLAG,
  "PDM_NUMBER_STATE_FLOW_V1 must be server-visible and default off"
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
    ["/upload", "/handoff"].every((pathname) => shouldBlockProductionSlicePagePath(pathname, productionDisabledEnv)),
  "upload/handoff compatibility layouts must only be reachable in the slice when the Phase 1B flag is on"
);

const statusRoute = read("src/app/api/numbering/state-flow/status/route.ts");
const rootLayout = read("src/app/layout.tsx");
const sidebar = read("src/components/sidebar-nav.tsx");
record(
  "routes",
  "NSF-UI-FLAG-server-projection",
  statusRoute.includes("numberStateFlowV1ClientStatus") &&
    statusRoute.includes("private, no-store") &&
    rootLayout.includes("numberStateFlowV1Enabled={isNumberStateFlowV1Enabled()}") &&
    sidebar.includes("NUMBER_STATE_LEGACY_NAV_PATHS") &&
    ["/numbering/part-drafts", "/numbering/request", "/upload", "/handoff"].every((pathname) => sidebar.includes(`\"${pathname}\"`)),
  "server-rendered layout and no-store endpoint must project the same flag without sidebar flash"
);

const compatibilityLayouts = [
  ["src/app/numbering/part-drafts/layout.tsx", "/parts?tab=drafts", "redirect"],
  ["src/app/numbering/request/layout.tsx", "/numbering/search?create=numbering", "redirect"],
  ["src/app/upload/layout.tsx", "/numbering/search?legacyIntent=upload", "upload"],
  ["src/app/handoff/layout.tsx", "/technical-transfer?tab=published", "redirect"]
];
record(
  "routes",
  "NSF-UI-ROUTE-legacy-layouts",
  compatibilityLayouts.every(([relativePath, destination, strategy]) => {
    const source = read(relativePath);
    return source.includes("if (!isNumberStateFlowV1Enabled()) return children") &&
      source.includes(`destination=\"${destination}\"`) &&
      (strategy === "redirect" || source.includes(`strategy=\"${strategy}\"`));
  }),
  "legacy pages must not mount their old child mutation flows after the flag is enabled"
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
  new URLSearchParams("returnTo=%2Fparts%3Ftab%3Ddrafts&foo=bar"),
  true
);
const uploadRedirect = resolveNumberStateLegacyRedirect(
  "/upload",
  new URLSearchParams("drawingNumber=A0001-M01&returnTo=%2Fparts"),
  true
);
const uploadGuidance = resolveNumberStateLegacyRedirect(
  "/upload",
  new URLSearchParams("returnTo=%2Fparts"),
  true
);
record(
  "routes",
  "NSF-UI-ROUTE-runtime-redirects",
  requestRedirect?.pathname === "/numbering/search" &&
    requestRedirect.searchParams.get("returnTo") === "/parts?tab=drafts" &&
    requestRedirect.searchParams.get("foo") === "bar" &&
    requestRedirect.searchParams.get("create") === "numbering" &&
    requestRedirect.searchParams.get("legacyFrom") === "/numbering/request" &&
    uploadRedirect?.pathname === "/drawings/A0001-M01/submission-workbench" &&
    uploadRedirect.searchParams.get("returnTo") === "/parts" &&
    uploadGuidance === null &&
    resolveNumberStateLegacyRedirect("/numbering/request", new URLSearchParams(), false) === null,
  "middleware mapping must preserve request intent, redirect contextual upload, leave context-free upload on guidance, and default off"
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
    workspace.includes("建立圖料號"),
  "parts, drawings, and search owner surfaces must expose the shared create action"
);
record(
  "ui",
  "NSF-UI-002-draft-list-separation",
  partsPage.includes("NumberStateWorkspaceWorkbench") &&
    workspace.includes("/parts?tab=drafts") &&
    workspace.includes("正式料號") &&
    workspace.includes("草稿") &&
    workspace.includes("PAGE_SIZE = 20") &&
    workspace.includes("qualification") &&
    workspace.includes("ownerScope"),
  "drafts require a distinct tab with owner/lifecycle/qualification/search filters and stable pagination"
);
record(
  "ui",
  "NSF-UI-003-two-stage-four-modes",
  ["new_bundle", "append_drawing", "append_part", "append_drawing_part"].every((mode) => workspace.includes(`value: \"${mode}\"`)) &&
    workspace.includes("儲存草稿") &&
    workspace.includes("取得候選號") &&
    workspace.includes("關閉視窗不會寫入資料") &&
    workspace.includes("Idempotency-Key"),
  "all four create modes must save first and acquire candidates only through a separately confirmed action"
);
record(
  "ui",
  "NSF-UI-004-server-projection",
  workspace.includes("NumberStateProjection") &&
    workspace.includes("ProjectionBadges") &&
    workspace.includes("NowWhatPanel") &&
    workspace.includes("useNumberStateActionPermissions") &&
    workspace.includes('actionPermissions?.["numbering.workspace.create"] === true') &&
    workspace.includes("workspace.capabilities.canAcquireCandidates") &&
    workspace.includes("workspace.capabilities.canCancel"),
  "the client must render server projection/capabilities and one Now What panel"
);
record(
  "ui",
  "NSF-UI-005-candidate-safety",
  workspace.includes("候選號，不得正式使用") &&
    workspace.includes('workspace.projection.numberQualification === "candidate"') &&
    workspace.includes("確認取得候選號") &&
    workspace.includes("確認取消草稿") &&
    workspace.includes("確認正式發布") &&
    workspace.includes("正式發布"),
  "candidate watermark must be state-scoped and number-changing actions require explicit confirmation"
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
    css.includes(".number-state-table td::before") &&
    css.includes("content: attr(data-label)") &&
    css.includes(".number-state-mobile-action-label") &&
    css.includes("grid-template-columns: minmax(72px, 0.34fr) minmax(0, 1fr)") &&
    workspace.includes('data-label="候選號"') &&
    workspace.includes('data-label="下一步"') &&
    workspace.includes('data-label="操作"') &&
    workspace.includes("useOverlayLifecycle") &&
    workspace.includes("aria-modal=\"true\"") &&
    workspace.includes("event.key !== \"Tab\"") &&
    workspace.includes("event.key === \"Escape\""),
  "responsive layouts, bounded overflow, focus trap, focus restore, and Escape handling are required"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: requestedSuite, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
