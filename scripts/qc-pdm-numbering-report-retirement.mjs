#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

record("standalone numbering report page is absent", !exists("src/app/numbering/reports/page.tsx"));
record("report center UI QC script is retired", !exists("scripts/qc-pdm-numbering-report-center-ui.mjs"));

const sidebar = read("src/components/sidebar-nav.tsx");
const dashboard = read("src/components/dashboard.tsx");
const handoff = read("src/app/handoff/page.tsx");
const permissionCodes = read("src/lib/numbering-permission-codes.ts");
const statusScopes = read("src/lib/status-scope-display.ts");
const packageJson = JSON.parse(read("package.json"));

record("sidebar has no standalone report entry", !sidebar.includes("/numbering/reports") && !sidebar.includes("圖號報表"));
record("dashboard has no dead report link", !dashboard.includes("/numbering/reports") && !dashboard.includes("圖號報表") && !dashboard.includes("報表輸出"));
record("handoff has no dead report action", !handoff.includes("/numbering/reports") && !handoff.includes("看報表"));
record("navigation permission map has no retired page path", !permissionCodes.includes('"/numbering/reports"'));
record("retired page has no status-scope registry entry", !statusScopes.includes("reportCenter") && !statusScopes.includes("/numbering/reports"));
record(
  "report API permission family remains available",
  permissionCodes.includes('"numbering.reports"') && permissionCodes.includes('"numbering.export.create"') && permissionCodes.includes('"numbering.audit_report.generate"')
);

for (const relativePath of [
  "src/app/api/numbering/export-jobs/route.ts",
  "src/app/api/numbering/export-jobs/[jobId]/route.ts",
  "src/app/api/numbering/monthly-audit-reports/route.ts",
  "src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts"
]) {
  const source = read(relativePath);
  record(`${relativePath} remains guarded for report API access`, source.includes('"numbering.reports"'));
}

record(
  "package exposes report retirement gate and no obsolete UI gate",
  packageJson.scripts?.["qc:pdm-numbering-report-retirement"] === "node scripts/qc-pdm-numbering-report-retirement.mjs" &&
    packageJson.scripts?.["qc:pdm-numbering-report-center-ui"] === undefined
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
