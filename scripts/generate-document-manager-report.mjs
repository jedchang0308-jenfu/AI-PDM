#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createBlankReport, makeReportId, writeReport } from "./document-manager-report-utils.mjs";

const root = process.cwd();
const reportId = makeReportId();
const outputDir = path.join(root, "data", "document-manager-reports", reportId);
const report = createBlankReport(reportId);

fs.mkdirSync(outputDir, { recursive: true });
writeReport(path.join(outputDir, "report.json"), report);

console.log(JSON.stringify({
  reportId,
  outputDir,
  files: [
    path.relative(root, path.join(outputDir, "report.json")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(outputDir, "report.md")).replaceAll(path.sep, "/")
  ]
}, null, 2));
