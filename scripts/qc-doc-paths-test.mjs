import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

const results = [];
const root = process.cwd();

const readRequired = (filePath) => {
  return readProjectFile(root, filePath);
};

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

for (const directory of [
  ".ai-doc/reports/rd",
  ".ai-doc/reports/qa",
  ".ai-doc/qc",
  ".ai-doc/qa",
  ".ai-doc/runbooks",
  ".ai-doc/reports/industrialization",
  ".ai-doc/reports/pm",
  ".ai-doc/reference",
  ".ai-doc/assets"
]) {
  record(`DOCS-001 directory exists: ${directory}`, projectFileExists(root, directory), directory);
}

record("DOCS-002 legacy docs directory removed", !projectFileExists(root, "docs"), "docs");

const documentationMap = readRequired(".ai-doc/documentation_map.md");
record("DOCS-003 documentation map defines .ai-doc center", documentationMap.includes("single project documentation center"));
record("DOCS-004 documentation map points RD reports", documentationMap.includes(".ai-doc/reports/rd/"));
record("DOCS-005 documentation map points QA plans", documentationMap.includes(".ai-doc/qa/"));
record("DOCS-006 documentation map points QC reports", documentationMap.includes(".ai-doc/qc/"));
record("DOCS-007 archived legacy map exists", projectFileExists(root, ".ai-doc/archived/report-path-index.md"));

const qaSync = readRequired("scripts/qa-sync-dev-task-evidence.mjs");
record("DOCS-008 evidence sync prefers .ai-doc/dev_task.md", qaSync.includes('path.join(root, ".ai-doc", "dev_task.md")'));
record("DOCS-009 evidence sync keeps legacy task fallbacks", qaSync.includes('path.join(root, "dev_task.md")') && qaSync.includes('path.join(root, "PDM_dev_task.md")'));

const productionReadiness = readRequired("scripts/qc-production-readiness-test.mjs");
record("DOCS-010 production readiness prefers .ai-doc/dev_task.md", productionReadiness.includes('path.join(root, ".ai-doc", "dev_task.md")'));
record("DOCS-011 production readiness keeps legacy task fallbacks", productionReadiness.includes('path.join(root, "dev_task.md")') && productionReadiness.includes('path.join(root, "PDM_dev_task.md")'));
record("DOCS-012 production readiness uses migrated industrialization docs", productionReadiness.includes(".ai-doc/reports/industrialization/"));

for (const script of [
  "scripts/generate-sw-addin-test-report.mjs",
  "scripts/generate-document-manager-report.mjs",
  "scripts/generate-restore-drill-report.mjs"
]) {
  const source = readRequired(script);
  record(`DOCS-013 report generator uses configured report root: ${script}`, source.includes("getReportRoot") || source.includes("getRestoreDrillReportRoot"), script);
}

console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
