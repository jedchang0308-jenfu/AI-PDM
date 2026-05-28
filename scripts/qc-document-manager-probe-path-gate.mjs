#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createBlankReport, validateReport } from "./document-manager-report-utils.mjs";

const root = process.cwd();
const probePath = path.join(root, "data", "document-manager-probes", "qc-contract", "probe.json");
const badProbeDir = path.join(root, "data", "document-manager-probes", "qc-bad");
const badProbePath = path.join(badProbeDir, "probe.json");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function completedReport(extractorProbePath) {
  const report = createBlankReport("qc-probe-path-gate");
  report.status = "completed";
  report.environment = {
    ...report.environment,
    tester: "QC",
    testDate: "2026-05-27",
    componentName: "Mock equivalent extractor",
    componentVersion: "0.0.0-qc",
    licenseOwner: "QC fixture",
    deploymentHost: "QC fixture host",
    extractorCommand: process.execPath,
    extractorArgs: "[]",
    referenceExtractorCommand: process.execPath,
    referenceExtractorArgs: "[]",
    extractorProbePath,
    backendUrl: "http://127.0.0.1:3000",
    sampleFilesPath: "data/qc-fixtures/document-manager-extractor-probe"
  };
  report.summary = {
    finalResult: "pass",
    signedOffBy: "QC",
    signedOffAt: "2026-05-27",
    notes: "Probe path gate fixture."
  };
  report.cases = report.cases.map((testCase) => ({
    ...testCase,
    result: "pass",
    evidence: "QC fixture evidence.",
    sampleFile: "data/qc-fixtures/document-manager-extractor-probe",
    backendSubmissionId: "QC"
  }));
  return report;
}

record("DMPATH-001 ready probe fixture exists", fs.existsSync(probePath), probePath);
const valid = validateReport(completedReport(path.relative(root, probePath).replaceAll(path.sep, "/")));
record("DMPATH-002 valid ready probe path allows completed report", valid.ready, JSON.stringify(valid.issues));

const missing = validateReport(completedReport("data/document-manager-probes/missing/probe.json"));
record("DMPATH-003 missing probe path is blocked", missing.issues.some((issue) => issue.type === "probe_not_found"), JSON.stringify(missing.issues));

fs.mkdirSync(badProbeDir, { recursive: true });
fs.writeFileSync(badProbePath, `${JSON.stringify({ ready: false }, null, 2)}\n`, "utf8");
const notReady = validateReport(completedReport(path.relative(root, badProbePath).replaceAll(path.sep, "/")));
record("DMPATH-004 not-ready probe path is blocked", notReady.issues.some((issue) => issue.type === "probe_not_ready"), JSON.stringify(notReady.issues));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
