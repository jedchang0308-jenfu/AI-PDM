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

includesAll("src/app/numbering/approvals/page.tsx", [
  "PdmDetailDrawer",
  "useRememberedDrawerWidth",
  "useListKeyboardShortcuts",
  "pdm-approval-detail-drawer-width",
  "data-approval-batch-row",
  "pdm-detail-drawer"
]);

includesAll("src/app/numbering/imports/page.tsx", [
  "PdmDetailDrawer",
  "useRememberedDrawerWidth",
  "useListKeyboardShortcuts",
  "pdm-import-detail-drawer-width",
  "data-import-batch-row",
  "pdm-detail-drawer"
]);

includesAll("src/app/numbering/reports/page.tsx", [
  "PdmDetailDrawer",
  "useRememberedDrawerWidth",
  "useListKeyboardShortcuts",
  "pdm-report-detail-drawer-width",
  "data-monthly-report-row",
  "pdm-detail-drawer"
]);

includesAll("scripts/qc-dashboard-detail-priority-test.mjs", [
  ".pdm-detail-drawer",
  "drawer does not darken the list backdrop",
  "button[aria-label='關閉圖面明細']"
]);

includesAll("scripts/qc-pdm-numbering-approval-review-ui.mjs", [
  "data-approval-batch-row",
  "Approval detail opens as non-dark drawer"
]);

includesAll("scripts/qc-pdm-numbering-import-center-ui.mjs", [
  "Import detail opens as non-dark drawer",
  ".pdm-detail-drawer"
]);

includesAll("scripts/qc-pdm-numbering-report-center-ui.mjs", [
  "Monthly report detail opens as non-dark drawer",
  ".pdm-detail-drawer"
]);

const globals = readProjectFile(root, "src/app/globals.css");
record("Drawer backdrop stays transparent", globals.includes("background: transparent;"));
record("Dashboard drawer panel CSS exists", globals.includes(".dashboard-detail-drawer-panel"));

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
