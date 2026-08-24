#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = `DEV087-zero-loss-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087-zero-loss", runId);
const postgresContractDir = path.join(outputDir, "postgres-contract");
const localDryRunDir = path.join(outputDir, "local-dry-run");
fs.mkdirSync(outputDir, { recursive: true });

const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const source = fs.readFileSync(path.join(root, "scripts", "migrate-dev-087-postgres.mjs"), "utf8");
const sqliteMigrationSource = fs.readFileSync(path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"), "utf8");
const cleanupSource = fs.readFileSync(path.join(root, "scripts", "cleanup-dev-087-local-legacy.mjs"), "utf8");

const contractRun = spawnSync(process.execPath, [
  "scripts/migrate-dev-087-postgres.mjs", "--contract-check", `--output-dir=${postgresContractDir}`
], { cwd: root, encoding: "utf8" });
check("postgres-contract-command-pass", contractRun.status === 0, contractRun.stderr || contractRun.stdout);
const contractPath = path.join(postgresContractDir, "contract.json");
const contract = fs.existsSync(contractPath) ? readJson(contractPath) : null;
check("postgres-provider-cloud-sql-only", contract?.providerRequired === "cloud_sql_postgres");
check("postgres-mapping-v2", contract?.mappingVersion === 2 && contract?.mappingRequiredForApply === true);
check("postgres-row-and-file-hash-receipts", contract?.rowHashReceiptsRequired === true && contract?.fileHashReceiptsRequired === true);
check("postgres-production-discard-forbidden", contract?.productionDiscardAllowed === false && source.includes("DEV087_PRODUCTION_DISCARD_OR_RETAIN_FLAG_FORBIDDEN"));
check("postgres-rehearsal-isolated-restore-gate", source.includes("DEV087_REHEARSAL_REQUIRES_ISOLATED_RESTORE"));
check("postgres-cutover-explicit-authorization-gate", source.includes("DEV087_PRODUCTION_CUTOVER_AUTHORIZATION_REQUIRED"));
check("postgres-source-fingerprint-drift-gate", source.includes("DEV087_POSTGRES_MAPPING_SOURCE_DRIFT") && source.includes("source_fingerprint_drift"));
check("postgres-target-row-hash-verification", source.includes("target_hash_mismatch") && source.includes("receipt.targetHash"));
check("postgres-file-and-preview-hash-verification", source.includes("file_content_hash_mismatch") && source.includes("preview_content_hash_mismatch"));
check("postgres-composite-work-file-receipts", contract?.compositeWorkFileReceiptsRequired === true && source.includes("workFileReceipts") && source.includes("DEV092_POSTGRES_WORK_FILE_RECEIPT_MISSING"));
check("sqlite-work-file-repair-negative-control", sqliteMigrationSource.includes("DEV092_WORK_FILE_SOURCE_DRIFT") && sqliteMigrationSource.includes("work_file_snapshot_incomplete"));
check("postgres-foreign-key-validation", source.includes("foreign_key_not_validated") && source.includes("convalidated"));

const dryRun = spawnSync(process.execPath, [
  "scripts/cleanup-dev-087-local-legacy.mjs", `--output-dir=${localDryRunDir}`
], { cwd: root, encoding: "utf8" });
check("local-cleanup-dry-run-command-pass", dryRun.status === 0, dryRun.stderr || dryRun.stdout);
const dryManifestPath = path.join(localDryRunDir, "manifest.json");
const dryManifest = fs.existsSync(dryManifestPath) ? readJson(dryManifestPath) : null;
check("local-cleanup-exact-primary-sqlite", dryManifest?.provider === "sqlite" && dryManifest?.exactPrimaryPath === true);
check("local-current-legacy-workspaces-zero", dryManifest?.beforeCounts?.workspaces === 0 && dryManifest?.afterCounts?.workspaces === 0);
check("local-current-quarantine-zero", dryManifest?.beforeCounts?.quarantine === 0 && dryManifest?.afterCounts?.quarantine === 0);
check("local-current-canonical-hash-stable", dryManifest?.canonicalUnchanged === true);
check("local-cleanup-provider-and-path-fail-closed", cleanupSource.includes("DEV087_LOCAL_CLEANUP_PROVIDER_REJECTED") && cleanupSource.includes("DEV087_LOCAL_CLEANUP_PATH_REJECTED") && cleanupSource.includes("DEV087_LOCAL_CLEANUP_NOT_SQLITE"));

const appliedPath = path.join(root, "output", "qa", "dev-087-local-cleanup", "main-apply", "manifest.json");
const applied = fs.existsSync(appliedPath) ? readJson(appliedPath) : null;
check("authorized-local-apply-evidence-present", applied?.mode === "apply" && applied?.pass === true);
check("authorized-local-apply-removed-60-workspaces", applied?.beforeCounts?.workspaces === 60 && applied?.afterCounts?.workspaces === 0);
check("authorized-local-apply-removed-56-quarantine", applied?.beforeCounts?.quarantine === 56 && applied?.afterCounts?.quarantine === 0);
check("authorized-local-apply-canonical-unchanged", applied?.canonicalUnchanged === true);
check("authorized-local-apply-no-live-file-deletion", applied?.deletedCounts?.fileAssets === 0 && applied?.deletedCounts?.physicalFiles === 0);

const rehearsalPath = path.join(root, "output", "qa", "dev-087-local-cleanup", "fixture-20260823091728", "cleanup", "manifest.json");
const rehearsal = fs.existsSync(rehearsalPath) ? readJson(rehearsalPath) : null;
check("local-destructive-rehearsal-present", rehearsal?.mode === "apply" && rehearsal?.pass === true && rehearsal?.canonicalUnchanged === true);

function negativeRun(name, args, expectedFragment, env = {}) {
  const result = spawnSync(process.execPath, ["scripts/migrate-dev-087-postgres.mjs", ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, ...env }
  });
  check(name, result.status !== 0 && `${result.stdout}${result.stderr}`.includes(expectedFragment), `${result.stdout}${result.stderr}`);
}
negativeRun("negative-production-discard-flag", ["--contract-check", "--discard-unapproved"], "DEV087_PRODUCTION_DISCARD_OR_RETAIN_FLAG_FORBIDDEN");
negativeRun("negative-production-retain-flag", ["--contract-check", "--retain-unmapped-legacy"], "DEV087_PRODUCTION_DISCARD_OR_RETAIN_FLAG_FORBIDDEN");
negativeRun("negative-rehearsal-without-restore-proof", ["--apply", "--mode=rehearsal", "--mapping=missing.json", "--expected-commit=test"], "DEV087_REHEARSAL_REQUIRES_ISOLATED_RESTORE");
negativeRun("negative-cutover-without-authorization", ["--apply", "--mode=cutover", "--mapping=missing.json", "--expected-commit=test"], "DEV087_PRODUCTION_CUTOVER_AUTHORIZATION_REQUIRED");

const failed = checks.filter((entry) => !entry.pass);
const manifest = {
  devId: "DEV-087",
  runId,
  status: failed.length ? "FAIL" : "PASS",
  productionConnected: false,
  productionMigrationExecuted: false,
  checks,
  evidence: { appliedPath, rehearsalPath, dryManifestPath, contractPath },
  hash: crypto.createHash("sha256").update(JSON.stringify(checks)).digest("hex")
};
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const entry of checks) console.log(`${entry.pass ? "PASS" : "FAIL"} ${entry.name}${entry.detail && !entry.pass ? ` (${entry.detail.trim()})` : ""}`);
console.log(JSON.stringify({ status: manifest.status, passed: checks.length - failed.length, failed: failed.length, manifestPath }, null, 2));
if (failed.length) process.exitCode = 1;
