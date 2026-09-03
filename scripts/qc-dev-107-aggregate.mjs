#!/usr/bin/env node

/* DEV-107 fixed-denominator acceptance runner.
 * Every provider/browser process is task-owned; no production connection is
 * supplied. Child manifests are collected under one immutable evidence root.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = process.env.DEV107_RUN_ID ?? `DEV107-aggregate-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV107_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-107", runId));
fs.mkdirSync(evidenceRoot, { recursive: true });

const expected = Array.from({ length: 38 }, (_, index) => `QA-107-${String(index + 1).padStart(3, "0")}`);
const childDefinitions = [
  { name: "contract", script: "scripts/qc-dev-107-contract.mjs", args: [], evidence: "contract" },
  { name: "migration", script: "scripts/qc-dev-107-migration.mjs", args: [], evidence: "migration" },
  { name: "repository", script: "scripts/qc-dev-107-repository.mjs", args: ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"], evidence: "repository" },
  { name: "postgres", script: "scripts/qc-dev-107-postgres.mjs", args: ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"], evidence: "postgres" },
  { name: "browser", script: "scripts/qc-dev-107-browser.mjs", args: [], evidence: "browser" }
];
const children = [];
for (const definition of childDefinitions) {
  const childEvidence = path.join(evidenceRoot, definition.evidence);
  fs.mkdirSync(childEvidence, { recursive: true });
  const childEnv = {
    ...process.env,
    // Repository/PG/browser runners append their own provider directory;
    // contract/migration runners write directly to the supplied directory.
    DEV107_EVIDENCE_DIR: ["repository", "postgres", "browser"].includes(definition.name) ? evidenceRoot : childEvidence,
    DATABASE_URL: "",
    PDM_POSTGRES_URL: "",
    PDM_RELEASE_MODE: "local_stub"
  };
  const result = spawnSync(process.execPath, [...definition.args, definition.script], {
    cwd: root,
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  fs.writeFileSync(path.join(childEvidence, "runner.stdout.log"), stdout);
  fs.writeFileSync(path.join(childEvidence, "runner.stderr.log"), stderr);
  children.push({ name: definition.name, evidence: childEvidence, exitCode: result.status, signal: result.signal, status: result.status === 0 ? "PASS" : "FAIL" });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} child ${definition.name}`);
}

const manifests = [];
for (const child of children) {
  const manifestPath = path.join(child.evidence, "manifest.json");
  if (fs.existsSync(manifestPath)) manifests.push(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
  else if (child.name === "contract") {
    const reportPath = path.join(child.evidence, "contract-report.json");
    if (fs.existsSync(reportPath)) manifests.push({ dev: "DEV-107", runner: "qc-dev-107-contract", status: child.status, expectedCaseIds: expected.slice(0, 8), results: expected.slice(0, 8).map((caseId) => ({ caseId, status: child.status })) });
  }
}

const observed = manifests.flatMap((manifest) => manifest.results ?? manifest.checks ?? []).map((item) => item.caseId ?? item.id).filter(Boolean);
const unique = new Set(observed);
const childPass = children.every((child) => child.status === "PASS");
const exactDenominator = expected.every((caseId) => unique.has(caseId)) && unique.size === expected.length && observed.length === expected.length;
const cleanupPass = manifests.every((manifest) => Object.values(manifest.cleanup ?? {}).every(Boolean));
const sourceInvariantPass = manifests.filter((manifest) => manifest.sourceUnchanged !== undefined).every((manifest) => manifest.sourceUnchanged === true);
const aggregate = {
  dev: "DEV-107",
  runner: "qc-dev-107-aggregate",
  runId,
  status: childPass && exactDenominator && cleanupPass && sourceInvariantPass ? "PASS" : "FAIL",
  fixedDenominator: expected.length,
  expected,
  observed,
  duplicateCaseIds: observed.filter((caseId, index) => observed.indexOf(caseId) !== index),
  children,
  manifests: manifests.map((manifest) => ({ runner: manifest.runner, runId: manifest.runId, status: manifest.status, sourceUnchanged: manifest.sourceUnchanged, cleanup: manifest.cleanup })),
  gates: { childPass, exactDenominator, cleanupPass, sourceInvariantPass, productionConnection: false, primaryWrites: false },
  evidenceRoot,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(evidenceRoot, "manifest.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
console.log(JSON.stringify(aggregate, null, 2));
if (aggregate.status !== "PASS") process.exitCode = 1;
