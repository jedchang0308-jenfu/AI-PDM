#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { getFieldTestHandoffsDir } from "./pdm-paths.mjs";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function findLatestHandoff() {
  const handoffDir = getFieldTestHandoffsDir(root);
  if (!fs.existsSync(handoffDir)) return null;
  const entries = fs
    .readdirSync(handoffDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(handoffDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return entries[0] ?? null;
}

function assertFile(baseDir, relativePath, label = relativePath) {
  const filePath = path.join(baseDir, relativePath);
  record(`FIELD-HANDOFF file exists: ${label}`, fs.existsSync(filePath) && fs.statSync(filePath).isFile(), relative(filePath));
}

function assertDirectory(baseDir, relativePath, label = relativePath) {
  const dirPath = path.join(baseDir, relativePath);
  record(`FIELD-HANDOFF directory exists: ${label}`, fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(), relative(dirPath));
}

const latest = findLatestHandoff();
record("FIELD-HANDOFF-001 latest handoff package exists", Boolean(latest), latest ? relative(latest) : "missing");

if (latest) {
  const latestRelative = relative(latest);
  const manifestPath = path.join(latest, "field-test-handoff.json");
  assertFile(latest, "field-test-handoff.json");
  assertFile(latest, "README.md");
  assertFile(latest, "qc-checklist.ps1");

  const manifest = fs.existsSync(manifestPath) ? readProjectJson(root, relative(manifestPath)) : {};
  record("FIELD-HANDOFF-002 manifest has handoffId", /^\d{8}-\d{6}$/u.test(String(manifest.handoffId ?? "")), String(manifest.handoffId ?? ""));
  record("FIELD-HANDOFF-003 manifest has generatedAt", Boolean(Date.parse(String(manifest.generatedAt ?? ""))), String(manifest.generatedAt ?? ""));

  for (const [key, commandPath] of Object.entries(manifest.commands ?? {})) {
    if (!key.endsWith("FromRoot")) continue;
    const absoluteCommandPath = path.resolve(root, String(commandPath));
    record(`FIELD-HANDOFF command exists: ${key}`, fs.existsSync(absoluteCommandPath), relative(absoluteCommandPath));
  }

  for (const filePath of [
    "commands/restore-preflight.ps1",
    "commands/restore-fill-template.ps1",
    "commands/sw-addin-preflight.ps1",
    "commands/sw-addin-build-and-register.ps1",
    "commands/sw-addin-fill-template.ps1",
    "commands/sw-addin-unregister.ps1",
    "commands/document-manager-preflight.ps1",
    "commands/document-manager-probe.ps1",
    "commands/document-manager-fill-template.ps1",
    "commands/field-issues-import.ps1",
    "field-issues-template.json",
    "reports/restore-drill-report.json",
    "reports/sw-addin-report.json",
    "reports/document-manager-report.json"
  ]) {
    assertFile(latest, filePath);
  }

  assertDirectory(latest, "restore-handoff");
  assertFile(latest, "restore-handoff/README.md");
  assertFile(latest, "restore-handoff/restore-on-test-machine.ps1");
  assertFile(latest, "restore-handoff/restore-handoff.json");

  const checklistPath = path.join(latest, "qc-checklist.ps1");
  const checklist = fs.existsSync(checklistPath) ? readProjectFile(root, relative(checklistPath)) : "";
  for (const command of [
    "npm.cmd run qc:restore-drill-report",
    "npm.cmd run qc:sw-addin-real-machine-report",
    "npm.cmd run document-manager:extractor:probe -- --latest-report",
    "npm.cmd run qc:document-manager-report",
    "field-issues-import.ps1",
    "npm.cmd run qc:defects-zero",
    "npm.cmd run field-test:preflight -- --profile all --require-evidence",
    "npm.cmd run qc:production-readiness:report"
  ]) {
    record(`FIELD-HANDOFF final checklist includes: ${command}`, checklist.includes(command));
  }

  const fieldIssuesTemplatePath = path.join(latest, "field-issues-template.json");
  const fieldIssuesTemplate = fs.existsSync(fieldIssuesTemplatePath) ? readProjectJson(root, relative(fieldIssuesTemplatePath)) : {};
  record(
    "FIELD-HANDOFF-004 manifest records field issue template",
    manifest.fieldIssues?.template === "field-issues-template.json",
    JSON.stringify(manifest.fieldIssues ?? null)
  );
  record(
    "FIELD-HANDOFF-005 field issue template has matching fieldTestId",
    fieldIssuesTemplate.fieldTestId === manifest.handoffId,
    String(fieldIssuesTemplate.fieldTestId ?? "")
  );
  record(
    "FIELD-HANDOFF-006 field issue template starts empty and importable",
    Array.isArray(fieldIssuesTemplate.issues) && fieldIssuesTemplate.issues.length === 0 && Boolean(fieldIssuesTemplate.exampleIssue),
    JSON.stringify({ issues: fieldIssuesTemplate.issues, hasExample: Boolean(fieldIssuesTemplate.exampleIssue) })
  );

  for (const docPath of [
    ".ai-doc/reports/pm/external-evidence-handoff-checklist-2026-05-27.md",
    ".ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md",
    ".ai-doc/qc/qc-active-goal-remaining-blockers-report-2026-06-02.md"
  ]) {
    const absoluteDocPath = path.join(root, docPath);
    const content = fs.existsSync(absoluteDocPath) ? readProjectFile(root, relative(absoluteDocPath)) : "";
    const referencedHandoffs = [...content.matchAll(/data[\\/]+field-test-handoffs[\\/]+(\d{8}-\d{6})/gu)].map((match) => match[1]);
    const staleHandoffs = referencedHandoffs.filter((handoffId) => handoffId !== path.basename(latest));
    record(`FIELD-HANDOFF doc references latest package: ${docPath}`, content.includes(latestRelative), docPath);
    record(`FIELD-HANDOFF doc has no stale package id: ${docPath}`, staleHandoffs.length === 0, JSON.stringify(staleHandoffs));
  }
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
