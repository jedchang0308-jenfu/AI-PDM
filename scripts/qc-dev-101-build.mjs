#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { removeTaskOwnedWorkspaceTempDir } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = process.env.DEV101_SUPPORT_RUN_ID?.trim() || `DEV101-BUILD-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const runtimeRoot = path.join(root, ".tmp", `qc-dev101-build-runtime-project-${crypto.randomUUID()}`);
const dataDir = path.join(runtimeRoot, ".runtime-data");
const repositoryDir = path.join(dataDir, "repository");
const outputDir = path.resolve(process.env.DEV101_SUPPORT_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-101", runId));
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");

function stableHash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function primaryFingerprint() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
      drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: stableHash(payload), foreignKeys: payload.foreignKeys };
  } finally { database.close(); }
}

function prepareRuntimeProject() {
  const workspaceTemp = path.resolve(root, ".tmp");
  const resolved = path.resolve(runtimeRoot);
  if (!resolved.startsWith(`${workspaceTemp}${path.sep}`) || !path.basename(resolved).startsWith("qc-dev101-build-runtime-project-")) throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${resolved}`);
  fs.mkdirSync(resolved, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolved, file));
  }
  for (const file of [".env", ".env.local", ".env.production.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolved, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolved, directory), { recursive: true, force: true });
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolved, "node_modules"), "junction");
  fs.mkdirSync(repositoryDir, { recursive: true });
}

const primaryBefore = primaryFingerprint();
let execution = null;
let artifactReady = false;
let cleanup = { removed: false, path: runtimeRoot, error: "not-run" };
try {
  prepareRuntimeProject();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    runtimeProject: runtimeRoot,
    purpose: "DEV-101 production build in a task-owned source/Next-metadata/data copy",
    port: "none",
    owningProcessTree: `build runner ${process.pid} -> one Next build child`,
    cleanupCondition: "build exits, artifact is checked, primary invariant is compared, runtime project is removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: runtimeRoot
  } }));
  const nextCli = path.join(runtimeRoot, "node_modules", "next", "dist", "bin", "next");
  execution = spawnSync(process.execPath, [nextCli, "build"], {
    cwd: runtimeRoot,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 96 * 1024 * 1024,
    env: {
      ...process.env,
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_NEXT_DIST_DIR: ".tmp/dev101-build",
      PDM_NEXT_TSCONFIG_PATH: "tsconfig.next.json",
      PDM_BUILD_COMMIT: "local-dev"
    }
  });
  process.stdout.write(execution.stdout || "");
  process.stderr.write(execution.stderr || "");
  artifactReady = fs.existsSync(path.join(runtimeRoot, ".tmp", "dev101-build", "BUILD_ID"));
} finally {
  cleanup = removeTaskOwnedWorkspaceTempDir(root, runtimeRoot);
}
const primaryAfter = primaryFingerprint();
const primaryUnchanged = primaryAfter.hash === primaryBefore.hash && primaryBefore.foreignKeys.length === 0 && primaryAfter.foreignKeys.length === 0;
const pass = execution?.status === 0 && artifactReady && primaryUnchanged && cleanup.removed;
const report = {
  dev: "DEV-101", runId, evidenceClass: "RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC", result: pass ? "PASS" : "FAIL",
  build: { exitCode: execution?.status ?? null, artifactReady }, primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: primaryUnchanged }, cleanup,
  completedAt: new Date().toISOString()
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`DEV-101 isolated build: ${report.result} — artifact=${artifactReady}; primary=${primaryUnchanged}; cleanup=${cleanup.removed}`);
if (!pass) process.exitCode = 1;
