import fs from "node:fs";

const results = [];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

for (const directory of ["docs/reports/rd", "docs/reports/qa", "docs/reports/qc", "docs/validation-plans", "docs/runbooks"]) {
  record(`DOCS-001 directory exists: ${directory}`, fs.existsSync(directory), directory);
  record(`DOCS-002 README exists: ${directory}`, fs.existsSync(`${directory}/README.md`), `${directory}/README.md`);
}

const pathIndex = read("docs/report-path-index.md");
record("DOCS-003 path index maps RD reports", pathIndex.includes("docs/rd-*.md") && pathIndex.includes("docs/reports/rd/"));
record("DOCS-004 path index maps QA validation plans", pathIndex.includes("docs/qa-*-validation-plan-*.md") && pathIndex.includes("docs/validation-plans/"));
record("DOCS-005 path index maps QC reports", pathIndex.includes("docs/qc-*.md") && pathIndex.includes("docs/reports/qc/"));

const qaSync = read("scripts/qa-sync-dev-task-evidence.mjs");
record("DOCS-006 evidence sync prefers .ai-doc/dev_task.md", qaSync.includes('path.join(root, ".ai-doc", "dev_task.md")'));
record("DOCS-007 evidence sync keeps legacy task fallbacks", qaSync.includes('path.join(root, "dev_task.md")') && qaSync.includes('path.join(root, "PDM_dev_task.md")'));

const productionReadiness = read("scripts/qc-production-readiness-test.mjs");
record("DOCS-009 production readiness prefers .ai-doc/dev_task.md", productionReadiness.includes('path.join(root, ".ai-doc", "dev_task.md")'));
record("DOCS-010 production readiness keeps legacy task fallbacks", productionReadiness.includes('path.join(root, "dev_task.md")') && productionReadiness.includes('path.join(root, "PDM_dev_task.md")'));

for (const script of [
  "scripts/generate-sw-addin-test-report.mjs",
  "scripts/generate-document-manager-report.mjs",
  "scripts/generate-restore-drill-report.mjs"
]) {
  record(`DOCS-008 report generator uses configured report root: ${script}`, read(script).includes("getReportRoot") || read(script).includes("getRestoreDrillReportRoot"), script);
}

console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
