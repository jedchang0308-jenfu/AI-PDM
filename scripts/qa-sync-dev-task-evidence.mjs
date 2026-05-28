#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { findLatestReport as findLatestSwAddinReport, readReport as readSwAddinReport, validateReport as validateSwAddinReport } from "./sw-addin-report-utils.mjs";
import { getRestoreDrillReportEvidence } from "./restore-drill-report-utils.mjs";
import {
  findLatestReport as findLatestDocumentManagerReport,
  readReport as readDocumentManagerReport,
  validateReport as validateDocumentManagerReport
} from "./document-manager-report-utils.mjs";

const root = process.cwd();

const targets = [
  {
    key: "solidworks_real_machine",
    evidenceKey: "solidWorksReady",
    matcher: (line) => line.includes("SolidWorks Add-in 實機驗證"),
    blocker: "SolidWorks Add-in real-machine evidence is not ready."
  },
  {
    key: "restore_drill",
    evidenceKey: "restoreReady",
    matcher: (line) => line.includes("離線單向備份與還原"),
    blocker: "Restore drill evidence is not ready."
  },
  {
    key: "document_manager_component",
    evidenceKey: "documentManagerReady",
    matcher: (line) => line.includes("SolidWorks Document Manager API 或等效授權元件"),
    blocker: "Document Manager or equivalent component evidence is not ready."
  },
  {
    key: "formal_field_test",
    evidenceKey: "fieldTestReady",
    matcher: (line) => line.includes("正式現場測試"),
    blocker: "Formal field-test evidence is not ready."
  },
  {
    key: "document_manager_integration",
    evidenceKey: "documentManagerReady",
    matcher: (line) => line.includes("整合 SolidWorks Document Manager API"),
    blocker: "Document Manager or equivalent component evidence is not ready."
  },
  {
    key: "document_manager_license",
    evidenceKey: "documentManagerReady",
    matcher: (line) => line.includes("確認 SolidWorks Document Manager 授權"),
    blocker: "Document Manager or equivalent component evidence is not ready."
  }
];

function parseArgs(argv) {
  const options = {
    taskFile: path.join(root, "PDM_dev_task.md"),
    output: "",
    evidenceFixture: "",
    apply: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--task-file") {
      options.taskFile = path.resolve(root, argv[++index] ?? "");
    } else if (arg === "--output") {
      options.output = path.resolve(root, argv[++index] ?? "");
    } else if (arg === "--evidence-fixture") {
      options.evidenceFixture = path.resolve(root, argv[++index] ?? "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function getSolidWorksEvidence() {
  const reportPath = findLatestSwAddinReport(root);
  if (!reportPath) {
    return { ready: false, reportPath: null, issues: [{ type: "missing_report" }] };
  }

  return {
    ...validateSwAddinReport(readSwAddinReport(reportPath)),
    reportPath
  };
}

function getDocumentManagerEvidence() {
  const reportPath = findLatestDocumentManagerReport(root);
  if (!reportPath) {
    return { ready: false, reportPath: null, issues: [{ type: "missing_report" }] };
  }

  return {
    ...validateDocumentManagerReport(readDocumentManagerReport(reportPath)),
    reportPath
  };
}

function loadEvidence(options) {
  if (options.evidenceFixture) {
    const fixture = JSON.parse(fs.readFileSync(options.evidenceFixture, "utf8"));
    const solidWorksReady = fixture.solidWorksReady === true;
    const restoreReady = fixture.restoreReady === true;
    const documentManagerReady = fixture.documentManagerReady === true;
    const fieldTestReady = fixture.fieldTestReady ?? (solidWorksReady && restoreReady && documentManagerReady);
    return {
      source: path.relative(root, options.evidenceFixture),
      solidWorksReady,
      restoreReady,
      documentManagerReady,
      fieldTestReady: fieldTestReady === true
    };
  }

  const solidWorks = getSolidWorksEvidence();
  const restore = getRestoreDrillReportEvidence(root);
  const documentManager = getDocumentManagerEvidence();
  return {
    source: "latest evidence reports",
    solidWorksReady: solidWorks.ready === true,
    restoreReady: restore.ready === true,
    documentManagerReady: documentManager.ready === true,
    fieldTestReady: solidWorks.ready === true && restore.ready === true && documentManager.ready === true,
    reports: {
      solidWorks: solidWorks.reportPath ? path.relative(root, solidWorks.reportPath) : null,
      restore: restore.reportPath ? path.relative(root, restore.reportPath) : null,
      documentManager: documentManager.reportPath ? path.relative(root, documentManager.reportPath) : null
    }
  };
}

function findTarget(line) {
  return targets.find((target) => target.matcher(line)) ?? null;
}

function syncMarkdown(markdown, evidence) {
  const changes = [];
  const blocked = [];
  const unsafeCompleted = [];
  const seenKeys = new Set();

  const lines = markdown.split(/\r?\n/);
  const updatedLines = lines.map((line, index) => {
    const target = findTarget(line);
    if (!target) return line;

    seenKeys.add(target.key);
    const match = line.match(/^(\s*-\s+\[)(x| |\/)(\]\s+.+)$/u);
    if (!match) {
      blocked.push({
        line: index + 1,
        key: target.key,
        reason: "Target line did not match checkbox format."
      });
      return line;
    }

    const statusToken = match[2];
    const ready = evidence[target.evidenceKey] === true;
    if (statusToken === "x") {
      if (!ready) {
        unsafeCompleted.push({
          line: index + 1,
          key: target.key,
          reason: target.blocker
        });
      }
      return line;
    }

    if (!ready) {
      blocked.push({
        line: index + 1,
        key: target.key,
        reason: target.blocker
      });
      return line;
    }

    const nextLine = `${match[1]}x${match[3]}`;
    changes.push({
      line: index + 1,
      key: target.key,
      from: statusToken === "/" ? "[/]" : "[ ]",
      to: "[x]"
    });
    return nextLine;
  });

  for (const target of targets) {
    if (!seenKeys.has(target.key)) {
      blocked.push({
        line: null,
        key: target.key,
        reason: "Target task line was not found."
      });
    }
  }

  return {
    markdown: updatedLines.join("\n"),
    changes,
    blocked,
    unsafeCompleted
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.taskFile)) {
    throw new Error(`Task file not found: ${path.relative(root, options.taskFile)}`);
  }

  const original = fs.readFileSync(options.taskFile, "utf8");
  const evidence = loadEvidence(options);
  const result = syncMarkdown(original, evidence);
  const writePath = options.output || options.taskFile;
  const shouldWrite = options.apply && result.changes.length > 0;

  if (shouldWrite) {
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, result.markdown, "utf8");
  }

  const report = {
    readyToApply: result.changes.length > 0 && result.blocked.length === 0 && result.unsafeCompleted.length === 0,
    applied: shouldWrite,
    taskFile: path.relative(root, options.taskFile),
    output: shouldWrite ? path.relative(root, writePath) : "",
    evidence,
    changes: result.changes,
    blocked: result.blocked,
    unsafeCompleted: result.unsafeCompleted
  };

  console.log(JSON.stringify(report, null, 2));

  if (result.unsafeCompleted.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
