#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { findLatestRestoreDrillReport, readRestoreDrillReport } from "./restore-drill-report-utils.mjs";
import { findLatestReport as findLatestSwReport, readReport as readSwReport } from "./sw-addin-report-utils.mjs";
import { findLatestReport as findLatestDocumentManagerReport, readReport as readDocumentManagerReport } from "./document-manager-report-utils.mjs";
import { getFieldTestHandoffsDir, getRestoreHandoffsDir, resolveUserPath } from "./pdm-paths.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const handoffId = makeHandoffId();
const outputRoot = args.output ? resolveUserPath(root, args.output) : getFieldTestHandoffsDir(root);
const outputDir = path.join(outputRoot, handoffId);
const restoreReportPath = args.restoreReport ? path.resolve(args.restoreReport) : findLatestRestoreDrillReport(root);
const swReportPath = args.swReport ? path.resolve(args.swReport) : findLatestSwReport(root);
const documentManagerReportPath = args.documentManagerReport
  ? path.resolve(args.documentManagerReport)
  : findLatestDocumentManagerReport(root);
const restoreHandoffPath = args.restoreHandoff
  ? resolveUserPath(root, args.restoreHandoff)
  : findLatestRestoreHandoff(root);

function parseArgs(argv) {
  const parsed = {
    output: "",
    restoreReport: "",
    restoreHandoff: "",
    swReport: "",
    documentManagerReport: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.output = argv[++index] ?? "";
    else if (arg === "--restore-report") parsed.restoreReport = argv[++index] ?? "";
    else if (arg === "--restore-handoff") parsed.restoreHandoff = argv[++index] ?? "";
    else if (arg === "--sw-report") parsed.swReport = argv[++index] ?? "";
    else if (arg === "--document-manager-report") parsed.documentManagerReport = argv[++index] ?? "";
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function makeHandoffId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function toPortableSlash(value) {
  return value.replaceAll(path.sep, "/");
}

function assertFile(filePath, message) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(message);
    process.exit(1);
  }
}

function assertDirectory(dirPath, message) {
  if (!dirPath || !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    console.error(message);
    process.exit(1);
  }
}

function findLatestRestoreHandoff(appRoot) {
  const handoffRoot = getRestoreHandoffsDir(appRoot);
  if (!fs.existsSync(handoffRoot)) return "";

  return fs.readdirSync(handoffRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(handoffRoot, entry.name))
    .filter((dirPath) => fs.existsSync(path.join(dirPath, "restore-on-test-machine.ps1")))
    .sort((left, right) => right.localeCompare(left))
    .at(0) ?? "";
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return null;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function copyDirectory(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  return targetPath;
}

function rel(filePath) {
  return toPortableSlash(path.relative(root, filePath));
}

function handoffRel(filePath) {
  return toPortableSlash(path.relative(outputDir, filePath));
}

function powershellSingleQuoted(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildCommands(restoreReport, swReport, documentManagerReport) {
  const restoreJson = rel(restoreReport.path);
  const swJson = rel(swReport.path);
  const documentManagerJson = rel(documentManagerReport.path);
  const fieldIssuesTemplate = rel(path.join(outputDir, "field-issues-template.json"));
  const fieldIssuesActual = rel(path.join(outputDir, "field-issues.json"));
  const documentManagerUpgrade = [
    "npm.cmd run document-manager:report:upgrade --",
    `  --report ${powershellSingleQuoted(documentManagerJson)}`
  ].join(" `\n");

  return {
    restoreFillTemplate: [
      "npm.cmd run backup:restore-drill-report:fill --",
      `  --report ${powershellSingleQuoted(restoreJson)} --auto-env`,
      '  --tester "<tester name>"',
      "  --test-date 2026-05-25",
      '  --snapshot-id "<snapshotId>"',
      '  --snapshot-path "D:\\AI_PDM_BACKUPS\\<snapshotId>"',
      '  --handoff-path "D:\\AI_PDM_HANDOFF\\<snapshotId>"',
      '  --target-dir "D:\\AI_PDM_RESTORE\\manual-restore"',
      '  --signed-off-by "QC Lead"',
      "  --signed-off-at 2026-05-25",
      "  --final-result pass",
      '  --evidence "Independent test machine completed restore-on-test-machine.ps1 successfully."',
      '  --command "restore-on-test-machine.ps1"',
      "  --mark-all-pass"
    ].join(" `\n"),
    swFillTemplate: [
      "npm.cmd run sw-addin:report:fill --",
      `  --report ${powershellSingleQuoted(swJson)} --auto-env`,
      '  --tester "<tester name>"',
      "  --test-date 2026-05-25",
      "  --windows-version Win11",
      "  --solidworks-version 2025",
      "  --dotnet48-installed true",
      "  --backend-url http://127.0.0.1:3000",
      "  --test-account manager@example.com",
      '  --test-machine-type "CAD workstation"',
      '  --addin-build-path "C:\\AI_PDM\\AiPdmAddin.dll"',
      "  --addin-version 0.1.0",
      '  --signed-off-by "SW QC Lead"',
      "  --signed-off-at 2026-05-25",
      "  --final-result pass",
      '  --evidence "Win11 / SolidWorks 2025 CAD workstation completed the required cases."',
      '  --backend-submission-id "<SUB-xxxx>"',
      "  --mark-all-pass",
      "  --mark-optional-not-applicable"
    ].join(" `\n"),
    documentManagerUpgrade,
    documentManagerFillTemplate: [
      "npm.cmd run document-manager:report:fill --",
      `  --report ${powershellSingleQuoted(documentManagerJson)}`,
      '  --tester "<tester name>"',
      "  --test-date 2026-05-27",
      '  --component-name "SolidWorks Document Manager or approved equivalent extractor"',
      '  --component-version "<component version>"',
      '  --license-owner "<license owner or internal approval reference>"',
      '  --deployment-host "<web/windows host name>"',
      '  --extractor-command "<metadata extractor executable>"',
      '  --extractor-args \'["--file","{file}"]\'',
      '  --reference-extractor-command "<reference extractor executable or same as metadata>"',
      '  --reference-extractor-args \'["--file","{file}"]\'',
      '  --extractor-probe-path "data/document-manager-probes/<probeId>/probe.json"',
      "  --backend-url http://127.0.0.1:3000",
      '  --sample-files-path "<folder containing .sldprt/.sldasm/.slddrw samples>"',
      '  --signed-off-by "Document Manager QC Lead"',
      "  --signed-off-at 2026-05-27",
      "  --final-result pass",
      '  --evidence "Extractor probe passed and licensed/equivalent extractor returned native CAD metadata/reference evidence."',
      '  --sample-file "<sample CAD file set>"',
      '  --backend-submission-id "<SUB-xxxx>"',
      "  --mark-all-pass"
    ].join(" `\n"),
    documentManagerProbe: [
      '$ErrorActionPreference = "Stop"',
      "npm.cmd run document-manager:extractor:probe -- --latest-report",
      ""
    ].join("\r\n"),
    fieldIssuesImport: [
      '$ErrorActionPreference = "Stop"',
      `$IssueFile = ${powershellSingleQuoted(fieldIssuesActual)}`,
      `if (-not (Test-Path $IssueFile)) { $IssueFile = ${powershellSingleQuoted(fieldIssuesTemplate)} }`,
      "npm.cmd run field-test:issues:import -- --issues $IssueFile --write",
      "npm.cmd run qc:defects-zero",
      ""
    ].join("\r\n"),
    swBuildAndRegister: [
      '$ErrorActionPreference = "Stop"',
      "npm.cmd run field-test:preflight -- --profile cad",
      "npm.cmd run qc:sw-addin-build",
      '.\\scripts\\register-sw-addin.ps1',
      ""
    ].join("\r\n"),
    swUnregister: [
      '$ErrorActionPreference = "Stop"',
      '.\\scripts\\unregister-sw-addin.ps1',
      ""
    ].join("\r\n"),
    cadPreflight: [
      '$ErrorActionPreference = "Stop"',
      "npm.cmd run field-test:preflight -- --profile cad",
      ""
    ].join("\r\n"),
    documentManagerPreflight: [
      '$ErrorActionPreference = "Stop"',
      "npm.cmd run field-test:preflight -- --profile document-manager",
      documentManagerUpgrade,
      ""
    ].join("\r\n"),
    restorePreflight: [
      '$ErrorActionPreference = "Stop"',
      "npm.cmd run field-test:preflight -- --profile restore",
      ""
    ].join("\r\n")
  };
}

function buildFieldIssuesTemplate(id) {
  return {
    schemaVersion: "1.0",
    fieldTestId: id,
    source: "Formal field test execution",
    instructions: [
      "Copy this file to field-issues.json when field testing finds issues.",
      "Leave issues empty if no field issues were found.",
      "Active P0/P1 issues require reproductionSteps, expected, actual, owner, and evidence.",
      "Run commands/field-issues-import.ps1 from the project root after editing field-issues.json."
    ],
    issues: [],
    exampleIssue: {
      id: `FIELD-${id}-001`,
      defectId: `DEF-FIELD-${id}-001`,
      title: "<short issue title>",
      priority: "P1",
      status: "open",
      owner: "<owner>",
      evidence: "<report path, screenshot path, log path, or signed finding>",
      reproductionSteps: [
        "<step 1>",
        "<step 2>",
        "<step 3>"
      ],
      expected: "<expected result>",
      actual: "<actual result>",
      environment: "<machine / OS / role / browser or SolidWorks version>",
      relatedEvidence: []
    }
  };
}

function buildReadme(handoff) {
  return [
    "# AI PDM Field Test Handoff",
    "",
    `Handoff ID: \`${handoff.handoffId}\``,
    `Generated at: \`${handoff.generatedAt}\``,
    "",
    "## Purpose",
    "",
    "This package tells the field tester exactly which evidence must be produced before production readiness can pass.",
    "",
    "## Current Readiness Blockers",
    "",
    "1. Independent restore drill on a separate Windows test machine.",
    "2. SolidWorks Add-in real-machine build, registration, and workflow test.",
    "3. Document Manager or approved equivalent extractor deployment evidence.",
    "",
    "## Files",
    "",
    `- Restore drill report source: \`${handoff.restoreReport.source}\``,
    `- Restore drill report copy: \`${handoff.restoreReport.copy}\``,
    `- Restore execution handoff source: \`${handoff.restoreHandoff.source}\``,
    `- Restore execution handoff copy: \`${handoff.restoreHandoff.copy}\``,
    `- SolidWorks report source: \`${handoff.solidWorksReport.source}\``,
    `- SolidWorks report copy: \`${handoff.solidWorksReport.copy}\``,
    `- Document Manager report source: \`${handoff.documentManagerReport.source}\``,
    `- Document Manager report copy: \`${handoff.documentManagerReport.copy}\``,
    "- `commands/restore-preflight.ps1`: restore test machine environment preflight.",
    "- `commands/restore-fill-template.ps1`: copy/edit command for restore report fill.",
    "- `commands/sw-addin-preflight.ps1`: CAD workstation environment preflight.",
    "- `commands/sw-addin-build-and-register.ps1`: build and register the SolidWorks Add-in from Administrator PowerShell.",
    "- `commands/sw-addin-fill-template.ps1`: copy/edit command for SolidWorks report fill.",
    "- `commands/sw-addin-unregister.ps1`: remove the SolidWorks Add-in registration after testing.",
    "- `commands/document-manager-preflight.ps1`: Document Manager evidence template preflight and upgrade.",
    "- `commands/document-manager-probe.ps1`: run the deployed extractor against the report sample folder.",
    "- `commands/document-manager-fill-template.ps1`: copy/edit command for Document Manager evidence report fill.",
    "- `field-issues-template.json`: template for field issues that must become defect-register items.",
    "- `commands/field-issues-import.ps1`: imports field issues into `data/quality/defect-register.json` and runs the P0/P1 defect-zero gate.",
    "- `qc-checklist.ps1`: final QC commands after all evidence reports are filled.",
    "",
    "## Step 1: Independent Restore Drill",
    "",
    "Before executing the restore drill, run the restore preflight from the project root:",
    "",
    "```powershell",
    `.\\${handoff.commands.restorePreflightFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Run the existing restore handoff on a separate Windows test machine. After it passes, run this from the project root and edit placeholders:",
    "",
    "```powershell",
    `.\\${handoff.commands.restoreExecutionFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Then fill the readiness report from the project root:",
    "",
    "```powershell",
    `.\\${handoff.commands.restoreFillTemplateFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "## Step 2: SolidWorks Add-in Real-Machine Test",
    "",
    "Before registering the Add-in, run the CAD preflight from Administrator PowerShell:",
    "",
    "```powershell",
    `.\\${handoff.commands.swAddinPreflightFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "On the CAD workstation, compile/register/load the Add-in in SolidWorks 2025. After the cases pass, run this from the project root and edit placeholders:",
    "",
    "```powershell",
    `.\\${handoff.commands.swAddinBuildAndRegisterFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Then fill the SolidWorks evidence report:",
    "",
    "```powershell",
    `.\\${handoff.commands.swAddinFillTemplateFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "## Step 3: Document Manager / Equivalent Extractor Evidence",
    "",
    "Before filling the report, run:",
    "",
    "```powershell",
    `.\\${handoff.commands.documentManagerPreflightFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "After the licensed component or approved equivalent extractor is deployed, edit the placeholders in the report fill command with the deployed command, args, and real CAD sample folder.",
    "",
    "Run the extractor probe after the report has those environment fields:",
    "",
    "```powershell",
    `.\\${handoff.commands.documentManagerProbeFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Then fill the evidence report and include the probe output path in the evidence text:",
    "",
    "```powershell",
    `.\\${handoff.commands.documentManagerFillTemplateFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "## Step 4: Field Issue Intake",
    "",
    "If the field execution finds issues, copy `field-issues-template.json` to `field-issues.json`, fill every issue, then run:",
    "",
    "```powershell",
    `.\\${handoff.commands.fieldIssuesImportFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Active P0/P1 field issues intentionally make `qc:defects-zero` fail until the defect is closed or verified.",
    "",
    "## Step 5: Final QC",
    "",
    "```powershell",
    `.\\${handoff.commands.qcChecklistFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Production readiness is expected to remain blocked until all external evidence reports are filled with real evidence.",
    ""
  ].join("\n");
}

function buildQcChecklist(fieldIssuesCommandFromRoot) {
  return [
    '$ErrorActionPreference = "Stop"',
    "npm.cmd run qc:restore-drill-report",
    "npm.cmd run qc:sw-addin-real-machine-report",
    "npm.cmd run document-manager:extractor:probe -- --latest-report",
    "npm.cmd run qc:document-manager-report",
    `.\\${fieldIssuesCommandFromRoot.replaceAll("/", "\\")}`,
    "npm.cmd run qc:defects-zero",
    "npm.cmd run field-test:preflight -- --profile all --require-evidence",
    "npm.cmd run qc:production-readiness:report",
    ""
  ].join("\r\n");
}

assertFile(restoreReportPath, "No restore drill report found. Run npm.cmd run backup:restore-drill-report:new first.");
assertDirectory(restoreHandoffPath, "No restore handoff package found. Run npm.cmd run backup:handoff first.");
assertFile(swReportPath, "No SolidWorks Add-in report found. Run npm.cmd run sw-addin:report:new first.");
assertFile(documentManagerReportPath, "No Document Manager evidence report found. Run npm.cmd run document-manager:report:new first.");

const restoreReport = {
  path: restoreReportPath,
  data: readRestoreDrillReport(restoreReportPath)
};
const swReport = {
  path: swReportPath,
  data: readSwReport(swReportPath)
};
const documentManagerReport = {
  path: documentManagerReportPath,
  data: readDocumentManagerReport(documentManagerReportPath)
};
const commands = buildCommands(restoreReport, swReport, documentManagerReport);

fs.mkdirSync(outputDir, { recursive: true });
const copiedRestoreJson = copyIfExists(restoreReportPath, path.join(outputDir, "reports", "restore-drill-report.json"));
copyIfExists(restoreReportPath.replace(/\.json$/u, ".md"), path.join(outputDir, "reports", "restore-drill-report.md"));
const copiedRestoreHandoffDir = copyDirectory(restoreHandoffPath, path.join(outputDir, "restore-handoff"));
const copiedSwJson = copyIfExists(swReportPath, path.join(outputDir, "reports", "sw-addin-report.json"));
copyIfExists(swReportPath.replace(/\.json$/u, ".md"), path.join(outputDir, "reports", "sw-addin-report.md"));
const copiedDocumentManagerJson = copyIfExists(documentManagerReportPath, path.join(outputDir, "reports", "document-manager-report.json"));
copyIfExists(documentManagerReportPath.replace(/\.json$/u, ".md"), path.join(outputDir, "reports", "document-manager-report.md"));

fs.mkdirSync(path.join(outputDir, "commands"), { recursive: true });
fs.writeFileSync(path.join(outputDir, "commands", "restore-preflight.ps1"), commands.restorePreflight, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "restore-fill-template.ps1"), `${commands.restoreFillTemplate}\r\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "sw-addin-preflight.ps1"), commands.cadPreflight, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "sw-addin-build-and-register.ps1"), commands.swBuildAndRegister, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "sw-addin-fill-template.ps1"), `${commands.swFillTemplate}\r\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "sw-addin-unregister.ps1"), commands.swUnregister, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "document-manager-preflight.ps1"), commands.documentManagerPreflight, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "document-manager-probe.ps1"), commands.documentManagerProbe, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "document-manager-fill-template.ps1"), `${commands.documentManagerFillTemplate}\r\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "field-issues-import.ps1"), commands.fieldIssuesImport, "utf8");
fs.writeFileSync(path.join(outputDir, "field-issues-template.json"), `${JSON.stringify(buildFieldIssuesTemplate(handoffId), null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "qc-checklist.ps1"), buildQcChecklist(rel(path.join(outputDir, "commands", "field-issues-import.ps1"))), "utf8");

const handoff = {
  handoffId,
  generatedAt: new Date().toISOString(),
  outputDir,
  restoreReport: {
    reportId: restoreReport.data.reportId,
    status: restoreReport.data.status,
    source: rel(restoreReportPath),
    copy: handoffRel(copiedRestoreJson)
  },
  restoreHandoff: {
    source: rel(restoreHandoffPath),
    copy: handoffRel(copiedRestoreHandoffDir)
  },
  solidWorksReport: {
    reportId: swReport.data.reportId,
    status: swReport.data.status,
    source: rel(swReportPath),
    copy: handoffRel(copiedSwJson)
  },
  documentManagerReport: {
    reportId: documentManagerReport.data.reportId,
    status: documentManagerReport.data.status,
    source: rel(documentManagerReportPath),
    copy: handoffRel(copiedDocumentManagerJson)
  },
  fieldIssues: {
    template: handoffRel(path.join(outputDir, "field-issues-template.json")),
    expectedRuntimeFile: "field-issues.json"
  },
  commands: {
    restorePreflight: handoffRel(path.join(outputDir, "commands", "restore-preflight.ps1")),
    restoreFillTemplate: handoffRel(path.join(outputDir, "commands", "restore-fill-template.ps1")),
    swAddinPreflight: handoffRel(path.join(outputDir, "commands", "sw-addin-preflight.ps1")),
    swAddinBuildAndRegister: handoffRel(path.join(outputDir, "commands", "sw-addin-build-and-register.ps1")),
    swAddinFillTemplate: handoffRel(path.join(outputDir, "commands", "sw-addin-fill-template.ps1")),
    swAddinUnregister: handoffRel(path.join(outputDir, "commands", "sw-addin-unregister.ps1")),
    documentManagerPreflight: handoffRel(path.join(outputDir, "commands", "document-manager-preflight.ps1")),
    documentManagerProbe: handoffRel(path.join(outputDir, "commands", "document-manager-probe.ps1")),
    documentManagerFillTemplate: handoffRel(path.join(outputDir, "commands", "document-manager-fill-template.ps1")),
    fieldIssuesImport: handoffRel(path.join(outputDir, "commands", "field-issues-import.ps1")),
    qcChecklist: handoffRel(path.join(outputDir, "qc-checklist.ps1")),
    restorePreflightFromRoot: rel(path.join(outputDir, "commands", "restore-preflight.ps1")),
    restoreFillTemplateFromRoot: rel(path.join(outputDir, "commands", "restore-fill-template.ps1")),
    restoreExecutionFromRoot: rel(path.join(outputDir, "restore-handoff", "restore-on-test-machine.ps1")),
    swAddinPreflightFromRoot: rel(path.join(outputDir, "commands", "sw-addin-preflight.ps1")),
    swAddinBuildAndRegisterFromRoot: rel(path.join(outputDir, "commands", "sw-addin-build-and-register.ps1")),
    swAddinFillTemplateFromRoot: rel(path.join(outputDir, "commands", "sw-addin-fill-template.ps1")),
    swAddinUnregisterFromRoot: rel(path.join(outputDir, "commands", "sw-addin-unregister.ps1")),
    documentManagerPreflightFromRoot: rel(path.join(outputDir, "commands", "document-manager-preflight.ps1")),
    documentManagerProbeFromRoot: rel(path.join(outputDir, "commands", "document-manager-probe.ps1")),
    documentManagerFillTemplateFromRoot: rel(path.join(outputDir, "commands", "document-manager-fill-template.ps1")),
    fieldIssuesImportFromRoot: rel(path.join(outputDir, "commands", "field-issues-import.ps1")),
    qcChecklistFromRoot: rel(path.join(outputDir, "qc-checklist.ps1"))
  }
};

fs.writeFileSync(path.join(outputDir, "field-test-handoff.json"), `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "README.md"), buildReadme(handoff), "utf8");

console.log(JSON.stringify({
  handoffId,
  outputDir,
  files: [
    rel(path.join(outputDir, "field-test-handoff.json")),
    rel(path.join(outputDir, "README.md")),
    rel(path.join(outputDir, "commands", "restore-preflight.ps1")),
    rel(path.join(outputDir, "commands", "restore-fill-template.ps1")),
    rel(path.join(outputDir, "commands", "sw-addin-preflight.ps1")),
    rel(path.join(outputDir, "commands", "sw-addin-build-and-register.ps1")),
    rel(path.join(outputDir, "commands", "sw-addin-fill-template.ps1")),
    rel(path.join(outputDir, "commands", "sw-addin-unregister.ps1")),
    rel(path.join(outputDir, "commands", "document-manager-preflight.ps1")),
    rel(path.join(outputDir, "commands", "document-manager-probe.ps1")),
    rel(path.join(outputDir, "commands", "document-manager-fill-template.ps1")),
    rel(path.join(outputDir, "commands", "field-issues-import.ps1")),
    rel(path.join(outputDir, "field-issues-template.json")),
    rel(path.join(outputDir, "qc-checklist.ps1"))
  ],
  reports: {
    restore: handoff.restoreReport,
    solidWorks: handoff.solidWorksReport,
    documentManager: handoff.documentManagerReport
  },
  restoreHandoff: handoff.restoreHandoff,
  commands: {
    restoreExecution: handoffRel(path.join(outputDir, "restore-handoff", "restore-on-test-machine.ps1")),
    restorePreflight: handoff.commands.restorePreflight,
    restoreReportFill: handoff.commands.restoreFillTemplate,
    solidWorksPreflight: handoff.commands.swAddinPreflight,
    solidWorksBuildAndRegister: handoff.commands.swAddinBuildAndRegister,
    solidWorksReportFill: handoff.commands.swAddinFillTemplate,
    solidWorksUnregister: handoff.commands.swAddinUnregister,
    documentManagerPreflight: handoff.commands.documentManagerPreflight,
    documentManagerProbe: handoff.commands.documentManagerProbe,
    documentManagerReportFill: handoff.commands.documentManagerFillTemplate,
    fieldIssuesImport: handoff.commands.fieldIssuesImport,
    finalQc: handoff.commands.qcChecklist
  }
}, null, 2));
