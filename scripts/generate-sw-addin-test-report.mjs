#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createBlankReport, makeReportId } from "./sw-addin-report-utils.mjs";
import { getReportRoot } from "./pdm-paths.mjs";

const root = process.cwd();
const reportId = makeReportId();
const outputDir = path.join(getReportRoot(root, "sw-addin-test-reports"), reportId);
const report = createBlankReport(reportId);

function groupCases(cases) {
  return cases.reduce((groups, testCase) => {
    groups[testCase.section] ??= [];
    groups[testCase.section].push(testCase);
    return groups;
  }, {});
}

function buildMarkdown(report) {
  const lines = [
    "# SolidWorks Add-in Real-Machine Test Report",
    "",
    `Report ID: \`${report.reportId}\``,
    "",
    "## Fill-In Instructions",
    "",
    "1. Fill `report.json` during field testing.",
    "2. Use `pass`, `fail`, `blocked`, `not_applicable`, or `not_run` for each case result.",
    "3. Required cases must be `pass` for production readiness.",
    "4. Optional cases may be `pass` or `not_applicable`.",
    "5. Add screenshots, logs, and backend submission IDs in evidence fields.",
    "",
    "## Environment",
    "",
    "| Field | Value |",
    "| --- | --- |"
  ];

  for (const [key, value] of Object.entries(report.environment)) {
    lines.push(`| ${key} | ${value === null ? "" : value} |`);
  }

  for (const [section, cases] of Object.entries(groupCases(report.cases))) {
    lines.push("", `## ${section}`, "", "| Case ID | Priority | Required | Result | Evidence | Notes |", "| --- | --- | --- | --- | --- | --- |");
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

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "report.md"), buildMarkdown(report), "utf8");

console.log(JSON.stringify({
  reportId,
  outputDir,
  files: [
    path.relative(root, path.join(outputDir, "report.json")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(outputDir, "report.md")).replaceAll(path.sep, "/")
  ]
}, null, 2));
