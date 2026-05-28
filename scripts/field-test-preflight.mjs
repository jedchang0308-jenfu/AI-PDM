#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  findLatestRestoreDrillReport,
  readRestoreDrillReport,
  validateRestoreDrillReport
} from "./restore-drill-report-utils.mjs";
import {
  findLatestReport as findLatestSwReport,
  readReport as readSwReport,
  validateReport as validateSwReport
} from "./sw-addin-report-utils.mjs";
import {
  findLatestReport as findLatestDocumentManagerReport,
  readReport as readDocumentManagerReport,
  validateReport as validateDocumentManagerReport
} from "./document-manager-report-utils.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const checks = [];

function parseArgs(argv) {
  const parsed = { profile: "all", requireEvidence: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--profile") parsed.profile = argv[++index] ?? "";
    else if (arg === "--require-evidence") parsed.requireEvidence = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!["all", "cad", "restore", "document-manager"].includes(parsed.profile)) {
    console.error("Invalid --profile. Expected one of: all, cad, restore, document-manager");
    process.exit(1);
  }

  return parsed;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim()
  };
}

function findCommand(command) {
  if (process.platform !== "win32") return command;
  const result = run("where.exe", [command]);
  if (result.status !== 0) return command;
  return result.stdout.split(/\r?\n/u).find(Boolean) ?? command;
}

function addCheck(id, scope, passed, detail = "", severity = "error") {
  checks.push({ id, scope, passed, severity, detail });
}

function evidenceSummary(validation) {
  const issueCount = Array.isArray(validation?.issues) ? validation.issues.length : 0;
  return `ready=${Boolean(validation?.ready)} issues=${issueCount}`;
}

function findMsBuild() {
  const candidates = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\MSBuild.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\MSBuild.exe"
  ];
  return candidates.find(fileExists) ?? "";
}

function findSolidWorksInteropDir() {
  const envDir = process.env.SOLIDWORKS_INTEROP_DIR;
  if (envDir && fileExists(path.join(envDir, "SolidWorks.Interop.sldworks.dll"))) return envDir;

  const candidates = [
    "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS",
    "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\api\\redist",
    path.join(root, "lib")
  ];
  return candidates.find((dirPath) => fileExists(path.join(dirPath, "SolidWorks.Interop.sldworks.dll"))) ?? "";
}

function isAdministrator() {
  if (process.platform !== "win32") return false;
  const result = run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
  ]);
  return result.stdout.toLowerCase() === "true";
}

function versionOf(command, commandArgs) {
  const result = run(command, commandArgs);
  if (result.status !== 0) return "";
  return result.stdout.split(/\r?\n/u).at(0) ?? "";
}

function versionOfWindowsBatch(command, commandArgs) {
  const quotedCommand = `"${command.replaceAll('"', '""')}"`;
  const joinedArgs = commandArgs.map((arg) => `"${arg.replaceAll('"', '""')}"`).join(" ");
  const result = run("cmd.exe", ["/d", "/c", `${quotedCommand} ${joinedArgs}`]);
  if (result.status !== 0) return "";
  return result.stdout.split(/\r?\n/u).at(0) ?? "";
}

function latestRestoreHandoff() {
  const handoffRoot = path.join(root, "data", "restore-handoffs");
  if (!dirExists(handoffRoot)) return "";

  return fs.readdirSync(handoffRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(handoffRoot, entry.name))
    .filter((dirPath) => fileExists(path.join(dirPath, "restore-on-test-machine.ps1")))
    .sort((left, right) => right.localeCompare(left))
    .at(0) ?? "";
}

function runCommonChecks() {
  const npmCommand = findCommand(process.platform === "win32" ? "npm.cmd" : "npm");
  const nodeVersion = versionOf("node", ["--version"]);
  const npmExecPath = process.env.npm_execpath && fileExists(process.env.npm_execpath)
    ? process.env.npm_execpath
    : "";
  const npmVersion = npmExecPath
    ? versionOf(process.execPath, [npmExecPath, "--version"])
    : process.platform === "win32"
      ? versionOfWindowsBatch(npmCommand, ["--version"])
    : versionOf(npmCommand, ["--version"]);

  addCheck("COMMON-OS-001", "common", process.platform === "win32", `platform=${process.platform}`);
  addCheck("COMMON-FILE-001", "common", fileExists(path.join(root, "package.json")), "package.json");
  addCheck("COMMON-NODE-001", "common", Boolean(nodeVersion), nodeVersion || "node not found");
  addCheck("COMMON-NPM-001", "common", Boolean(npmVersion), npmVersion || "npm not found");
}

function runCadChecks() {
  const msbuild = findMsBuild();
  const interopDir = findSolidWorksInteropDir();
  const net48Reference = "C:\\Program Files (x86)\\Reference Assemblies\\Microsoft\\Framework\\.NETFramework\\v4.8\\mscorlib.dll";
  const swReportPath = findLatestSwReport(root);

  addCheck("CAD-NET48-001", "cad", fileExists(net48Reference), net48Reference);
  addCheck("CAD-MSBUILD-001", "cad", Boolean(msbuild), msbuild || "MSBuild.exe not found");
  addCheck("CAD-SW-001", "cad", Boolean(interopDir), interopDir || "SolidWorks.Interop.sldworks.dll not found");
  addCheck("CAD-PROJ-001", "cad", fileExists(path.join(root, "sw-addin", "AiPdmAddin.sln")), "sw-addin/AiPdmAddin.sln");
  addCheck("CAD-SCRIPT-001", "cad", fileExists(path.join(root, "scripts", "register-sw-addin.ps1")), "scripts/register-sw-addin.ps1");
  addCheck("CAD-SCRIPT-002", "cad", fileExists(path.join(root, "scripts", "unregister-sw-addin.ps1")), "scripts/unregister-sw-addin.ps1");
  addCheck("CAD-REPORT-001", "cad", Boolean(swReportPath), swReportPath || "No SolidWorks real-machine report found");
  if (args.requireEvidence && swReportPath) {
    const validation = validateSwReport(readSwReport(swReportPath));
    addCheck("CAD-EVIDENCE-001", "cad", validation.ready, evidenceSummary(validation));
  }
  addCheck("CAD-ADMIN-001", "cad", isAdministrator(), "Administrator PowerShell is required for COM registration", "warning");
}

function runRestoreChecks() {
  const restoreReportPath = findLatestRestoreDrillReport(root);
  const handoffPath = latestRestoreHandoff();

  addCheck("RESTORE-SCRIPT-001", "restore", fileExists(path.join(root, "scripts", "restore-backup.mjs")), "scripts/restore-backup.mjs");
  addCheck("RESTORE-SCRIPT-002", "restore", fileExists(path.join(root, "scripts", "verify-backup.mjs")), "scripts/verify-backup.mjs");
  addCheck("RESTORE-HANDOFF-001", "restore", Boolean(handoffPath), handoffPath || "No restore handoff found");
  addCheck("RESTORE-REPORT-001", "restore", Boolean(restoreReportPath), restoreReportPath || "No restore drill report found");
  if (args.requireEvidence && restoreReportPath) {
    const validation = validateRestoreDrillReport(readRestoreDrillReport(restoreReportPath));
    addCheck("RESTORE-EVIDENCE-001", "restore", validation.ready, evidenceSummary(validation));
  }
}

function runDocumentManagerChecks() {
  const documentManagerReportPath = findLatestDocumentManagerReport(root);

  addCheck("DM-SCRIPT-001", "document-manager", fileExists(path.join(root, "scripts", "upgrade-document-manager-report.mjs")), "scripts/upgrade-document-manager-report.mjs");
  addCheck("DM-SCRIPT-002", "document-manager", fileExists(path.join(root, "scripts", "qc-document-manager-report.mjs")), "scripts/qc-document-manager-report.mjs");
  addCheck("DM-SCRIPT-003", "document-manager", fileExists(path.join(root, "scripts", "probe-document-manager-extractor.mjs")), "scripts/probe-document-manager-extractor.mjs");
  addCheck("DM-REPORT-001", "document-manager", Boolean(documentManagerReportPath), documentManagerReportPath || "No Document Manager evidence report found");
  if (args.requireEvidence && documentManagerReportPath) {
    const validation = validateDocumentManagerReport(readDocumentManagerReport(documentManagerReportPath));
    addCheck("DM-EVIDENCE-001", "document-manager", validation.ready, evidenceSummary(validation));
  }
}

runCommonChecks();
if (["all", "cad"].includes(args.profile)) runCadChecks();
if (["all", "restore"].includes(args.profile)) runRestoreChecks();
if (["all", "document-manager"].includes(args.profile)) runDocumentManagerChecks();

const errors = checks.filter((check) => check.severity === "error" && !check.passed);
const warnings = checks.filter((check) => check.severity === "warning" && !check.passed);
const summary = {
  ready: errors.length === 0,
  profile: args.profile,
  requireEvidence: args.requireEvidence,
  checkedAt: new Date().toISOString(),
  passed: checks.filter((check) => check.passed).length,
  failed: errors.length,
  warnings: warnings.length,
  checks
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ready) {
  process.exitCode = 1;
}
