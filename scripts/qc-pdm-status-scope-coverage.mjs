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
  record("Inventory preserves broad route coverage after project-phase route removal", Number(inventory.summary?.routeCount ?? 0) >= 19, `routeCount=${inventory.summary?.routeCount}`);
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
  "編號處理",
  "資料狀態",
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
  numberStateWorkspace: "src/components/number-state-workspace.tsx",
  approvalInbox: "src/app/approvals/page.tsx",
  uploadSubmission: "src/app/upload/page.tsx",
  submissionDetail: "src/app/submissions/[id]/page.tsx",
  bomWorkbench: "src/app/bom/workbench/page.tsx",
  handoffWorkbench: "src/app/handoff/page.tsx",
  transferPackageWorkbench: "src/components/transfer-package-workbench.tsx",
  reportCenter: "src/app/numbering/reports/page.tsx",
  taskCenter: "src/app/numbering/tasks/page.tsx",
  impactWorkbench: "src/app/numbering/impact/page.tsx",
  settingsCenter: "src/app/settings/page.tsx",
  accountList: "src/app/settings/accounts/page.tsx",
  invitationList: "src/app/settings/account-invitations/page.tsx",
  revisionSubmission: "src/app/numbering/revisions/page.tsx"
};

const productionAccountScopeExceptions = new Set(["accountList", "invitationList"]);
const centralizedModuleTabScopes = new Set(["partsList", "drawingList", "numberingSearch", "numberStateWorkspace"]);
const numberStateModuleTabs = read("src/components/number-state-workspace.tsx");

for (const [scope, file] of Object.entries(requiredScopes)) {
  record(`Registry includes ${scope}`, scopeRegistry.includes(`${scope}: {`) || scopeRegistry.includes(`${scope}`));
  if (productionAccountScopeExceptions.has(scope)) {
    const source = read(file);
    record(
      `${file} preserves production status vocabulary for ${scope}`,
      scope === "accountList" ? source.includes("帳號狀態") : source.includes("<th>狀態</th>")
    );
  } else {
    const rendersDirectly = read(file).includes(`StatusScopeHelp scope="${scope}"`);
    const rendersInModuleTabs = centralizedModuleTabScopes.has(scope) && (
      scope === "numberStateWorkspace"
        ? numberStateModuleTabs.includes('active === "reserved" ? "numberStateWorkspace" : config.officialHelpScope')
        : numberStateModuleTabs.includes(`officialHelpScope: "${scope}"`)
    );
    record(`${file} renders StatusScopeHelp for ${scope}`, rendersDirectly || rendersInModuleTabs);
  }
}

record(
  "Number-state module tabs expose exactly one context-aware help trigger",
  numberStateModuleTabs.includes('className="number-state-tab-help"') &&
    numberStateModuleTabs.includes('buttonLabel={`查看${activeLabel}分頁說明`}') &&
    !numberStateModuleTabs.includes('<StatusHelpPopover context="numberEffectiveness"')
);

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

const productionStatusHeaderFiles = new Set([
  "src/app/settings/account-invitations/page.tsx",
  "src/app/settings/accounts/page.tsx"
]);
const rawStatusHeaders = tsxFiles().filter((file) => {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  return !productionStatusHeaderFiles.has(relativePath) && read(relativePath).includes("<th>狀態</th>");
});
record("No plain status table header remains", rawStatusHeaders.length === 0, rawStatusHeaders.map((file) => path.relative(root, file)).join(", "));

const partsPage = read("src/components/part-detail-content.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
record("Parts mixed column names PDM axes", partsPage.includes('label="資料狀態 / 提醒"') && partsPage.includes('data-label="資料狀態 / 提醒"'));
record("Drawings mixed column names PDM axes", drawingsPage.includes('label="資料狀態 / 提醒"') && drawingsPage.includes('data-label="資料狀態 / 提醒"'));
record("Search filter exposes the data-status axis", searchPage.includes("<span>資料狀態</span>") && searchPage.includes("全部資料狀態"));

const lifecycleUx = read("src/components/lifecycle-ux.tsx");
record(
  "Lifecycle scope exposes exactly the controlled quality-system and change-control dimensions",
  lifecycleUx.includes('qualityStage: "研發階段" | "技術移轉"') &&
    lifecycleUx.includes('controlDimension: "變更管制"') &&
    lifecycleUx.includes("stage.controlDimension ?? stage.qualityStage")
);

const numberState = read("src/components/number-state-workspace.tsx");
record("Number state tabs use 編號申請 instead of retired number-effectiveness label", numberState.includes("料號總表") && numberState.includes("編號申請") && !numberState.includes("保留號"));
record("Number state lifecycle uses application vocabulary", numberState.includes('draft: "編輯中"') && numberState.includes('published: "已發布"'));

const settingsPage = read("src/app/settings/page.tsx");
record(
  "Production capability gate protects unavailable secret-management API",
  settingsPage.includes("const secretManagementAvailable = settings.secretManagementAvailable === true") &&
    settingsPage.includes("if (!secretManagementAvailable) return;")
);
record(
  "Unavailable secret management stays visible but disabled",
  settingsPage.includes('status={secretManagementAvailable ? settingSolidWorksStatusLabel(solidWorksStatus) : "未開放"}') &&
    settingsPage.includes("disabled={!available}") &&
    settingsPage.includes("disabled={busy || !available || !secretValue.trim()}") &&
    settingsPage.includes("title={unavailableTitle}")
);

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
}, null, 2));
