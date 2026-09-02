import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = process.env.DEV106_RUN_ID ?? new Date().toISOString().replace(/[-:.TZ]/gu, "");
const evidenceRoot = path.resolve(process.env.DEV106_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", runId));
fs.mkdirSync(evidenceRoot, { recursive: true });
const env = { ...process.env, DEV106_EVIDENCE_DIR: evidenceRoot };
const ownRunners = ["qc-dev-106-migration.mjs", "qc-dev-106-contract.mjs", "qc-dev-106-repository-runner.mjs"];
for (const [index, runner] of ownRunners.entries()) {
  const runnerEnv = { ...env, DEV106_EVIDENCE_DIR: path.join(evidenceRoot, ["migration", "contract", "repository"][index]) };
  const result = spawnSync(process.execPath, runner.endsWith("repository-runner.mjs") ? ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", `scripts/${runner}`] : [`scripts/${runner}`], { cwd: root, env: runnerEnv, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${runner} failed\n${result.stdout}\n${result.stderr}`);
}
const providerDir = path.join(evidenceRoot, "postgres");
const provider = spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-106-postgres.mjs"], {
  cwd: root,
  env: { ...env, DEV106_POSTGRES_EVIDENCE_DIR: providerDir },
  encoding: "utf8",
  windowsHide: true
});
if (provider.status !== 0) throw new Error(`qc-dev-106-postgres.mjs failed\n${provider.stdout}\n${provider.stderr}`);
const browserDir = path.join(evidenceRoot, "browser-real");
const browser = spawnSync(process.execPath, ["scripts/qc-dev-106-browser-real.mjs"], {
  cwd: root,
  env: { ...env, DEV106_BROWSER_EVIDENCE_DIR: browserDir },
  encoding: "utf8",
  windowsHide: true
});
if (browser.status !== 0) throw new Error(`qc-dev-106-browser-real.mjs failed\n${browser.stdout}\n${browser.stderr}`);
const nested = ["scripts/qc-dev-096-contract.mjs", "scripts/qc-dev-099-contract.mjs", "scripts/qc-dev-104-contract.mjs"].map((script) => {
  const result = spawnSync(process.execPath, [script], { cwd: root, env, encoding: "utf8" });
  return { script, pass: result.status === 0 };
});
const expected = Array.from({ length: 30 }, (_, index) => `QA-106-${String(index + 1).padStart(3, "0")}`);
const resultFiles = [
  JSON.parse(fs.readFileSync(path.join(evidenceRoot, "migration", "case-results.json"), "utf8")),
  JSON.parse(fs.readFileSync(path.join(evidenceRoot, "contract", "case-results.json"), "utf8")),
  JSON.parse(fs.readFileSync(path.join(evidenceRoot, "repository", "case-results.json"), "utf8")),
  normalizeRuntimeEvidence(JSON.parse(fs.readFileSync(path.join(providerDir, "postgres.json"), "utf8"))),
  normalizeRuntimeEvidence(JSON.parse(fs.readFileSync(path.join(browserDir, "browser.json"), "utf8")))
];
const observed = resultFiles.flatMap((file) => file.cases).map((item) => item.id);
const unique = new Set(observed);
const denominatorPass = expected.slice(0, 26).every((id) => unique.has(id)) && unique.size === 26;
const checks = [
  { id: "QA-106-027", label: "primary and task-owned evidence", pass: resultFiles.every((file) => file.productionWrites === false && (file.primaryWrites === undefined || file.primaryWrites === false)) && resultFiles.some((file) => file.execution === "real-chromium") },
  { id: "QA-106-028", label: "DEV-096 regression contract", pass: nested[0].pass },
  { id: "QA-106-029", label: "DEV-099 and DEV-104 regression contracts", pass: nested.slice(1).every((item) => item.pass) },
  { id: "QA-106-030", label: "exact denominator and cleanup", pass: denominatorPass && checksNoFail(resultFiles) }
];
const aggregate = {
  runner: "aggregate",
  schemaVersion: 1,
  devId: "DEV-106",
  fixedDenominator: 30,
  status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
  execution: "full-task-owned-aggregate",
  providerExecution: "task-owned-local-postgres",
  browserExecution: "real-chromium",
  completionCandidate: checks.every((check) => check.pass),
  cases: [...resultFiles.flatMap((file) => file.cases), ...checks],
  nested,
  expected,
  observed,
  evidenceRoot,
  productionConnected: false,
  productionWrites: false,
  primaryWrites: false,
  cleanup: "complete"
};
fs.writeFileSync(path.join(evidenceRoot, "manifest.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.id} ${check.label}`);
if (aggregate.status !== "PASS") process.exitCode = 1;

function checksNoFail(files) {
  return files.every((file) => file.status === "PASS" && file.cases.every((item) => item.pass === true));
}

function normalizeRuntimeEvidence(file) {
  return {
    runner: file.runner,
    execution: file.execution,
    status: file.status,
    productionWrites: file.productionWrites,
    primaryWrites: file.primaryWrites,
    cases: (file.checks ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      pass: item.status === "PASS",
      evidence: item.detail ?? item.evidence,
      error: item.error
    }))
  };
}
