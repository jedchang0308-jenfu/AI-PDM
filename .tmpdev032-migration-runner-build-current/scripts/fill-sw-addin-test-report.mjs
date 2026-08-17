#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findLatestReport,
  readReport,
  SW_ADDIN_CASES,
  validateReport
} from "./sw-addin-report-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const reportPath = args.report ? path.resolve(args.report) : findLatestReport(root);

function parseArgs(argv) {
  const parsed = {
    report: "",
    tester: "",
    testDate: "",
    windowsVersion: "",
    solidWorksVersion: "",
    dotNet48Installed: "",
    backendUrl: "",
    testAccount: "",
    testMachineType: "",
    addinBuildPath: "",
    addinVersion: "",
    signedOffBy: "",
    signedOffAt: "",
    notes: "",
    finalResult: "",
    evidence: "",
    backendSubmissionId: "",
    autoEnv: false,
    markAllPass: false,
    markOptionalNotApplicable: false,
    caseUpdates: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") parsed.report = argv[++index] ?? "";
    else if (arg === "--latest") parsed.report = "";
    else if (arg === "--tester") parsed.tester = argv[++index] ?? "";
    else if (arg === "--test-date") parsed.testDate = argv[++index] ?? "";
    else if (arg === "--windows-version") parsed.windowsVersion = argv[++index] ?? "";
    else if (arg === "--solidworks-version") parsed.solidWorksVersion = argv[++index] ?? "";
    else if (arg === "--dotnet48-installed") parsed.dotNet48Installed = argv[++index] ?? "";
    else if (arg === "--backend-url") parsed.backendUrl = argv[++index] ?? "";
    else if (arg === "--test-account") parsed.testAccount = argv[++index] ?? "";
    else if (arg === "--test-machine-type") parsed.testMachineType = argv[++index] ?? "";
    else if (arg === "--addin-build-path") parsed.addinBuildPath = argv[++index] ?? "";
    else if (arg === "--addin-version") parsed.addinVersion = argv[++index] ?? "";
    else if (arg === "--signed-off-by") parsed.signedOffBy = argv[++index] ?? "";
    else if (arg === "--signed-off-at") parsed.signedOffAt = argv[++index] ?? "";
    else if (arg === "--notes") parsed.notes = argv[++index] ?? "";
    else if (arg === "--final-result") parsed.finalResult = argv[++index] ?? "";
    else if (arg === "--evidence") parsed.evidence = argv[++index] ?? "";
    else if (arg === "--backend-submission-id") parsed.backendSubmissionId = argv[++index] ?? "";
    else if (arg === "--auto-env") parsed.autoEnv = true;
    else if (arg === "--mark-all-pass") parsed.markAllPass = true;
    else if (arg === "--mark-optional-not-applicable") parsed.markOptionalNotApplicable = true;
    else if (arg === "--case") parsed.caseUpdates.push(parseCaseUpdate(argv[++index] ?? ""));
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function parseCaseUpdate(value) {
  const parts = value.split(":");
  const [caseId, result, evidence = "", notes = "", backendSubmissionId = ""] = parts;
  if (!caseId || !result) {
    console.error(`Invalid --case value: ${value}`);
    console.error("Expected: CASE_ID:result[:evidence[:notes[:backendSubmissionId]]]");
    process.exit(1);
  }
  return { caseId, result, evidence, notes, backendSubmissionId };
}

function windowsVersion() {
  const release = os.release();
  return release ? `Windows ${release}` : "";
}

function booleanArg(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "y", "installed"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "missing"].includes(normalized)) return false;
  console.error(`Invalid boolean value for --dotnet48-installed: ${value}`);
  process.exit(1);
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
    "# SolidWorks Add-in Real-Machine Test Report",
    "",
    `Report ID: \`${report.reportId}\``,
    "",
    "## Environment",
    "",
    "| Field | Value |",
    "| --- | --- |"
  ];

  for (const [key, value] of Object.entries(report.environment)) {
    lines.push(`| ${key} | ${value === null ? "" : value} |`);
  }

  const groups = report.cases.reduce((acc, testCase) => {
    acc[testCase.section] ??= [];
    acc[testCase.section].push(testCase);
    return acc;
  }, {});

  for (const [section, cases] of Object.entries(groups)) {
    lines.push("", `## ${section}`, "", "| Case ID | Priority | Required | Result | Evidence | Backend Submission | Notes |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const testCase of cases) {
      lines.push(
        `| ${testCase.id} | ${testCase.priority} | ${testCase.required ? "Yes" : "No"} | ${testCase.result} | ${testCase.evidence} | ${testCase.backendSubmissionId} | ${testCase.notes || testCase.expected} |`
      );
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
  console.error("No SolidWorks Add-in report found. Run npm.cmd run sw-addin:report:new first.");
  process.exit(1);
}

const report = readReport(reportPath);

if (args.autoEnv) {
  report.environment.windowsVersion ||= windowsVersion();
}

setIfFilled(report.environment, "tester", args.tester);
setIfFilled(report.environment, "testDate", args.testDate);
setIfFilled(report.environment, "windowsVersion", args.windowsVersion);
setIfFilled(report.environment, "solidWorksVersion", args.solidWorksVersion);
setIfFilled(report.environment, "backendUrl", args.backendUrl);
setIfFilled(report.environment, "testAccount", args.testAccount);
setIfFilled(report.environment, "testMachineType", args.testMachineType);
setIfFilled(report.environment, "addinBuildPath", args.addinBuildPath);
setIfFilled(report.environment, "addinVersion", args.addinVersion);

const dotNet48Installed = booleanArg(args.dotNet48Installed);
if (dotNet48Installed !== undefined) {
  report.environment.dotNet48Installed = dotNet48Installed;
}

setIfFilled(report.summary, "signedOffBy", args.signedOffBy);
setIfFilled(report.summary, "signedOffAt", args.signedOffAt);
setIfFilled(report.summary, "notes", args.notes);
setIfFilled(report.summary, "finalResult", args.finalResult);

const defaultEvidence = args.evidence || "Operator confirmed expected result on Win11 / SolidWorks 2025 CAD machine.";
const defaultBackendSubmissionId = args.backendSubmissionId || "";

if (args.markAllPass) {
  for (const testCase of report.cases) {
    testCase.result = "pass";
    testCase.evidence ||= defaultEvidence;
    testCase.backendSubmissionId ||= defaultBackendSubmissionId;
  }
}

if (args.markOptionalNotApplicable) {
  for (const testCase of report.cases) {
    if (!testCase.required) {
      testCase.result = "not_applicable";
      testCase.evidence ||= defaultEvidence;
    }
  }
}

for (const update of args.caseUpdates) {
  const testCase = report.cases.find((entry) => entry.id === update.caseId);
  if (!testCase) {
    console.error(`Unknown case id: ${update.caseId}`);
    console.error(`Known case ids: ${SW_ADDIN_CASES.map((entry) => entry.id).join(", ")}`);
    process.exit(1);
  }
  testCase.result = update.result;
  if (update.evidence) testCase.evidence = update.evidence;
  if (update.notes) testCase.notes = update.notes;
  if (update.backendSubmissionId) testCase.backendSubmissionId = update.backendSubmissionId;
}

if (report.summary.finalResult === "pass") {
  report.status = "completed";
}

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
updateMarkdownIfExists(reportPath, report);

const validation = validateReport(report);
console.log(JSON.stringify({
  reportPath,
  ready: validation.ready,
  reportId: validation.reportId,
  status: report.status,
  totalCases: validation.totalCases,
  passedCases: validation.passedCases,
  notApplicableCases: validation.notApplicableCases,
  issueCount: validation.issues.length,
  issues: validation.issues
}, null, 2));

if (!validation.ready) {
  process.exitCode = 1;
}
