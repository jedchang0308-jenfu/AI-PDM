#!/usr/bin/env node

import path from "node:path";
import {
  DOCUMENT_MANAGER_CASES,
  findLatestReport,
  normalizeReport,
  readReport,
  validateReport,
  writeReport
} from "./document-manager-report-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const reportPath = args.report ? path.resolve(args.report) : findLatestReport(root);

function parseArgs(argv) {
  const parsed = {
    report: "",
    fields: {},
    finalResult: "",
    signedOffBy: "",
    signedOffAt: "",
    notes: "",
    evidence: "",
    sampleFile: "",
    backendSubmissionId: "",
    markAllPass: false,
    caseUpdates: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") parsed.report = argv[++index] ?? "";
    else if (arg === "--latest") parsed.report = "";
    else if (arg === "--final-result") parsed.finalResult = argv[++index] ?? "";
    else if (arg === "--signed-off-by") parsed.signedOffBy = argv[++index] ?? "";
    else if (arg === "--signed-off-at") parsed.signedOffAt = argv[++index] ?? "";
    else if (arg === "--notes") parsed.notes = argv[++index] ?? "";
    else if (arg === "--evidence") parsed.evidence = argv[++index] ?? "";
    else if (arg === "--sample-file") parsed.sampleFile = argv[++index] ?? "";
    else if (arg === "--backend-submission-id") parsed.backendSubmissionId = argv[++index] ?? "";
    else if (arg === "--mark-all-pass") parsed.markAllPass = true;
    else if (arg === "--case") parsed.caseUpdates.push(parseCaseUpdate(argv[++index] ?? ""));
    else if (arg.startsWith("--")) {
      parsed.fields[toCamelCase(arg.slice(2))] = argv[++index] ?? "";
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function parseCaseUpdate(value) {
  const parts = value.split(":");
  const [caseId, result, evidence = "", notes = "", sampleFile = "", backendSubmissionId = ""] = parts;
  if (!caseId || !result) {
    console.error(`Invalid --case value: ${value}`);
    console.error("Expected: CASE_ID:result[:evidence[:notes[:sampleFile[:backendSubmissionId]]]]");
    process.exit(1);
  }
  return { caseId, result, evidence, notes, sampleFile, backendSubmissionId };
}

function setIfFilled(target, key, value) {
  if (typeof value === "string" && value.trim()) target[key] = value.trim();
}

if (!reportPath) {
  console.error("No Document Manager report found. Run npm.cmd run document-manager:report:new first.");
  process.exit(1);
}

const report = normalizeReport(readReport(reportPath));

for (const [key, value] of Object.entries(args.fields)) {
  if (key in report.environment) setIfFilled(report.environment, key, value);
}

setIfFilled(report.summary, "finalResult", args.finalResult);
setIfFilled(report.summary, "signedOffBy", args.signedOffBy);
setIfFilled(report.summary, "signedOffAt", args.signedOffAt);
setIfFilled(report.summary, "notes", args.notes);

const defaultEvidence = args.evidence || "Operator confirmed expected result with licensed SolidWorks Document Manager or approved equivalent extractor.";

if (args.markAllPass) {
  for (const testCase of report.cases) {
    testCase.result = "pass";
    testCase.evidence ||= defaultEvidence;
    testCase.sampleFile ||= args.sampleFile;
    testCase.backendSubmissionId ||= args.backendSubmissionId;
  }
}

for (const update of args.caseUpdates) {
  const testCase = report.cases.find((entry) => entry.id === update.caseId);
  if (!testCase) {
    console.error(`Unknown case id: ${update.caseId}`);
    console.error(`Known case ids: ${DOCUMENT_MANAGER_CASES.map((entry) => entry.id).join(", ")}`);
    process.exit(1);
  }
  testCase.result = update.result;
  if (update.evidence) testCase.evidence = update.evidence;
  if (update.notes) testCase.notes = update.notes;
  if (update.sampleFile) testCase.sampleFile = update.sampleFile;
  if (update.backendSubmissionId) testCase.backendSubmissionId = update.backendSubmissionId;
}

if (report.summary.finalResult === "pass") report.status = "completed";

writeReport(reportPath, report);

const validation = validateReport(report);
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

if (!validation.ready) process.exitCode = 1;
