#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = `DEV096-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV096_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-096-aggregate", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev096-aggregate-"));
const reports = [];
fs.mkdirSync(evidenceRoot, { recursive: true });

function run(label, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  reports.push({ label, status: result.status ?? 1, signal: result.signal ?? null });
  return result.status === 0;
}

function isolated(label) {
  const base = path.join(taskRoot, label);
  const dataDir = path.join(base, "data");
  const repositoryDir = path.join(base, "repository");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  const env = {
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_DB_PROVIDER: "sqlite",
    PDM_ASSEMBLY_SHARED_BOM_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true",
    DEV096_EVIDENCE_DIR: evidenceRoot
  };
  if (!run(`${label}:init`, ["scripts/init-db.mjs"], env)) throw new Error(`${label} schema initialization failed`);
  return env;
}

let firstFailure = null;
try {
  if (!run("contract", ["scripts/qc-dev-096-contract.mjs"], { DEV096_EVIDENCE_DIR: evidenceRoot })) throw new Error("contract failed");
  const repositoryEnv = isolated("repository");
  if (!run("repository", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-096-repository.mjs"], repositoryEnv)) throw new Error("repository failed");
  const mutationEnv = isolated("mutation");
  if (!run("mutation", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-096-mutation.ts"], mutationEnv)) throw new Error("mutation failed");
  const faultsEnv = isolated("faults");
  if (!run("faults", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-096-faults.ts"], faultsEnv)) throw new Error("fault matrix failed");
  const consumerEnv = isolated("consumers");
  if (!run("consumers", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-096-consumers.mjs"], consumerEnv)) throw new Error("consumers failed");

  const migrationBase = path.join(taskRoot, "migration");
  fs.mkdirSync(path.join(migrationBase, "data"), { recursive: true });
  fs.mkdirSync(path.join(migrationBase, "repository"), { recursive: true });
  if (!run("migration", ["scripts/qc-dev-096-migration.mjs"], {
    PDM_DATA_DIR: path.join(migrationBase, "data"),
    PDM_REPOSITORY_DIR: path.join(migrationBase, "repository"),
    DEV096_EVIDENCE_DIR: evidenceRoot,
    DEV096_RUN_ID: runId
  })) throw new Error("migration failed");

  if (process.env.DEV096_POSTGRES_DSN) {
    if (!run("postgres", ["scripts/qc-dev-096-postgres.mjs"], { DEV096_EVIDENCE_DIR: evidenceRoot })) throw new Error("postgres failed");
  } else {
    reports.push({ label: "postgres", status: "BLOCKED", reason: "DEV096_POSTGRES_DSN_REQUIRED" });
  }
  if (!run("browser", ["scripts/qc-dev-096-browser.mjs"], { DEV096_EVIDENCE_DIR: path.join(evidenceRoot, "browser") })) throw new Error("browser failed");
  if (!run("typecheck", [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"])) throw new Error("typecheck failed");
} catch (error) {
  firstFailure = error instanceof Error ? error.message : String(error);
}

const evidenceFiles = ["contract.json", "repository.json", "mutation.json", "postgres-mutation.json", "faults.json", "consumers.json", "postgres.json"]
  .map((name) => path.join(evidenceRoot, name))
  .concat(path.join(evidenceRoot, "migration", "migration.json"), path.join(evidenceRoot, "browser", "browser.json"));
const evidence = evidenceFiles.filter(fs.existsSync).map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
const passedCases = new Set(evidence.filter((item) => item.status === "PASS").flatMap((item) => item.cases ?? []));
const missingCases = Array.from({ length: 88 }, (_, index) => index + 1).filter((id) => !passedCases.has(id));
const blocked = reports.filter((report) => report.status === "BLOCKED");
const failed = reports.filter((report) => typeof report.status === "number" && report.status !== 0);
const result = {
  runner: "aggregate",
  status: !firstFailure && !blocked.length && !failed.length && missingCases.length === 0 ? "PASS" : "FAIL",
  runId,
  productionWrites: false,
  runtime: { project: root, purpose: "DEV-096 fresh aggregate", taskRoot, cleanupCondition: "all child runtimes stopped and task-owned temp removed" },
  firstFailure,
  reports,
  denominator: 88,
  pass: passedCases.size,
  fail: failed.length,
  blocked: blocked.length,
  notRun: missingCases.length,
  missingCases
};
fs.writeFileSync(path.join(evidenceRoot, "aggregate.json"), `${JSON.stringify(result, null, 2)}\n`);
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); } catch {}
console.log(JSON.stringify({ runner: result.runner, status: result.status, pass: result.pass, denominator: result.denominator, fail: result.fail, blocked: result.blocked, notRun: result.notRun }));
if (result.status !== "PASS") process.exitCode = 1;
