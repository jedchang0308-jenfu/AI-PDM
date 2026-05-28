#!/usr/bin/env node

import path from "node:path";
import { findLatestReport, readReport, validateReport, writeReport } from "./document-manager-report-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const reportPath = args.report ? path.resolve(args.report) : findLatestReport(root);

function parseArgs(argv) {
  const parsed = { report: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") parsed.report = argv[++index] ?? "";
    else if (arg === "--latest") parsed.report = "";
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return parsed;
}

if (!reportPath) {
  console.error("No Document Manager report found. Run npm.cmd run document-manager:report:new first.");
  process.exit(1);
}

const report = readReport(reportPath);
writeReport(reportPath, report);

const validation = validateReport(readReport(reportPath));
console.log(JSON.stringify({
  reportPath,
  schemaVersion: readReport(reportPath).schemaVersion,
  ready: validation.ready,
  reportId: validation.reportId,
  totalCases: validation.totalCases,
  passedCases: validation.passedCases,
  issueCount: validation.issues.length,
  issues: validation.issues
}, null, 2));
