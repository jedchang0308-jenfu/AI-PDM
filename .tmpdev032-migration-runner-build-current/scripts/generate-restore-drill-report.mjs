#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createBlankRestoreDrillReport,
  getRestoreDrillReportRoot,
  makeRestoreDrillReportId
} from "./restore-drill-report-utils.mjs";

const root = process.cwd();
const reportId = makeRestoreDrillReportId();
const outputDir = path.join(getRestoreDrillReportRoot(root), reportId);
const report = createBlankRestoreDrillReport(reportId);

function groupCases(cases) {
  return cases.reduce((groups, testCase) => {
    groups[testCase.section] ??= [];
    groups[testCase.section].push(testCase);
    return groups;
  }, {});
}

function buildMarkdown(report) {
  const lines = [
    "# Independent Restore Drill Report",
    "",
    `Report ID: \`${report.reportId}\``,
    "",
    "## Fill-In Instructions",
    "",
    "1. Run the restore handoff on an independent Windows test machine, not the production/source machine.",
    "2. Fill `report.json` during the drill.",
    "3. Use `pass`, `fail`, `blocked`, or `not_run` for each case result.",
    "4. Required cases must be `pass` for production readiness.",
    "5. Add command output, screenshot path, or transcript path in each evidence field.",
    "",
    "## Environment",
    "",
    "| Field | Value |",
    "| --- | --- |"
  ];

  for (const [key, value] of Object.entries(report.environment)) {
    lines.push(`| ${key} | ${value ?? ""} |`);
  }

  for (const [section, cases] of Object.entries(groupCases(report.cases))) {
    lines.push("", `## ${section}`, "", "| Case ID | Priority | Required | Result | Evidence | Expected |", "| --- | --- | --- | --- | --- | --- |");
    for (const testCase of cases) {
      lines.push(`| ${testCase.id} | ${testCase.priority} | ${testCase.required ? "Yes" : "No"} | ${testCase.result} |  | ${testCase.expected} |`);
    }
  }

  lines.push(
    "",
    "## Sign-Off",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| finalResult | not_ready |",
    "| signedOffBy |  |",
    "| signedOffAt |  |",
    "| notes |  |",
    ""
  );

  return lines.join("\n");
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(path.join(outputDir, "report.md"), buildMarkdown(report), "utf8");

console.log(JSON.stringify({
  reportId,
  outputDir,
  files: [
    path.relative(root, path.join(outputDir, "report.json")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(outputDir, "report.md")).replaceAll(path.sep, "/")
  ]
}, null, 2));
