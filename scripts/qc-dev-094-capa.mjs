#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const runId = `DEV094-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-094", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev094-"));
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const recoveryScript = path.join(root, "scripts", "migrate-dev-094-root-recovery.mjs");
const initWorker = "scripts/qc-dev-094-init-worker.mjs";
const loader = "./scripts/qc-ts-path-loader.mjs";
const checks = [];
const failures = [];

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `:${detail}` : ""}`);
}

function readManifest(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
}

function runRecovery(databasePath, evidenceDir, extra = []) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  return spawnSync(process.execPath, [recoveryScript, `--db=${databasePath}`, `--output-dir=${evidenceDir}`, ...extra], {
    cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024
  });
}

async function sqliteBackup(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(targetPath);
  } finally {
    source.close();
  }
}

function createRecoveryFixture(databasePath) {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      DROP TABLE IF EXISTS part_numbers_company_scope_migration;
      DROP TABLE IF EXISTS part_roots_company_scope_migration;
      CREATE TABLE part_roots_company_scope_migration AS
        SELECT id, company_id, root_code, core_name, item_kind, record_status,
          rule_version_id, created_by, created_at, updated_at
        FROM part_roots;
      CREATE TABLE part_numbers_company_scope_migration AS
        SELECT id, company_id, part_root_id, part_number, sequence_no, sequence_code,
          part_name, item_kind, is_universal, bom_usage_policy, custom_specification,
          record_status, universal_reason, rule_version_id, created_by, created_at, updated_at
        FROM part_numbers;
      DELETE FROM part_numbers;
      DELETE FROM part_roots;
    `);
    database.exec("COMMIT");
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}

function databaseState(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const table = (name) => database.prepare(`SELECT * FROM ${name} ORDER BY id`).all();
    const payload = {
      roots: table("part_roots"), parts: table("part_numbers"), drawings: table("drawing_numbers"),
      foreignKeys: database.pragma("foreign_key_check"),
      residue: database.prepare(`SELECT name FROM sqlite_master WHERE type='table'
        AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration') ORDER BY name`).all()
    };
    return { ...payload, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  } finally {
    database.close();
  }
}

function worker(dataDir, extraEnv = {}) {
  return spawn(process.execPath, ["--experimental-transform-types", "--experimental-loader", loader, initWorker], {
    cwd: root,
    env: { ...process.env, PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: path.join(dataDir, "repository"), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function waitForWorker(child) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr, pid: child.pid }));
  });
}

async function createLegacyTemplate(templateDir) {
  fs.mkdirSync(templateDir, { recursive: true });
  const bootstrap = await waitForWorker(worker(templateDir));
  check("legacy template bootstrap succeeds", bootstrap.code === 0, bootstrap.stderr);
  const databasePath = path.join(templateDir, "ai-pdm.sqlite");
  const database = new Database(databasePath);
  database.pragma("foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    const rootSql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='part_roots'").get().sql
      .replace("CHECK (item_kind IN ('purchased', 'manufactured'))", "CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'custom'))");
    const partSql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='part_numbers'").get().sql
      .replace("CHECK (item_kind IN ('purchased', 'manufactured'))", "CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'custom'))");
    database.exec("DROP TABLE part_numbers");
    database.exec("DROP TABLE part_roots");
    database.exec(rootSql);
    database.exec(partSql);
    database.prepare(`INSERT INTO part_roots
      (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by,created_at,updated_at)
      VALUES ('dev094-root','company-jenfu','Z0094','DEV094 legacy root','outsourced','Active','numbering-rule-v3-alpha-root',NULL,'2026-08-24T00:00:00.000Z','2026-08-24T00:00:00.000Z')`).run();
    database.prepare(`INSERT INTO part_numbers
      (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,is_universal,bom_usage_policy,custom_specification,series_code,record_status,universal_reason,rule_version_id,created_by,created_at,updated_at)
      VALUES ('dev094-part','company-jenfu','dev094-root','Z0094-P01',1,'01','DEV094 legacy part','custom',0,'undecided',NULL,'SER','Active',NULL,'numbering-rule-v3-alpha-root',NULL,'2026-08-24T00:00:00.000Z','2026-08-24T00:00:00.000Z')`).run();
    database.exec("COMMIT");
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.pragma("foreign_keys = ON");
    database.close();
  }
  return databasePath;
}

async function concurrentInitialization(templateDb, processCount) {
  const dataDir = path.join(tempRoot, `concurrency-${processCount}`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(templateDb, path.join(dataDir, "ai-pdm.sqlite"));
  const children = Array.from({ length: processCount }, () => worker(dataDir));
  const results = await Promise.all(children.map(waitForWorker));
  check(`${processCount} process initializers all succeed`, results.every((result) => result.code === 0), JSON.stringify(results));
  const state = databaseState(path.join(dataDir, "ai-pdm.sqlite"));
  check(`${processCount} process root preserved and normalized`, state.roots.length === 1 && state.roots[0].id === "dev094-root" && state.roots[0].item_kind === "manufactured", JSON.stringify(state.roots));
  check(`${processCount} process part preserved including series`, state.parts.length === 1 && state.parts[0].id === "dev094-part" && state.parts[0].item_kind === "manufactured" && state.parts[0].series_code === "SER", JSON.stringify(state.parts));
  check(`${processCount} process foreign keys clean`, state.foreignKeys.length === 0, JSON.stringify(state.foreignKeys));
  check(`${processCount} process migration residue clean`, state.residue.length === 0, JSON.stringify(state.residue));
  check(`${processCount} process initializer lock released`, !fs.existsSync(`${path.join(dataDir, "ai-pdm.sqlite")}.init.lock`));
  return state.hash;
}

fs.mkdirSync(outputDir, { recursive: true });
let cleanupStatus = "pending";
try {
  const recoveryFixture = path.join(tempRoot, "recovery", "ai-pdm.sqlite");
  const sourceSnapshot = new Database(sourceDb, { readonly: true, fileMustExist: true });
  const expectedRecoveryCandidates = {
    roots: sourceSnapshot.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
    parts: sourceSnapshot.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count
  };
  sourceSnapshot.close();
  await sqliteBackup(sourceDb, recoveryFixture);
  createRecoveryFixture(recoveryFixture);
  const dryRunDir = path.join(outputDir, "recovery-dry-run");
  const dryRun = runRecovery(recoveryFixture, dryRunDir);
  const dryManifest = readManifest(dryRunDir);
  check("recovery dry-run ready", dryRun.status === 0 && dryManifest.status === "READY", `${dryRun.stdout}\n${dryRun.stderr}`);
  check("recovery dry-run captures 0/0 final and all source candidates", dryManifest.before.inventory.counts.finalRoots === 0 && dryManifest.before.inventory.counts.finalParts === 0 && dryManifest.before.inventory.counts.candidateRoots === Number(expectedRecoveryCandidates.roots) && dryManifest.before.inventory.counts.candidateParts === Number(expectedRecoveryCandidates.parts), JSON.stringify({ expectedRecoveryCandidates, actual: dryManifest.before.inventory.counts }));
  check("recovery dry-run captures dangling FK violations", dryManifest.before.inventory.counts.foreignKeys > 0, String(dryManifest.before.inventory.counts.foreignKeys));
  check("all dangling references covered by candidates", dryManifest.before.inventory.dangling.every((row) => row.coveredByCandidate), JSON.stringify(dryManifest.before.inventory.dangling));

  const failureFixture = path.join(tempRoot, "failure", "ai-pdm.sqlite");
  await sqliteBackup(recoveryFixture, failureFixture);
  const failureBefore = databaseState(failureFixture).hash;
  const failureDir = path.join(outputDir, "recovery-injected-failure");
  const failure = runRecovery(failureFixture, failureDir, ["--apply", "--confirm-dev-094-root-recovery", `--expected-fingerprint=${dryManifest.before.fingerprint}`, "--inject-failure=after-parts"]);
  check("injected recovery failure is blocked", failure.status === 2, `${failure.stdout}\n${failure.stderr}`);
  check("injected recovery failure rolls back exactly", databaseState(failureFixture).hash === failureBefore);

  const negativeFixture = path.join(tempRoot, "negative", "ai-pdm.sqlite");
  await sqliteBackup(recoveryFixture, negativeFixture);
  const negativeDatabase = new Database(negativeFixture);
  negativeDatabase.prepare("DELETE FROM part_roots_company_scope_migration WHERE root_code='A0005'").run();
  negativeDatabase.close();
  const negativeDir = path.join(outputDir, "recovery-negative-missing-candidate");
  const negative = runRecovery(negativeFixture, negativeDir);
  const negativeManifest = readManifest(negativeDir);
  check("missing recovery candidate fails closed", negative.status === 2 && negativeManifest.error.includes("DANGLING_REFERENCE_NOT_COVERED"), negativeManifest.error);

  const sourceGuard = spawnSync(process.execPath, [path.join(root, "scripts", "qc-dev-087-browser.mjs")], {
    cwd: root,
    env: { ...process.env, PDM_QC_SOURCE_DB: negativeFixture, PDM_QC_SOURCE_REPOSITORY: path.join(tempRoot, "empty-repository") },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  check("DEV-087 browser source guard fails before any fixture mutation", sourceGuard.status !== 0 && sourceGuard.stdout.includes('"sourceInvariantCheckedBeforeMutation": false') && sourceGuard.stdout.includes('"fixtureMutationLedger": []') && !sourceGuard.stdout.includes("QC DEV-087 runtime:"), `${sourceGuard.stdout}\n${sourceGuard.stderr}`);

  const applyDir = path.join(outputDir, "recovery-apply");
  const applied = runRecovery(recoveryFixture, applyDir, ["--apply", "--confirm-dev-094-root-recovery", `--expected-fingerprint=${dryManifest.before.fingerprint}`]);
  const applyManifest = readManifest(applyDir);
  check("disposable recovery apply passes", applied.status === 0 && applyManifest.status === "PASS", `${applied.stdout}\n${applied.stderr}`);
  const repaired = databaseState(recoveryFixture);
  check("disposable recovery restores exact source root and part counts", repaired.roots.length === Number(expectedRecoveryCandidates.roots) && repaired.parts.length === Number(expectedRecoveryCandidates.parts), JSON.stringify({ expectedRecoveryCandidates, actual: { roots: repaired.roots.length, parts: repaired.parts.length } }));
  check("disposable recovery clears all FK violations", repaired.foreignKeys.length === 0, JSON.stringify(repaired.foreignKeys));
  check("disposable recovery clears exact staging tables", repaired.residue.length === 0, JSON.stringify(repaired.residue));
  const rerunDir = path.join(outputDir, "recovery-rerun");
  const rerun = runRecovery(recoveryFixture, rerunDir);
  check("recovery rerun is no-op", rerun.status === 0 && readManifest(rerunDir).status === "NO_OP", rerun.stdout);

  const templateDir = path.join(tempRoot, "legacy-template");
  const templateDb = await createLegacyTemplate(templateDir);
  const hashes = [];
  for (const count of [2, 5, 11]) hashes.push(await concurrentInitialization(templateDb, count));
  check("2/5/11 concurrency outcomes identical", new Set(hashes).size === 1, JSON.stringify(hashes));

  const lockDataDir = path.join(tempRoot, "live-lock");
  fs.mkdirSync(lockDataDir, { recursive: true });
  fs.copyFileSync(templateDb, path.join(lockDataDir, "ai-pdm.sqlite"));
  const lockPath = `${path.join(lockDataDir, "ai-pdm.sqlite")}.init.lock`;
  fs.writeFileSync(lockPath, `${JSON.stringify({ token: "qc-live-owner", pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
  const blockedWorker = await waitForWorker(worker(lockDataDir, { PDM_SQLITE_INIT_LOCK_TIMEOUT_MS: "1000" }));
  check("live initializer lock is not stolen", blockedWorker.code !== 0 && fs.existsSync(lockPath) && blockedWorker.stderr.includes("PDM_SQLITE_INIT_LOCK_TIMEOUT"), blockedWorker.stderr);
  fs.unlinkSync(lockPath);

  const staleDataDir = path.join(tempRoot, "stale-lock");
  fs.mkdirSync(staleDataDir, { recursive: true });
  fs.copyFileSync(templateDb, path.join(staleDataDir, "ai-pdm.sqlite"));
  const staleLockPath = `${path.join(staleDataDir, "ai-pdm.sqlite")}.init.lock`;
  fs.writeFileSync(staleLockPath, `${JSON.stringify({ token: "qc-dead-owner", pid: 2147483647, acquiredAt: "2000-01-01T00:00:00.000Z" })}\n`, "utf8");
  const staleWorker = await waitForWorker(worker(staleDataDir));
  check("dead stale initializer lock recovers", staleWorker.code === 0 && !fs.existsSync(staleLockPath), `${staleWorker.stdout}\n${staleWorker.stderr}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedSystemTemp = path.resolve(os.tmpdir());
  if (!resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
    failures.push(`UNSAFE_TEMP_ROOT:${resolvedTempRoot}`);
  } else {
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    cleanupStatus = fs.existsSync(resolvedTempRoot) ? "failed" : "removed";
  }
}

const manifest = {
  devId: "DEV-094",
  capaId: "CAPA-PDM-2026-08-24-001",
  runId,
  generatedAt: new Date().toISOString(),
  sourceDatabaseMutation: false,
  productionConnected: false,
  productionMutation: false,
  status: failures.length === 0 && checks.length > 0 && checks.every((item) => item.pass) && cleanupStatus === "removed" ? "PASS" : "FAIL",
  checks,
  failures,
  cleanupStatus
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
