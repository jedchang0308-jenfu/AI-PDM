#!/usr/bin/env node

import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildDev046StagingPrincipalBootstrapPackage } from "./dev-046-staging-principal-bootstrap-package.mjs";

const root = process.cwd();
const containerName = `ai-pdm-dev046-principal-shadow-${process.pid}`;
const postgresImage = "postgres:17-bookworm";
const databaseName = "ai_pdm";
const migrationManifestPath = path.join(root, "output", "dev-046-cloudsql-migration-package", "cloudsql-migration-manifest.json");
const reportPath = path.join(root, "output", "dev-046-staging-principal-bootstrap", "shadow-report.json");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function runDocker(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
}

function requireSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label}: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function psql(sql, { expectSuccess = true, tuplesOnly = false } = {}) {
  const args = ["exec", "-i", containerName, "psql", "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-A", "-t", "-F", "|");
  args.push("-U", "postgres", "-d", databaseName, "-f", "-");
  const result = runDocker(args, { input: sql });
  if (expectSuccess) requireSuccess(result, "PSQL_FAILED");
  return result;
}

function readMigrationManifest() {
  return JSON.parse(fs.readFileSync(migrationManifestPath, "utf8"));
}

function readMigrationSql(relativeOutputPath) {
  return fs.readFileSync(
    path.join(root, "output", "dev-046-cloudsql-migration-package", ...relativeOutputPath.split("/")),
    "utf8"
  );
}

let report;
try {
  requireSuccess(
    runDocker([
      "run", "--rm", "-d", "--name", containerName,
      "-e", "POSTGRES_PASSWORD=dev046-shadow-only",
      "-e", `POSTGRES_DB=${databaseName}`,
      postgresImage
    ]),
    "POSTGRES_SHADOW_START_FAILED"
  );

  let ready = false;
  let consecutiveQueries = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = runDocker([
      "exec", containerName, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", databaseName,
      "-c", "SELECT 1;"
    ]);
    consecutiveQueries = probe.status === 0 && probe.stdout.trim() === "1" ? consecutiveQueries + 1 : 0;
    if (consecutiveQueries >= 2) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  record("DEV046-PRINCIPAL-SHADOW-001 disposable PostgreSQL 17 target is ready", ready, postgresImage);

  const migrationManifest = readMigrationManifest();
  for (const migration of migrationManifest.orderedSchemaMigrations) {
    psql(readMigrationSql(migration.output));
  }
  record(
    "DEV046-PRINCIPAL-SHADOW-002 reviewed Cloud SQL schema package applies to a fresh target",
    migrationManifest.orderedSchemaMigrations.length === 18,
    String(migrationManifest.orderedSchemaMigrations.length)
  );

  const packageData = buildDev046StagingPrincipalBootstrapPackage();
  psql(packageData.bootstrapSql);
  psql(packageData.bootstrapSql);
  record("DEV046-PRINCIPAL-SHADOW-003 principal bootstrap applies and immediately reruns idempotently", true);

  const readback = psql(packageData.readbackSql, { tuplesOnly: true }).stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .at(-1);
  const fields = String(readback ?? "").split("|");
  const expectedRoleCount = String(packageData.report.canonicalMatrix.roleCount);
  const expectedPermissionCount = String(packageData.report.canonicalMatrix.permissionCount);
  record(
    "DEV046-PRINCIPAL-SHADOW-004 readback confirms identity, no password, membership and canonical matrix",
    fields.length === 13 &&
      fields.slice(0, 7).every((value) => value === "t") &&
      fields[7] === expectedRoleCount && fields[8] === expectedRoleCount &&
      fields[9] === expectedPermissionCount && fields[10] === expectedPermissionCount &&
      fields[11] === "t" && fields[12] === "t",
    String(readback ?? "missing")
  );

  psql(`UPDATE platform_principal_mappings
SET external_subject = 'dev046-shadow-collision'
WHERE pdm_user_id = 'stg-pdm-admin-001';`);
  const collisionAttempt = psql(packageData.bootstrapSql, { expectSuccess: false });
  const collisionReadback = psql(
    "SELECT external_subject FROM platform_principal_mappings WHERE pdm_user_id = 'stg-pdm-admin-001';",
    { tuplesOnly: true }
  ).stdout.trim();
  record(
    "DEV046-PRINCIPAL-SHADOW-005 conflicting UID mapping fails closed without partial overwrite",
    collisionAttempt.status !== 0 &&
      /DEV046_PRINCIPAL_MAPPING_COLLISION/u.test(`${collisionAttempt.stderr}\n${collisionAttempt.stdout}`) &&
      collisionReadback === "dev046-shadow-collision",
    collisionReadback
  );

  psql(`UPDATE platform_principal_mappings
SET external_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2'
WHERE pdm_user_id = 'stg-pdm-admin-001';`);
  psql(packageData.bootstrapSql);
  psql(packageData.rollbackSql);
  const rollbackReadback = psql(
    `SELECT m.mapping_status, a.status, u.account_status, u.system_role_enabled,
            u.session_invalid_before IS NOT NULL
     FROM users u
     JOIN platform_principal_mappings m ON m.pdm_user_id = u.id
     JOIN auth_identities a ON a.user_id = u.id AND a.provider = 'google_oauth'
     WHERE u.id = 'stg-pdm-admin-001';`,
    { tuplesOnly: true }
  ).stdout.trim();
  record(
    "DEV046-PRINCIPAL-SHADOW-006 rollback revokes access and preserves the principal record",
    rollbackReadback === "retired|disabled|suspended|0|t",
    rollbackReadback
  );

  report = {
    schemaVersion: 1,
    dev: "DEV-046",
    checkedAt: new Date().toISOString(),
    status: "passed",
    target: "disposable_local_postgres_17",
    postgresImage,
    cloudResourcesCreated: false,
    productionDataAccessed: false,
    total: results.length,
    passed: results.length,
    results
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report = {
    schemaVersion: 1,
    dev: "DEV-046",
    checkedAt: new Date().toISOString(),
    status: "failed",
    target: "disposable_local_postgres_17",
    postgresImage,
    cloudResourcesCreated: false,
    productionDataAccessed: false,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    results,
    error: error instanceof Error ? error.message : String(error)
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  runDocker(["rm", "-f", containerName]);
}
