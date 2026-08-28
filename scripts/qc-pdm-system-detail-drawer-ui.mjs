#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

const checks = [];
const root = process.cwd();

function record(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(path, needles) {
  const text = readProjectFile(root, path);
  for (const needle of needles) {
    record(`${path} includes ${needle}`, text.includes(needle), needle);
  }
  return text;
}

record("Drawer spec exists", projectFileExists(root, ".ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md"));
record("Shared drawer component exists", projectFileExists(root, "src/components/pdm-detail-drawer.tsx"));
record("Shared list shortcut hook exists", projectFileExists(root, "src/components/use-list-keyboard-shortcuts.ts"));

includesAll("src/components/pdm-detail-drawer.tsx", [
  "useRememberedDrawerWidth",
  "PdmDetailDrawer",
  "pdm-detail-drawer-backdrop",
  "pdm-detail-drawer-resize-handle",
  "localStorage",
  "pdm-drawer-resizing"
]);

includesAll("src/components/use-list-keyboard-shortcuts.ts", [
  "LIST_KEYBOARD_SHORTCUTS",
  "ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C",
  "isEditableShortcutTarget",
  "hasSelectedText",
  "copyTextToClipboard"
]);

includesAll("src/components/dashboard/layout-parts.tsx", [
  "PdmDetailDrawer",
  "dashboard-detail-drawer-panel",
  "data-dashboard-submission-row"
]);

includesAll("src/components/dashboard.tsx", [
  "useRememberedDrawerWidth",
  "pdm-dashboard-detail-drawer-width",
  "startDrawerResize",
  "data-dashboard-submission-row",
  ".pdm-detail-drawer"
]);

const numberingApprovalsPage = includesAll("src/app/numbering/approvals/page.tsx", [
  "redirect(buildLegacyApprovalWorkbenchRedirect",
  '"numbering_approvals"'
]);
record(
  "src/app/numbering/approvals/page.tsx is no longer an independent client inbox",
  !numberingApprovalsPage.includes('"use client"')
);
record(
  "src/app/numbering/approvals/page.tsx does not host stale drawer UI",
  !numberingApprovalsPage.includes("PdmDetailDrawer")
);

includesAll("src/lib/approval-workbench-legacy-redirect.ts", [
  "buildLegacyApprovalWorkbenchRedirect",
  "numbering_approvals",
  'domain: "numbering"',
  "legacyRedirect",
  "requestId",
  "approvalRequestId",
  "/approvals?"
]);

includesAll("src/app/approvals/page.tsx", [
  "<h1>審核工作台",
  "legacyRedirectMessages",
  "numbering_approvals",
  "approval-platform-layout",
  "approval-inbox-panel",
  "ApprovalDetailDrawer",
  "DrawingWorkspaceDrawer",
  "DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY",
  "buildInboxUrl",
  "syncFilterQuery",
  "allowedDecisionsForDetail"
]);

includesAll("src/components/number-state-workspace.tsx", [
  "useRememberedDrawerWidth",
  "DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY",
  "DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH",
  "DRAWING_DETAIL_DRAWER_MIN_WIDTH",
  "DrawingWorkspaceDrawer",
  "keepOpenSelector",
  "onStartResize={startDrawerResize}"
]);

includesAll("scripts/qc-dashboard-detail-priority-test.mjs", [
  ".pdm-detail-drawer",
  "drawer does not darken the list backdrop",
  "button[aria-label='關閉圖面明細']"
]);

includesAll("scripts/qc-pdm-approval-platform.mjs", [
  "Phase 1C-B numbering approvals route redirects to workbench",
  "legacyRedirectMessages",
  ".approval-message.info"
]);

includesAll("scripts/qc-pdm-numbering-import-center-ui.mjs", [
  "Import detail opens as non-dark drawer",
  ".pdm-detail-drawer"
]);

const globals = readProjectFile(root, "src/app/globals.css");
record("Drawer backdrop stays transparent", globals.includes("background: transparent;"));
record("Dashboard drawer panel CSS exists", globals.includes(".dashboard-detail-drawer-panel"));
record("Approval workbench layout CSS exists", globals.includes(".approval-platform-layout"));
record("Approval workbench inbox panel CSS exists", globals.includes(".approval-inbox-panel"));
record("Approval workbench shared drawer CSS exists", globals.includes(".approval-detail-drawer"));
record("Approval workbench drawer footer CSS exists", globals.includes(".approval-drawer-footer-content"));
record("Approval legacy redirect info CSS exists", globals.includes(".approval-message.info"));

const drawerSpec = readProjectFile(root, ".ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md");
record("Drawer spec references drawer task", drawerSpec.includes("DEV-PDM-DETAIL-DRAWER-001"));
record("Drawer spec documents drawer QC command", drawerSpec.includes("qc:pdm-system-detail-drawer-ui"));

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
