#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const record = (id, passed) => checks.push({ id, passed: Boolean(passed) });

const files = {
  relation: read("src/components/relation-workbench.tsx"),
  drawing: read("src/components/drawing-workbench.tsx"),
  part: read("src/components/part-workbench.tsx"),
  pagination: read("src/components/pdm-workbench-pagination.tsx"),
  css: read("src/app/globals.css"),
  spec: read(".ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md"),
  qa: read(".ai-doc/qa/qa-dev-066-workbench-topbar-muscle-memory-validation-plan-2026-08-11.md")
};

const workbenches = [files.relation, files.drawing, files.part];
record("TB-001 all workbenches use the shared topbar and toolbar classes", workbenches.every((source) => source.includes("pdm-workbench-topbar") && source.includes('className="panel pdm-workbench-toolbar"')));
record("TB-002 all workbenches keep one filter grid", workbenches.every((source) => source.includes('className="drawing-workbench-filter-grid"')));
record("TB-003 footer follows the filter row", workbenches.every((source) => source.indexOf("drawing-workbench-filter-grid") < source.indexOf("pdm-workbench-toolbar-footer")));
record("TB-004 history leads and mode actions trail", workbenches.every((source) => {
  const footer = source.indexOf("pdm-workbench-toolbar-footer");
  return footer >= 0 && source.indexOf("drawing-workbench-history-toggle", footer) < source.indexOf("pdm-workbench-toolbar-view-actions", footer);
}));
record("TB-005 relation switch is nested in trailing actions", files.relation.indexOf("pdm-workbench-toolbar-view-actions") < files.relation.indexOf("pdm-relation-view-switch"));
record("TB-006 drawing and part layout switches are nested in trailing actions", [files.drawing, files.part].every((source) => {
  const footerActions = source.indexOf("pdm-workbench-toolbar-view-actions");
  return footerActions >= 0 && source.indexOf("PdmWorkbenchLayoutSwitch", footerActions) > footerActions;
}));
record("TB-007 pagination is shared by all workbenches", workbenches.every((source) => source.includes("@/components/pdm-workbench-pagination") && source.includes("<PdmWorkbenchPagination")));
record("TB-008 pagination component exposes stable nav and control order", files.pagination.includes('<nav className="number-state-pagination pdm-workbench-pagination" aria-label="工作台分頁">') && files.pagination.indexOf("上一頁") < files.pagination.indexOf("第 {pageIndex + 1} 頁") && files.pagination.indexOf("第 {pageIndex + 1} 頁") < files.pagination.indexOf("下一頁"));
record("TB-009 pagination component fails closed when there is no page", files.pagination.includes("if (pageIndex <= 0 && !hasNextPage) return null;"));
record("TB-010 CSS fixes relation switch grid leakage and adds responsive footer", files.css.includes(".pdm-workbench-toolbar-view-actions") && files.css.includes("flex-direction: column;") && files.css.includes(".pdm-relation-view-switch {\n  grid-column: auto;"));
record("TB-011 docs contain RD and QA contracts", files.spec.includes("RD Implementation Contract") && files.qa.includes("TB-001") && files.qa.includes("TB-012"));
record("TB-012 direct per-workbench pagination markup is removed", workbenches.every((source) => !source.includes('className="number-state-pagination"')));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}`);
if (failed.length > 0) {
  console.error(`DEV-066 focused contract QC failed: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`DEV-066 focused contract QC passed: ${checks.length} checks`);
}
