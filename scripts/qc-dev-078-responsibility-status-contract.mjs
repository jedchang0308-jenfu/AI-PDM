#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (id, condition, detail = "") => {
  assert.ok(condition, `${id}${detail ? `: ${detail}` : ""}`);
  return { id, passed: true };
};

const results = [];
const sourceFiles = [
  "src/lib/work-status-presentation.ts",
  "src/lib/responsibility-status-projection.ts",
  "src/lib/repositories/numbering-repository.ts",
  "src/lib/repositories/numbering-async-repository.ts",
  "src/lib/pdm-workbench-contract.ts",
  "src/lib/pdm-entity-detail-contract.ts",
  "src/lib/drawing-workbench.ts",
  "src/lib/part-workbench.ts",
  "src/lib/relation-workbench.ts",
  "src/lib/pdm-detail-status-actionability.ts",
  "src/components/human-status-badge.tsx",
  "src/components/drawing-workbench.tsx",
  "src/components/part-workbench.tsx",
  "src/components/relation-workbench.tsx",
  "src/components/drawing-projection.tsx",
  "src/components/part-projection.tsx",
  "src/components/part-detail-content.tsx",
  "src/components/unified-pdm-entity-detail-drawer.tsx",
  "src/components/pdm-workbench-preview-gallery.tsx",
  "src/app/numbering/search/page.tsx",
  "src/app/api/parts/route.ts",
  "src/app/api/parts/[partNumber]/route.ts",
  "src/app/api/numbering/relations/route.ts",
  "src/app/api/numbering/roots/[rootCode]/route.ts"
];
const sources = sourceFiles.map(read).join("\n");

for (const field of ["responsibilityStatus", "viewerActionability", "humanStatus", "availabilityScope", "viewerStatus"]) {
  results.push(check(`DTO-${field}`, sources.includes(field)));
}
results.push(check("PROJECTOR-shared", sources.includes("projectResponsibilityStatusPair") && sources.includes("projectRoleResponsibilityStatusPair")));
for (const label of ["全部", "編輯中", "審核中", "待確認", "研發版可使用", "量產版可使用"]) {
  results.push(check(`VOCAB-${label}`, read("src/lib/work-status-presentation.ts").includes(label)));
}
results.push(check("BADGE-no-viewer-primary", !read("src/components/human-status-badge.tsx").includes("humanStatusDisplayLabel")));
results.push(check("BADGE-shared-presentation-primary", read("src/components/human-status-badge.tsx").includes("projectWorkStatusPresentation")));
results.push(check("BADGE-single-status", !read("src/components/human-status-badge.tsx").includes("你可處理")));

const primaryUi = [
  "src/components/human-status-badge.tsx",
  "src/components/drawing-workbench.tsx",
  "src/components/part-workbench.tsx",
  "src/components/relation-workbench.tsx",
  "src/components/drawing-projection.tsx",
  "src/components/part-projection.tsx",
  "src/components/part-detail-content.tsx",
  "src/components/unified-pdm-entity-detail-drawer.tsx",
  "src/components/pdm-workbench-preview-gallery.tsx",
  "src/app/numbering/search/page.tsx"
].map(read).join("\n");
for (const forbidden of ["待你處理", "等他人處理", "待他人處理"]) {
  results.push(check(`PRIMARY-no-${forbidden}`, !primaryUi.includes(forbidden)));
}

const partRoute = read("src/app/api/parts/route.ts");
const relationRoute = read("src/app/api/numbering/relations/route.ts");
results.push(check("FILTER-part-before-limit", partRoute.indexOf("responsibilityStatusMatchesFilter") < partRoute.indexOf(".slice(0, requestedLimit)")));
results.push(check("FILTER-relation-before-limit", relationRoute.indexOf("responsibilityStatusMatchesFilter") < relationRoute.indexOf(".slice(0, requestedLimit)")));
results.push(check("FILTER-workbench-stable", (
  sources.includes("responsibilityStatusMatchesFilter(row.responsibilityStatus") ||
  (sources.includes("responsibilityStatusMatchesSelection") && sources.includes("query.humanStatus"))
)));
results.push(check("FILTER-old-query-compatible", read("src/lib/work-status-presentation.ts").includes("needs_action") && read("src/lib/work-status-presentation.ts").includes("waiting") && read("src/lib/work-status-presentation.ts").includes("history")));
results.push(check("FILTER-history-before-limit-sync", read("src/lib/repositories/numbering-repository.ts").includes("includeHistory === false") && read("src/lib/repositories/numbering-repository.ts").includes("NOT IN ('Obsolete', 'Merged')")));
results.push(check("FILTER-history-before-limit-async", read("src/lib/repositories/numbering-async-repository.ts").includes("includeHistory === false") && read("src/lib/repositories/numbering-async-repository.ts").includes("NOT IN ('Obsolete', 'Merged')")));

for (const file of [
  "src/app/api/parts/route.ts",
  "src/app/api/parts/[partNumber]/route.ts",
  "src/app/api/numbering/relations/route.ts",
  "src/app/api/numbering/roots/[rootCode]/route.ts"
]) {
  results.push(check(`CACHE-${file}`, read(file).includes('"cache-control": "private, no-store"')));
}

const packageSource = read("package.json");
for (const command of ["qc:dev-078:projection", "qc:dev-078:contract", "qc:dev-078:browser", "qc:dev-078", "qc:dev-062:relation", "qc:dev-053:ui", "qc:dev-053:real-operation", "qc:pdm-entity-detail-drawer"]) {
  results.push(check(`PACKAGE-${command}`, packageSource.includes(`"${command}"`)));
}
for (const command of ["qc:dev-078:projection", "qc:dev-078:contract", "qc:dev-055:projection", "qc:dev-055:contract", "qc:dev-073:contract", "qc:dev-062:relation", "qc:dev-053:ui", "typecheck:app", "qc:dev-078:browser", "qc:dev-055:browser", "qc:dev-073:browser", "qc:dev-053:real-operation", "qc:pdm-entity-detail-drawer", "build:isolated"]) {
  results.push(check(`AGGREGATE-${command}`, packageSource.split('"qc:dev-078": "')[1]?.split('"')[0]?.includes(`npm run ${command}`)));
}
const dev073Runner = read("scripts/qc-dev-073-browser-runner.mjs");
const dev073Browser = read("scripts/qc-dev-073-browser.mjs");
results.push(check("DEV073-browser-runner", packageSource.includes('"qc:dev-073:browser": "node scripts/qc-dev-073-browser-runner.mjs"')));
results.push(check("DEV073-source-preflight", dev073Runner.includes("requiredRevisions") && dev073Runner.includes("terminalFff") && dev073Runner.includes("drawingNumber")));
results.push(check("DEV073-isolated-source", dev073Runner.includes("fs.copyFileSync") && dev073Runner.includes("os.tmpdir") && dev073Browser.includes("PDM_DEV073_SOURCE_DB")));

console.log(JSON.stringify({ suite: "DEV-078 responsibility status contract", passed: results.length, failed: 0, results }, null, 2));
