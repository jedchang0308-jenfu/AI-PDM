#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const evidenceRoot = path.join(root, "output", "qa", "dev-112-three-view-modes");
const runId = `DEV112-aggregate-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(evidenceRoot, runId);
fs.mkdirSync(outputDir, { recursive: true });

function latestManifest(fileName) {
  const candidates = [];
  if (!fs.existsSync(evidenceRoot)) throw new Error(`DEV112_EVIDENCE_ROOT_MISSING:${evidenceRoot}`);
  for (const entry of fs.readdirSync(evidenceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(evidenceRoot, entry.name, fileName);
    if (fs.existsSync(filePath)) candidates.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!candidates[0]) throw new Error(`DEV112_${fileName.replaceAll("-", "_").toUpperCase()}_MISSING`);
  return { path: candidates[0].filePath, value: JSON.parse(fs.readFileSync(candidates[0].filePath, "utf8")) };
}

function sameDbInvariant(before, after) {
  return Boolean(before && after)
    && before.schemaHash === after.schemaHash
    && before.canonicalIdentityHash === after.canonicalIdentityHash
    && JSON.stringify(before.rootCounts) === JSON.stringify(after.rootCounts)
    && JSON.stringify(before.rootReferenceOrphans) === JSON.stringify(after.rootReferenceOrphans)
    && JSON.stringify(before.migrationResidue) === JSON.stringify(after.migrationResidue)
    && JSON.stringify(before.foreignKeys) === JSON.stringify(after.foreignKeys)
    && after.foreignKeys.length === 0;
}

function sameCandidate(contractValue, browserValue) {
  const contractFiles = contractValue?.dirtyFileSha256 ?? {};
  const browserFiles = browserValue?.dirtyFileSha256 ?? {};
  const sameKeys = Object.keys(contractFiles).length > 0
    && Object.keys(contractFiles).length === Object.keys(browserFiles).length
    && Object.keys(contractFiles).every((file) => contractFiles[file] === browserFiles[file]);
  return contractValue?.gitSha === browserValue?.gitSha
    && contractValue?.branch === browserValue?.branch
    && sameKeys;
}

function runCommand(id, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024 });
  fs.writeFileSync(path.join(outputDir, `${id}.stdout.log`), result.stdout ?? "", "utf8");
  fs.writeFileSync(path.join(outputDir, `${id}.stderr.log`), `${result.stderr ?? ""}${result.error ? `\n${result.error.stack ?? result.error}` : ""}`, "utf8");
  const pass = result.status === 0 && !result.error;
  console.log(`${pass ? "PASS" : "FAIL"} ${id}`);
  return { id, pass, command, args, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null };
}

const contract = latestManifest("contract-manifest.json");
const browser = latestManifest("browser-manifest.json");
const candidateMatch = sameCandidate(contract.value, browser.value);
const expectedIds = Array.from({ length: 24 }, (_, index) => `TVM-${String(index + 1).padStart(3, "0")}`);
const observedIds = (browser.value.caseResults ?? []).map((item) => item.id);
const duplicateIds = observedIds.filter((id, index) => observedIds.indexOf(id) !== index);
const exactDenominator = observedIds.length === expectedIds.length
  && new Set(observedIds).size === expectedIds.length
  && expectedIds.every((id) => observedIds.includes(id));

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = [
  runCommand("command-qc-dev-065-contract", npmCommand, ["run", "qc:dev-065:contract"]),
  runCommand("command-typecheck-app", npmCommand, ["run", "typecheck:app"]),
  runCommand("command-build-isolated", npmCommand, ["run", "build:isolated"])
];

const primaryInvariant = sameDbInvariant(browser.value.sourceInvariant?.before, browser.value.sourceInvariant?.after);
const fixtureInvariant = sameDbInvariant(browser.value.fixtureInvariant?.before, browser.value.fixtureInvariant?.after);
const cleanupPass = browser.value.cleanup?.portReleased === true
  && browser.value.cleanup?.tempRootRemoved === true
  && browser.value.cleanup?.nextDistRemoved === true
  && (browser.value.supportingChecks ?? []).filter((item) => item.id.startsWith("SUP-"))
    .every((item) => item.pass);
const commandPass = commands.every((item) => item.pass);
const aggregate = {
  devId: "DEV-112",
  runId,
  status: browser.value.passed && contract.value.passed && candidateMatch && exactDenominator && primaryInvariant && fixtureInvariant && cleanupPass && commandPass ? "PASS" : "FAIL",
  readiness: "RD Implementation Ready / QA-QC Complete / Release Gated",
  fixedDenominator: { expectedIds, observedIds, duplicateIds, exact: exactDenominator },
  sourceManifests: { contract: contract.path, browser: browser.path },
  gates: {
    contract: contract.value.passed === true,
    browser: browser.value.passed === true,
    candidateMatch,
    primaryInvariant,
    fixtureInvariant,
    cleanupPass,
    commandPass,
    productionConnection: false,
    productionWrites: false
  },
  commandResults: commands,
  securityProbes: browser.value.securityProbes,
  screenshots: browser.value.screenshots,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(outputDir, "aggregate-manifest.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
console.log(`DEV-112 aggregate manifest: ${path.relative(root, path.join(outputDir, "aggregate-manifest.json"))}`);
if (aggregate.status !== "PASS") process.exitCode = 1;
