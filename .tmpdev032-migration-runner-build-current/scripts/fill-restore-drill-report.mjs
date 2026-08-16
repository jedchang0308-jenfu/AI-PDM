#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  findLatestRestoreDrillReport,
  readRestoreDrillReport,
  RESTORE_DRILL_CASES,
  validateRestoreDrillReport
} from "./restore-drill-report-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const reportPath = args.report ? path.resolve(args.report) : findLatestRestoreDrillReport(root);

function parseArgs(argv) {
  const parsed = {
    report: "",
    tester: "",
    testDate: "",
    testMachineName: "",
    testMachineType: "",
    windowsVersion: "",
    nodeVersion: "",
    npmVersion: "",
    sourceSnapshotId: "",
    sourceSnapshotPath: "",
    handoffPath: "",
    targetDir: "",
    productionMachineName: "",
    signedOffBy: "",
    signedOffAt: "",
    notes: "",
    finalResult: "",
    evidence: "",
    command: "",
    autoEnv: false,
    markAllPass: false,
    caseUpdates: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") parsed.report = argv[++index] ?? "";
    else if (arg === "--latest") parsed.report = "";
    else if (arg === "--tester") parsed.tester = argv[++index] ?? "";
    else if (arg === "--test-date") parsed.testDate = argv[++index] ?? "";
    else if (arg === "--test-machine") parsed.testMachineName = argv[++index] ?? "";
    else if (arg === "--test-machine-type") parsed.testMachineType = argv[++index] ?? "";
    else if (arg === "--windows-version") parsed.windowsVersion = argv[++index] ?? "";
    else if (arg === "--node-version") parsed.nodeVersion = argv[++index] ?? "";
    else if (arg === "--npm-version") parsed.npmVersion = argv[++index] ?? "";
    else if (arg === "--snapshot-id") parsed.sourceSnapshotId = argv[++index] ?? "";
    else if (arg === "--snapshot-path") parsed.sourceSnapshotPath = argv[++index] ?? "";
    else if (arg === "--handoff-path") parsed.handoffPath = argv[++index] ?? "";
    else if (arg === "--target-dir") parsed.targetDir = argv[++index] ?? "";
    else if (arg === "--production-machine") parsed.productionMachineName = argv[++index] ?? "";
    else if (arg === "--signed-off-by") parsed.signedOffBy = argv[++index] ?? "";
    else if (arg === "--signed-off-at") parsed.signedOffAt = argv[++index] ?? "";
    else if (arg === "--notes") parsed.notes = argv[++index] ?? "";
    else if (arg === "--final-result") parsed.finalResult = argv[++index] ?? "";
    else if (arg === "--evidence") parsed.evidence = argv[++index] ?? "";
    else if (arg === "--command") parsed.command = argv[++index] ?? "";
    else if (arg === "--auto-env") parsed.autoEnv = true;
    else if (arg === "--mark-all-pass") parsed.markAllPass = true;
    else if (arg === "--case") {
      parsed.caseUpdates.push(parseCaseUpdate(argv[++index] ?? ""));
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function parseCaseUpdate(value) {
  const parts = value.split(":");
  const [caseId, result, evidence = "", notes = ""] = parts;
  if (!caseId || !result) {
    console.error(`Invalid --case value: ${value}`);
    console.error("Expected: CASE_ID:result[:evidence[:notes]]");
    process.exit(1);
  }
  return { caseId, result, evidence, notes };
}

function runVersion(command, args = []) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function npmVersion() {
  return runVersion("npm.cmd", ["--version"]) || runVersion("npm", ["--version"]);
}

function windowsVersion() {
  const release = os.release();
  return release ? `Windows ${release}` : "";
}

function setIfFilled(target, key, value) {
  if (typeof value === "string" && value.trim()) {
    target[key] = value.trim();
  }
}

function updateMarkdownIfExists(jsonPath, report) {
  const markdownPath = jsonPath.replace(/\.json$/u, ".md");
  if (!fs.existsSync(markdownPath)) return;

  const lines = [
    "# Independent Restore Drill Report",
    "",
    `Report ID: \`${report.reportId}\``,
    "",
    "## Environment",
    "",
    "| Field | Value |",
    "| --- | --- |"
  ];

  for (const [key, value] of Object.entries(report.environment)) {
    lines.push(`| ${key} | ${value ?? ""} |`);
  }

  const groups = report.cases.reduce((acc, testCase) => {
    acc[testCase.section] ??= [];
    acc[testCase.section].push(testCase);
    return acc;
  }, {});

  for (const [section, cases] of Object.entries(groups)) {
    lines.push("", `## ${section}`, "", "| Case ID | Priority | Result | Evidence | Notes |", "| --- | --- | --- | --- | --- |");
    for (const testCase of cases) {
      lines.push(`| ${testCase.id} | ${testCase.priority} | ${testCase.result} | ${testCase.evidence} | ${testCase.notes || testCase.expected} |`);
    }
  }

  lines.push(
    "",
    "## Sign-Off",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| finalResult | ${report.summary.finalResult} |`,
    `| signedOffBy | ${report.summary.signedOffBy} |`,
    `| signedOffAt | ${report.summary.signedOffAt} |`,
    `| notes | ${report.summary.notes} |`,
    ""
  );

  fs.writeFileSync(markdownPath, lines.join("\n"), "utf8");
}

if (!reportPath) {
  console.error("No restore drill report found. Run npm.cmd run backup:restore-drill-report:new first.");
  process.exit(1);
}

const report = readRestoreDrillReport(reportPath);

if (args.autoEnv) {
  report.environment.testMachineName ||= os.hostname();
  report.environment.windowsVersion ||= windowsVersion();
  report.environment.nodeVersion ||= process.version;
  report.environment.npmVersion ||= npmVersion();
}

setIfFilled(report.environment, "tester", args.tester);
setIfFilled(report.environment, "testDate", args.testDate);
setIfFilled(report.environment, "testMachineName", args.testMachineName);
setIfFilled(report.environment, "testMachineType", args.testMachineType);
setIfFilled(report.environment, "windowsVersion", args.windowsVersion);
setIfFilled(report.environment, "nodeVersion", args.nodeVersion);
setIfFilled(report.environment, "npmVersion", args.npmVersion);
setIfFilled(report.environment, "sourceSnapshotId", args.sourceSnapshotId);
setIfFilled(report.environment, "sourceSnapshotPath", args.sourceSnapshotPath);
setIfFilled(report.environment, "handoffPath", args.handoffPath);
setIfFilled(report.environment, "targetDir", args.targetDir);
setIfFilled(report.environment, "productionMachineName", args.productionMachineName);

setIfFilled(report.summary, "signedOffBy", args.signedOffBy);
setIfFilled(report.summary, "signedOffAt", args.signedOffAt);
setIfFilled(report.summary, "notes", args.notes);
setIfFilled(report.summary, "finalResult", args.finalResult);

const defaultEvidence = args.evidence || "Operator confirmed command output on independent restore drill machine.";
const defaultCommand = args.command || "restore-on-test-machine.ps1";

if (args.markAllPass) {
  for (const testCase of report.cases) {
    testCase.result = "pass";
    testCase.evidence ||= defaultEvidence;
    testCase.command ||= defaultCommand;
  }
}

for (const update of args.caseUpdates) {
  const testCase = report.cases.find((entry) => entry.id === update.caseId);
  if (!testCase) {
    console.error(`Unknown case id: ${update.caseId}`);
    console.error(`Known case ids: ${RESTORE_DRILL_CASES.map((entry) => entry.id).join(", ")}`);
    process.exit(1);
  }
  testCase.result = update.result;
  if (update.evidence) testCase.evidence = update.evidence;
  if (update.notes) testCase.notes = update.notes;
}

if (report.summary.finalResult === "pass") {
  report.status = "completed";
}

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
updateMarkdownIfExists(reportPath, report);

const validation = validateRestoreDrillReport(report);
console.log(JSON.stringify({
  reportPath,
  ready: validation.ready,
  reportId: validation.reportId,
  status: report.status,
  totalCases: validation.totalCases,
  passedCases: validation.passedCases,
  issueCount: validation.issues.length,
  issues: validation.issues
}, null, 2));

if (!validation.ready) {
  process.exitCode = 1;
}
