#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function record(name, passed, detail = "") {
  const result = { name, passed, detail };
  results.push(result);
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return fullPath;
  });
}

function tsxFiles() {
  return ["src/app", "src/components"].flatMap((directory) =>
    walk(path.join(root, directory)).filter((file) => file.endsWith(".tsx"))
  );
}

const statusDisplay = read("src/lib/status-display.ts");
const scopeRegistry = read("src/lib/status-scope-display.ts");
const scopeHelp = read("src/components/status-help-popover.tsx");
const globalCss = read("src/app/globals.css");
const inventoryPath = "output/dev-049-status-scope-inventory/status-scope-inventory.json";

record("Phase 1B inventory artifact exists", exists(inventoryPath));
if (exists(inventoryPath)) {
  const inventory = JSON.parse(read(inventoryPath));
  record("Inventory preserves broad route coverage", Number(inventory.summary?.routeCount ?? 0) >= 22, `routeCount=${inventory.summary?.routeCount}`);
  record("Inventory preserves section scan coverage", Number(inventory.summary?.sectionCount ?? 0) >= 197, `sectionCount=${inventory.summary?.sectionCount}`);
}

for (const context of [
  "applicationStatus",
  "approvalStatus",
  "publicationStatus",
  "readinessStatus",
  "fileStatus",
  "accountStatus",
  "identityStatus",
  "invitationStatus",
  "reminderStatus"
]) {
  record(`Status display includes ${context}`, statusDisplay.includes(`| "${context}"`) && statusDisplay.includes(`${context}:`));
}

for (const label of [
  "號碼效力",
  "資料狀態",
  "開發階段",
  "申請狀態",
  "審核狀態",
  "發布狀態",
  "準備狀態",
  "檔案狀態",
  "任務狀態",
  "帳號狀態",
  "邀請狀態"
]) {
  record(`Scope axis includes ${label}`, scopeRegistry.includes(`label: "${label}"`));
}

const requiredScopes = {
  dashboardSummary: "src/components/dashboard.tsx",
  partsList: "src/app/parts/page.tsx",
  drawingList: "src/app/numbering/drawings/page.tsx",
  numberingSearch: "src/app/numbering/search/page.tsx",
  numberingRequest: "src/app/numbering/request/page.tsx",
  numberingDraftList: "src/app/numbering/part-drafts/page.tsx",
  numberStateWorkspace: "src/components/number-state-workspace.tsx",
  approvalInbox: "src/app/approvals/page.tsx",
  uploadSubmission: "src/app/upload/page.tsx",
  submissionDetail: "src/app/submissions/[id]/page.tsx",
  bomWorkbench: "src/app/bom/workbench/page.tsx",
  handoffWorkbench: "src/app/handoff/page.tsx",
  transferPackageWorkbench: "src/components/transfer-package-workbench.tsx",
  importCenter: "src/app/numbering/imports/page.tsx",
  reportCenter: "src/app/numbering/reports/page.tsx",
  taskCenter: "src/app/numbering/tasks/page.tsx",
  dvtWorkbench: "src/app/numbering/dvt/page.tsx",
  impactWorkbench: "src/app/numbering/impact/page.tsx",
  settingsCenter: "src/app/settings/page.tsx",
  accountList: "src/app/settings/accounts/page.tsx",
  invitationList: "src/app/settings/account-invitations/page.tsx",
  revisionSubmission: "src/app/numbering/revisions/page.tsx"
};

for (const [scope, file] of Object.entries(requiredScopes)) {
  record(`Registry includes ${scope}`, scopeRegistry.includes(`${scope}: {`) || scopeRegistry.includes(`${scope}`));
  record(`${file} renders StatusScopeHelp for ${scope}`, read(file).includes(`StatusScopeHelp scope="${scope}"`));
}

record("Scope registry never maps user-facing scopes to generic", !scopeRegistry.includes('"generic"'));
record("Scope registry preserves inventory evidence owner", scopeRegistry.includes(inventoryPath));

for (const behavior of [
  "export function StatusScopeHelp",
  'role="dialog"',
  "aria-expanded={open}",
  'event.key === "Escape"',
  'document.addEventListener("pointerdown"',
  "buttonRef.current?.focus()",
  "data-status-scope-help"
]) {
  record(`StatusScopeHelp implements ${behavior}`, scopeHelp.includes(behavior));
}

for (const cssToken of [
  ".status-scope-help-button",
  ".status-scope-help-popover",
  "max-width: calc(100vw - 1.5rem)",
  "@media (max-width: 640px)"
]) {
  record(`StatusScopeHelp CSS includes ${cssToken}`, globalCss.includes(cssToken));
}

const rawStatusHeaders = tsxFiles().filter((file) => read(path.relative(root, file)).includes("<th>狀態</th>"));
record("No plain status table header remains", rawStatusHeaders.length === 0, rawStatusHeaders.map((file) => path.relative(root, file)).join(", "));

const partsPage = read("src/app/parts/page.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
record("Parts mixed column names all axes", partsPage.includes('label="資料狀態 / 開發階段 / 提醒"') && partsPage.includes('data-label="資料狀態 / 開發階段 / 提醒"'));
record("Drawings mixed column names all axes", drawingsPage.includes('label="資料狀態 / 開發階段 / 提醒"') && drawingsPage.includes('data-label="資料狀態 / 開發階段 / 提醒"'));
record("Search filter separates status and phase axes", searchPage.includes("<span>資料狀態</span>") && searchPage.includes("<span>開發階段</span>"));

const numberState = read("src/components/number-state-workspace.tsx");
record("Number state tabs no longer use first-level 草稿 label", numberState.includes("料號總表") && numberState.includes("領號申請"));
record("Number state lifecycle uses application vocabulary", numberState.includes('draft: "編輯中"') && numberState.includes('published: "已轉正式資料"'));

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
}, null, 2));
