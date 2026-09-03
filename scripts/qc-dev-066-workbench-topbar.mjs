#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const record = (id, passed, detail = "") => checks.push({ id, passed: Boolean(passed), detail });

// DEV-066 described the pre-canonical three-workbench shell. That source tree was
// intentionally retired by DEV-087/090/112; this runner now prevents the old
// command from silently becoming a false current UI gate.
const retiredSources = [
  "src/components/relation-workbench.tsx",
  "src/components/drawing-workbench.tsx",
  "src/components/part-workbench.tsx",
  "src/lib/relation-workbench.ts",
  "src/lib/drawing-workbench.ts",
  "src/lib/part-workbench.ts"
];
for (const file of retiredSources) record(`legacy source retired: ${file}`, !exists(file));

const canonicalWorkbench = read("src/components/canonical-pdm-workbench.tsx");
const canonicalRelation = read("src/components/canonical-relation-matrix-section.tsx");
const pagination = read("src/components/pdm-workbench-pagination.tsx");
const layoutSwitch = read("src/components/pdm-workbench-layout-switch.tsx");
const packageJson = JSON.parse(read("package.json"));
const taskIndex = read(".ai-doc/dev_task.md");
const map = read(".ai-doc/documentation_map.md");

record("canonical workbench owns search/filter/result/pagination mechanics", [
  "canonical-toolbar",
  "canonical-list",
  "PdmWorkbenchPagination",
  "pdm-workbench-multi-select-filter"
].every((token) => canonicalWorkbench.includes(token)));
record("canonical workbench owns history and URL recovery", [
  "historyRevision",
  "historyMode",
  "canonical-history-open",
  "DrawingHistoryRevision"
].every((token) => canonicalWorkbench.includes(token)));
record("current Drawing/Part display modes are delegated to DEV-112", [
  "PdmWorkbenchLayoutSwitch",
  "data-canonical-result-display-bar",
  "previewCapability"
].every((token) => canonicalWorkbench.includes(token)));
record("current Relation matrix is delegated to DEV-090", [
  "CanonicalRelationMatrixSection",
  "data-canonical-relation-edit",
  "editing"
].every((token) => canonicalWorkbench.includes(token) || canonicalRelation.includes(token)));
record("shared pagination remains an accessible current primitive", [
  'aria-label="工作台分頁"',
  "上一頁",
  "下一頁"
].every((token) => pagination.includes(token)));
record("display mode remains one accessible current primitive", [
  'role="radiogroup"',
  'aria-label="顯示方式"',
  'role="radio"'
].every((token) => layoutSwitch.includes(token)));
record("successor commands are registered", [
  "qc:dev-087",
  "qc:dev-090",
  "qc:dev-112:aggregate"
].every((command) => Object.prototype.hasOwnProperty.call(packageJson.scripts ?? {}, command)));
record("task index records DEV-066 as superseded without a separate release target", /DEV-066[\s\S]{0,260}Superseded by DEV-087\/DEV-090\/DEV-112[\s\S]{0,180}No Separate Release Target/u.test(taskIndex));
record("documentation map records DEV-066 supersession", /DEV-066[\s\S]{0,320}Superseded by DEV-087\/DEV-090\/DEV-112/u.test(map));

for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}${check.detail ? `: ${check.detail}` : ""}`);
const failed = checks.filter((check) => !check.passed);
if (failed.length > 0) {
  console.error(`DEV-066 supersession guard failed: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`DEV-066 superseded by current canonical successors: ${checks.length} checks`);
}
