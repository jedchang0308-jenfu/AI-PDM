#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import Database from "better-sqlite3";

const root = process.cwd();
const primaryPath = path.join(root, "data", "ai-pdm.sqlite");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-part-recognition-ui-"));
const repositoryDir = path.join(taskRoot, "repository");
const fixturePath = path.join(taskRoot, "ai-pdm.sqlite");
const distDirRelative = `.tmp/next-qc-part-recognition-${crypto.randomUUID()}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
fs.mkdirSync(repositoryDir, { recursive: true });

function protectedSnapshot() {
  const database = new Database(primaryPath, { readonly: true, fileMustExist: true });
  try {
    const scalar = (sql) => Number(database.prepare(sql).get().count);
    const quarantineColumns = new Set(database.prepare("PRAGMA table_info(pdm_workbench_migration_quarantine)").all().map((row) => String(row.name)));
    const unresolved = quarantineColumns.has("resolution_status")
      ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution_status='unresolved'")
      : quarantineColumns.has("resolution")
        ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution IS NULL OR TRIM(resolution)='' OR resolution='unresolved'")
        : scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine");
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name").all(),
      identities: {
        roots: database.prepare("SELECT id,company_id,root_code,record_status FROM part_roots ORDER BY company_id,root_code,id").all(),
        parts: database.prepare("SELECT id,company_id,part_root_id,part_number,record_status FROM part_numbers ORDER BY company_id,part_number,id").all(),
        drawings: database.prepare("SELECT id,company_id,part_root_id,formal_drawing_number_id,drawing_number,lifecycle_state FROM drawings ORDER BY company_id,drawing_number,id").all()
      },
      masterCounts: { roots: scalar("SELECT COUNT(*) AS count FROM part_roots"), parts: scalar("SELECT COUNT(*) AS count FROM part_numbers"), drawings: scalar("SELECT COUNT(*) AS count FROM drawings") },
      unresolvedMigrationResidue: unresolved,
      brokenRootReferences: {
        parts: scalar("SELECT COUNT(*) AS count FROM part_numbers child LEFT JOIN part_roots root ON root.id=child.part_root_id AND root.company_id=child.company_id WHERE child.part_root_id IS NOT NULL AND root.id IS NULL"),
        drawings: scalar("SELECT COUNT(*) AS count FROM drawings child LEFT JOIN part_roots root ON root.id=child.part_root_id AND root.company_id=child.company_id WHERE child.part_root_id IS NOT NULL AND root.id IS NULL")
      },
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload };
  } finally { database.close(); }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function portReleased(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

const before = protectedSnapshot();
if (Object.values(before.payload.masterCounts).some((count) => count <= 0)
  || before.payload.unresolvedMigrationResidue !== 0
  || Object.values(before.payload.brokenRootReferences).some((count) => count !== 0)
  || before.payload.foreignKeys.length !== 0) throw new Error(`PRIMARY_PREFLIGHT_FAILED:${JSON.stringify(before.payload)}`);

const source = new Database(primaryPath, { readonly: true, fileMustExist: true });
await source.backup(fixturePath);
source.close();
const fixture = new Database(fixturePath);
fixture.pragma("foreign_keys = ON");
fixture.prepare("UPDATE users SET password_hash=NULL, account_status='active', system_role_enabled=1 WHERE email='admin@example.com'").run();
fixture.prepare("UPDATE auth_identities SET status='active' WHERE login_identifier='admin@example.com'").run();
if (fixture.pragma("foreign_key_check").length !== 0) throw new Error("FIXTURE_FOREIGN_KEY_FAILED");
fixture.close();

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    PDM_AUTH_MODE: "demo",
    PDM_AUTH_SECRET: "qc-part-recognition-ui-secret",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: taskRoot,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_DRAWING_RECOGNITION_V1: "true",
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_NEXT_DIST_DIR: distDirRelative
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "A0044-P01 part recognition entry, impact preview, formalization and return-path browser QC",
  port,
  baseUrl,
  owningProcessTree: `runtime ${process.pid} -> Next dev ${child.pid}`,
  cleanupCondition: "browser evidence complete or launcher interrupted",
  PDM_DATA_DIR: taskRoot,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: [taskRoot, distDir],
  fixtureMutationLedger: ["enable isolated local admin identity", "browser formalization of isolated A0044-P01 recognition"]
} }));

let stderr = "";
child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-6000); });
child.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));

const deadline = Date.now() + 90_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${baseUrl}/login`);
    if (response.status < 500) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 400));
}
if (Date.now() >= deadline) throw new Error(`UI_RUNTIME_START_TIMEOUT:${stderr}`);
console.log(`QC_PART_RECOGNITION_UI_READY ${baseUrl}`);

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
  const releaseDeadline = Date.now() + 8_000;
  while (!(await portReleased(port)) && Date.now() < releaseDeadline) await new Promise((resolve) => setTimeout(resolve, 100));
  const released = await portReleased(port);
  const after = protectedSnapshot();
  for (const target of [distDir, taskRoot]) {
    const resolved = path.resolve(target);
    const allowed = resolved.startsWith(`${path.resolve(root, ".tmp")}${path.sep}`) || resolved.startsWith(path.resolve(os.tmpdir()));
    if (!allowed) throw new Error(`UNSAFE_CLEANUP_TARGET:${resolved}`);
    if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  }
  const clean = !fs.existsSync(taskRoot) && !fs.existsSync(distDir);
  console.log(`QC_PART_RECOGNITION_UI_CLEANUP portReleased=${released} primaryUnchanged=${before.hash === after.hash} pathsRemoved=${clean}`);
  process.exit(code || (!released || before.hash !== after.hash || !clean ? 1 : 0));
}

process.on("SIGINT", () => { void stop(0); });
process.on("SIGTERM", () => { void stop(0); });
child.once("exit", (code) => { if (!stopping) void stop(code ?? 1); });
await new Promise(() => {});
