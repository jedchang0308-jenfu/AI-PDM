#!/usr/bin/env node

import path from "node:path";
import { findLatestReport, readReport, validateReport } from "./sw-addin-report-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const reportPath = args.report ? path.resolve(args.report) : findLatestReport(root);

function parseArgs(argv) {
  const parsed = {
    report: "",
    allowOpen: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") {
      parsed.report = argv[++index] ?? "";
    } else if (arg === "--latest") {
      parsed.report = "";
    } else if (arg === "--allow-open") {
      parsed.allowOpen = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

if (!reportPath) {
  console.log(JSON.stringify({
    ready: false,
    allowOpen: args.allowOpen,
    reportPath: null,
    issues: [{ type: "missing_report", message: "No SolidWorks real-machine report found under data/sw-addin-test-reports." }]
  }, null, 2));
  if (!args.allowOpen) process.exitCode = 1;
} else {
  const result = validateReport(readReport(reportPath));
  console.log(JSON.stringify({ ...result, allowOpen: args.allowOpen, reportPath }, null, 2));
  if (!result.ready && !args.allowOpen) process.exitCode = 1;
}
