#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  const result = { name, passed, detail };
  results.push(result);
  if (!passed) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return fullPath;
  });
}

function sourceFiles() {
  return ["src/app", "src/components"].flatMap((directory) =>
    walk(path.join(root, directory)).filter((file) => file.endsWith(".tsx"))
  );
}

const statusDisplay = read("src/lib/status-display.ts");
const statusHelp = read("src/components/status-help-popover.tsx");

for (const label of ["未發布", "編輯中", "申請中", "待補資料", "審核中", "已發布", "發行未完成", "主圖失效", "未分類狀態"]) {
  record(`Central status dictionary includes ${label}`, statusDisplay.includes(`label: "${label}"`));
}
record("Central status dictionary does not require legacy 待審核 label", !statusDisplay.includes('label: "待審核"'));
record("Master record Draft is displayed as 未發布", statusDisplay.includes('keys: ["Draft", "draft"], label: "未發布"'));
record("Number request Draft is displayed as 編輯中", statusDisplay.includes('applicationStatusStatuses') && statusDisplay.includes('keys: ["Draft", "draft", "editing", "editable"], label: "編輯中"'));

for (const context of [
  "applicationStatus",
  "approvalStatus",
  "publicationStatus",
  "readinessStatus",
  "fileStatus",
  "accountStatus",
  "identityStatus",
  "invitationStatus",
  "reminderStatus",
  "task",
  "importRow",
  "importBatch",
  "settingsLifecycle",
  "jobStatus",
  "restorePolicy"
]) {
  record(`Central status dictionary includes ${context} context`, statusDisplay.includes(`${context}: ${context === "jobStatus" ? "jobStatuses" : `${context}Statuses`}`));
}

record("Task status context does not alias workflow statuses", !statusDisplay.includes("task: workflowStatuses"));

for (const label of ["待處理", "待檢查", "暫存中", "啟用中", "等待中", "可還原"]) {
  record(`Context-specific status dictionary includes ${label}`, statusDisplay.includes(`label: "${label}"`));
}

for (const internalCode of ["duplicate_active_submission", "UNIQUE constraint failed", "drawing_number_not_found", "Internal Server Error"]) {
  record(`User-facing error mapper covers ${internalCode}`, statusDisplay.includes(internalCode));
}

for (const behavior of [
  'aria-label={buttonLabel}',
  'event.key === "Escape"',
  'document.addEventListener("pointerdown"',
  "buttonRef.current?.focus()",
  "event.stopPropagation()"
]) {
  record(`Status help popover implements ${behavior}`, statusHelp.includes(behavior));
}

const requiredHeaderFiles = [
  "src/components/dashboard/layout-parts.tsx",
  "src/components/dashboard.tsx",
  "src/app/numbering/drawings/page.tsx",
  "src/app/parts/page.tsx",
  "src/app/numbering/tasks/page.tsx",
  "src/app/numbering/impact/page.tsx",
  "src/app/numbering/reports/page.tsx",
  "src/app/bom/workbench/page.tsx",
  "src/app/settings/page.tsx"
];

for (const relativePath of requiredHeaderFiles) {
  record(`${relativePath} uses unified status column help`, read(relativePath).includes("StatusColumnHeader"));
}

const taskCenter = read("src/app/numbering/tasks/page.tsx");
record("Task center uses task-specific status help", taskCenter.includes('StatusColumnHeader context="task"'));
record("Task center notification read/handled column is not generic workflow help", !taskCenter.includes('StatusColumnHeader context="notification"'));

const reportsPage = read("src/app/numbering/reports/page.tsx");
record("Report jobs use jobStatus context", reportsPage.includes('context="jobStatus"'));
record("Report page does not use fileSync for job status help", !reportsPage.includes('context="fileSync"'));

const settingsPage = read("src/app/settings/page.tsx");
record("Settings lifecycle uses settingsLifecycle context", settingsPage.includes('context="settingsLifecycle"'));
record("Settings page does not use workflow status help for settings lifecycle", !settingsPage.includes('context="workflow"'));

for (const relativePath of ["src/app/bom/workbench/page.tsx"]) {
  const source = read(relativePath);
  record(`${relativePath} uses restorePolicy for restore status`, source.includes('context="restorePolicy"'));
}

const legacyApprovalsPage = read("src/app/numbering/approvals/page.tsx");
const approvalWorkbenchPage = read("src/app/approvals/page.tsx");
record(
  "Legacy approval route redirects to approval workbench",
  legacyApprovalsPage.includes("redirect(buildLegacyApprovalWorkbenchRedirect") && legacyApprovalsPage.includes('"numbering_approvals"')
);
record(
  "Approval workbench status wording uses 待補資料 instead of 待補件",
  !approvalWorkbenchPage.includes("待補件") && approvalWorkbenchPage.includes("待補資料")
);

for (const relativePath of ["src/app/numbering/drawings/page.tsx", "src/app/parts/page.tsx"]) {
  const source = read(relativePath);
  record(`${relativePath} mixed status column is explicitly labeled`, source.includes('label="資料狀態 / 提醒"'));
  record(`${relativePath} no longer labels mixed status column as 其他`, !source.includes('label="其他"'));
}

for (const relativePath of ["src/app/numbering/drawings/page.tsx", "src/app/parts/page.tsx"]) {
  record(`${relativePath} filters expose PDM data status`, read(relativePath).includes('label="資料狀態"'));
}

const searchPage = read("src/app/numbering/search/page.tsx");
record("Search page labels status filter as 資料狀態", searchPage.includes("<span>資料狀態</span>") && searchPage.includes("全部資料狀態"));

const accountPage = read("src/app/settings/accounts/page.tsx");
const invitationPage = read("src/app/settings/account-invitations/page.tsx");
record("Production account page retains explicit account status vocabulary", accountPage.includes("帳號狀態"));
record("Production invitation page retains an explicit status column", invitationPage.includes("<th>狀態</th>"));

for (const relativePath of ["src/app/numbering/drawings/page.tsx", "src/app/numbering/search/page.tsx", "src/app/parts/page.tsx"]) {
  const source = read(relativePath);
  record(`${relativePath} renders status filter options through dictionary`, source.includes("formatStatusForUser"));
}

for (const relativePath of [
  "src/app/numbering/drawings/page.tsx",
  "src/app/numbering/search/page.tsx",
  "src/app/parts/page.tsx",
  "src/app/upload/page.tsx"
]) {
  const source = read(relativePath);
  record(`${relativePath} renders record status through the central dictionary`, source.includes("formatStatusForUser"));
}

const lifecycleUx = read("src/components/lifecycle-ux.tsx");
record(
  "Lifecycle UI keeps the two quality-system stages explicit",
  lifecycleUx.includes('qualityStage: "研發階段"') && lifecycleUx.includes('qualityStage: "技術移轉"')
);
record(
  "Change control remains an independent lifecycle dimension",
  lifecycleUx.includes('controlDimension: "變更管制"') && lifecycleUx.includes("stage.controlDimension ?? stage.qualityStage")
);

const productionStatusHeaderExceptions = new Set([
  "src/app/settings/account-invitations/page.tsx",
  "src/app/settings/accounts/page.tsx"
]);
const rawStatusHeaderLeaks = sourceFiles().filter((file) => {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  return !productionStatusHeaderExceptions.has(relativePath) && read(relativePath).includes("<th>狀態</th>");
});
record("No plain status table header remains without help button", rawStatusHeaderLeaks.length === 0, rawStatusHeaderLeaks.map((file) => path.relative(root, file)).join(", "));

const prohibitedVisiblePhrases = [
  "Release gate",
  "Released entries",
  "Missing evidence",
  "Not loaded",
  "BOM Draft",
  "CAD Draft",
  "Pending items",
  "Released BOM",
  "Storage Evidence",
  ">Release<",
  ">Draft<",
  ">Pending<",
  ">Released<",
  ">blocker<",
  ">warning<",
  ">clear<"
];

const leaks = [];
for (const file of sourceFiles()) {
  const relativePath = path.relative(root, file);
  const source = read(relativePath);
  for (const phrase of prohibitedVisiblePhrases) {
    if (source.includes(phrase)) leaks.push(`${relativePath}: ${phrase}`);
  }
}
record("No known high-risk raw status phrases remain in UI source", leaks.length === 0, leaks.join("; "));

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
