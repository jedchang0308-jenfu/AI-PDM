#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const readRequired = (relativePath) => readProjectFile(root, relativePath);
const existsRequired = (relativePath) => projectFileExists(root, relativePath);

const controlledHistoryRoutePath = "src/app/api/lifecycle/controlled-history/route.ts";
const controlledHistoryRoute = readRequired(controlledHistoryRoutePath);
const bomWorkbenchAsync = readRequired("src/lib/bom-workbench-async.ts");
const bomWorkbenchRepository = readRequired("src/lib/repositories/bom-workbench-async-repository.ts");
const submissionsRoute = readRequired("src/app/api/submissions/route.ts");
const searchRoute = readRequired("src/app/api/search/route.ts");
const submissionListRepository = readRequired("src/lib/repositories/submission-list-async-repository.ts");
const dashboard = readRequired("src/components/dashboard.tsx");
const submissionDetailPage = readRequired("src/app/submissions/[id]/page.tsx");
const submissionApproveRoute = readRequired("src/app/api/submissions/[id]/approve/route.ts");
const submissionCheckoutRoute = readRequired("src/app/api/submissions/[id]/checkout/route.ts");
const submissionSandboxRoute = readRequired("src/app/api/submissions/[id]/sandbox/route.ts");
const submissionStatusRepository = readRequired("src/lib/repositories/submission-status-async-repository.ts");
const submissionReleaseWorkflow = readRequired("src/lib/submission-release-workflow.ts");
const types = readRequired("src/lib/types.ts");
const globalCss = readRequired("src/app/globals.css");
const responsiveCss = readRequired("src/app/styles/responsive.css");
const controlledHistoryUiScriptPath = "scripts/qc-pdm-lifecycle-controlled-history-ui.mjs";
const controlledHistoryUiScript = readRequired(controlledHistoryUiScriptPath);
const packageJson = readProjectJson(root, "package.json");

assert(existsRequired(controlledHistoryRoutePath), "Controlled-history route exists");
assert(types.includes("export type ControlledHistoryEntry"), "Controlled-history type is exported");
assert(types.includes('"numbering_part_number"') && types.includes('"numbering_drawing_number"') && types.includes('"bom_release"'), "Controlled-history type supports cross-entity history");
assert(types.includes('traceability_class: "controlled_history"'), "Controlled-history entry is traceability-classed");
assert(types.includes("delete: false") && types.includes("restore: false") && types.includes("obsolete: false"), "Controlled-history actions are immutable in the type contract");
assert(types.includes("SubmissionReleaseActionability") && types.includes("release_actionability?"), "Submission detail exposes terminal-master release actionability");

assert(controlledHistoryRoute.includes("requireAuthAsync"), "Controlled-history route requires authentication");
assert(controlledHistoryRoute.includes("resolvePdmCompanyContextAsync"), "Controlled-history route enforces company context");
assert(controlledHistoryRoute.includes("scopedSubmittedBy"), "Controlled-history route preserves engineer read scope");
assert(controlledHistoryRoute.includes('status: "Obsolete"'), "Controlled-history route reads obsolete submissions");
assert(controlledHistoryRoute.includes("includeHistory: true"), "Controlled-history route explicitly opts into history data");
assert(controlledHistoryRoute.includes("getSubmissionAsync"), "Controlled-history route reads detail traceability");
assert(controlledHistoryRoute.includes("lifecycle_requests"), "Controlled-history route includes lifecycle request evidence");
assert(controlledHistoryRoute.includes("listNumberingApprovalBatchesAsync"), "Controlled-history route aggregates numbering obsolete approvals");
assert(controlledHistoryRoute.includes("obsolete_part_number") && controlledHistoryRoute.includes("obsolete_ma_drawing"), "Controlled-history route includes formal part/drawing obsolete approvals");
assert(controlledHistoryRoute.includes("listObsoleteBomWorkbenchHistoryAsync"), "Controlled-history route aggregates formal BOM obsolete history");
assert(controlledHistoryRoute.includes("compareControlledHistoryEntries"), "Controlled-history route sorts unified history by lifecycle time");
assert(controlledHistoryRoute.includes('stage_label: "歷史"'), "Controlled-history route maps entries to 歷史 stage");
assert(controlledHistoryRoute.includes('result_label: "已作廢"'), "Controlled-history route maps entries to 已作廢 result");
assert(controlledHistoryRoute.includes("delete: false") && controlledHistoryRoute.includes("restore: false"), "Controlled-history route disables delete and restore actions");
assert(bomWorkbenchAsync.includes("listObsoleteBomWorkbenchHistoryAsync"), "BOM async facade exposes obsolete history helper");
assert(bomWorkbenchRepository.includes("SELECT_ASYNC_BOM_WORKBENCH_OBSOLETE_HISTORY_SQL"), "BOM repository has controlled-history SQL");
assert(
  bomWorkbenchRepository.includes("COALESCE(d.company_id, s.company_id) = :companyId") ||
    bomWorkbenchRepository.includes("s.company_id = :companyId"),
  "BOM controlled-history SQL is company scoped through canonical draft ownership with legacy submission fallback"
);
assert(bomWorkbenchRepository.includes("COALESCE(rr.lifecycle_action, 'release') = 'obsolete'"), "BOM controlled-history SQL only uses obsolete lifecycle reviews");

assert(submissionListRepository.includes("includeHistory?: boolean"), "Submission list/search supports explicit history inclusion");
assert((submissionListRepository.match(/s\.status <> 'Obsolete'/g) ?? []).length >= 2, "Daily list/search repository excludes Obsolete by default");
assert(
  (submissionListRepository.match(/(?:CAST\(\s*:includeHistory\s+AS\s+integer\s*\)|:includeHistory)\s*=\s*1/gi) ?? []).length >= 2,
  "Repository SQL has at least two provider-safe includeHistory gates"
);
assert(submissionsRoute.includes('const includeHistory = status === "Obsolete"'), "Submissions route only includes history for explicit Obsolete status");
assert(searchRoute.includes('const includeHistory = status === "Obsolete"'), "Search route only includes history for explicit Obsolete status");

const statusFiltersMatch = dashboard.match(/const statusFilters:[\s\S]*?\n\];/);
assert(Boolean(statusFiltersMatch), "Dashboard status filter config is discoverable");
assert(!statusFiltersMatch?.[0].includes("Obsolete"), "Dashboard daily status tabs do not include Obsolete");
assert(dashboard.includes("ControlledHistoryPanel"), "Dashboard has controlled-history panel component");
assert(dashboard.includes('data-controlled-history-surface="true"'), "Controlled-history surface has stable QC selector");
assert(dashboard.includes("data-controlled-history-row"), "Controlled-history rows have stable QC selector");
assert(dashboard.includes("data-controlled-history-actions"), "Controlled-history immutable actions have stable QC selector");
assert(dashboard.includes("受控歷史"), "Dashboard exposes 受控歷史 entry");
assert(dashboard.includes("查看追溯"), "Controlled-history UI exposes traceability CTA");
assert(
  dashboard.includes('submission: "正式圖面"') &&
    dashboard.includes('numbering_part_number: "料號"') &&
    dashboard.includes('numbering_drawing_number: "圖號"') &&
    dashboard.includes('bom_release: "正式 BOM"'),
  "Controlled-history UI labels cross-entity history with current simple PDM nouns"
);
assert(dashboard.includes('entry.entity_type === "submission"'), "Controlled-history UI only opens submission detail when detail route exists");
assert(dashboard.includes("責任鏈已列出"), "Controlled-history UI keeps non-submission history self-contained");
assert(dashboard.includes("loadControlledHistory"), "Dashboard loads controlled-history data independently");
assert(dashboard.includes("/api/lifecycle/controlled-history?limit=50"), "Dashboard calls controlled-history API");
assert(dashboard.includes("openControlledHistoryEntry"), "Dashboard can open controlled-history detail traceability");
assert(dashboard.includes("controlledHistoryEntries.some"), "Dashboard keeps selected history detail open even outside daily list");
assert(
  dashboard.includes('submissionTerminalReadOnly') &&
    dashboard.includes('SUBMISSION_RELEASE_TERMINAL_MASTER') &&
    dashboard.includes("正式圖料已結束，這筆送審只供追溯") &&
    dashboard.includes("返回圖料歷史"),
  "Dashboard projects terminal-master submissions as traceability-only"
);
assert(
  submissionDetailPage.includes("terminalMasterReadOnly") &&
    submissionDetailPage.includes("!terminalMasterReadOnly && canManageRelease") &&
    submissionDetailPage.includes("返回圖料歷史"),
  "Full submission detail removes approval and cancellation from terminal-master history"
);
assert(
  submissionStatusRepository.includes("getSubmissionReleaseActionability") &&
    submissionStatusRepository.includes('code: "SUBMISSION_RELEASE_TERMINAL_MASTER"') &&
    submissionStatusRepository.includes("terminal_entities"),
  "Release repository resolves root, drawing and part terminal states"
);
assert(
  submissionApproveRoute.indexOf("const releaseActionability = await getSubmissionReleaseActionabilityAsync") >= 0 &&
    submissionApproveRoute.indexOf("const releaseActionability = await getSubmissionReleaseActionabilityAsync") < submissionApproveRoute.indexOf("await addApprovalAsync"),
  "Approval route blocks terminal-master submissions before writing a decision"
);
assert(
  submissionReleaseWorkflow.indexOf("const releaseActionability = await getSubmissionReleaseActionabilityAsync") >= 0 &&
    submissionReleaseWorkflow.indexOf("const releaseActionability = await getSubmissionReleaseActionabilityAsync") < submissionReleaseWorkflow.indexOf("await markSubmissionReleasingAsync"),
  "Release workflow blocks terminal-master submissions before Releasing mutation"
);
assert(
  submissionCheckoutRoute.includes("release_actionability") && submissionSandboxRoute.includes("release_actionability"),
  "Checkout and sandbox creation reject terminal-master submissions server-side"
);
const submissionStatusGuardMatch = dashboard.match(/function isSubmissionStatusOrAll[\s\S]*?\r?\n}/);
assert(
  Boolean(submissionStatusGuardMatch) && !submissionStatusGuardMatch?.[0].includes('value === "Obsolete"'),
  "Legacy saved status filters cannot force Obsolete into daily tabs"
);

assert(globalCss.includes(".controlled-history-panel"), "Controlled-history panel styles exist");
assert(globalCss.includes(".controlled-history-table"), "Controlled-history table styles exist");
assert(globalCss.includes(".sr-only"), "Screen-reader-only utility exists for immutable action evidence");
assert(responsiveCss.includes(".controlled-history-toolbar"), "Controlled-history toolbar has responsive rule");
assert(responsiveCss.includes(".controlled-history-table thead") && responsiveCss.includes("display: none"), "Controlled-history table stacks on mobile instead of forcing page overflow");
assert(packageJson.scripts?.["qc:pdm-lifecycle-controlled-history"] === "node scripts/qc-pdm-lifecycle-controlled-history.mjs", "Package script is registered");
assert(existsRequired(controlledHistoryUiScriptPath), "Controlled-history UI QC script exists");
assert(controlledHistoryUiScript.includes("pdm-lifecycle-controlled-history-desktop.png"), "Controlled-history UI QC captures desktop screenshot");
assert(controlledHistoryUiScript.includes("pdm-lifecycle-controlled-history-mobile.png"), "Controlled-history UI QC captures mobile screenshot");
assert(controlledHistoryUiScript.includes("daily status tabs do not expose obsolete"), "Controlled-history UI QC checks Obsolete is not a daily tab");
assert(controlledHistoryUiScript.includes("controlled-history has no destructive action buttons"), "Controlled-history UI QC blocks destructive history actions");
assert(packageJson.scripts?.["qc:pdm-lifecycle-controlled-history-ui"] === "node scripts/qc-pdm-lifecycle-controlled-history-ui.mjs", "Controlled-history UI package script is registered");

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: checks.length,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
      checks
    },
    null,
    2
  )
);
