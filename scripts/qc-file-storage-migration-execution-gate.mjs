#!/usr/bin/env node

import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildStorageMigrationExecutionGate,
  writeStorageMigrationExecutionGate
} from "./generate-file-storage-migration-execution-gate.mjs";
import { sha256Bytes, sha256File } from "./qc-file-hash-utils.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];
const fixtureTempRoots = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function writeFixtureDb(dbPath, files, { includeBlockers }) {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE submissions (
        id TEXT PRIMARY KEY,
        drawing_number TEXT,
        revision TEXT,
        status TEXT
      );
      CREATE TABLE submission_files (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        file_role TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        local_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT
      );
      CREATE TABLE release_packages (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        package_filename TEXT NOT NULL,
        local_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT
      );
      CREATE TABLE file_assets (
        id TEXT PRIMARY KEY,
        storage_provider TEXT NOT NULL,
        original_path TEXT,
        storage_key TEXT,
        file_name TEXT NOT NULL,
        file_ext TEXT,
        mime_type TEXT,
        file_size INTEGER,
        content_hash TEXT,
        hash_algorithm TEXT,
        linked_entity_type TEXT,
        linked_entity_id TEXT,
        document_category TEXT,
        revision TEXT,
        sync_status TEXT,
        deleted_at TEXT,
        created_at TEXT
      );
    `);

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-1", "DRW-QC-001", "A", "Pending");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-ok", "sub-1", "pdf", "ok.pdf", files.okPath, files.okHash, 8, "2026-06-10T00:00:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-ok", "sub-1", "release.zip", files.releasePath, files.releaseHash, 12, "2026-06-10T00:03:00.000Z");

    if (includeBlockers) {
      db.prepare(
        `INSERT INTO submission_files
          (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("file-missing", "sub-1", "pdf", "missing.pdf", files.missingPath, "missing-hash", 7, "2026-06-10T00:01:00.000Z");
      db.prepare(
        `INSERT INTO submission_files
          (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("file-mismatch", "sub-1", "pdf", "mismatch.pdf", files.mismatchPath, "wrong-hash", 9, "2026-06-10T00:02:00.000Z");
    }

    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-skipped",
      "supabase_storage",
      null,
      "pdm-hot/already-there.step",
      "already-there.step",
      ".step",
      "application/step",
      22,
      "remote-hash",
      "SHA-256",
      "part_number",
      "PN-001",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-10T00:04:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function createFixture({ includeBlockers }) {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-exec-gate-qc-"));
  fixtureTempRoots.push(tempRoot);
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages", "2026", "06");
  await fsp.mkdir(path.join(repositoryDir, "pending"), { recursive: true });
  await fsp.mkdir(releaseDir, { recursive: true });

  const okBytes = Buffer.alloc(8, "o");
  const mismatchBytes = Buffer.alloc(9, "m");
  const releaseBytes = Buffer.alloc(12, "r");
  const files = {
    okPath: path.join(repositoryDir, "pending", "ok.pdf"),
    missingPath: path.join(repositoryDir, "pending", "missing.pdf"),
    mismatchPath: path.join(repositoryDir, "pending", "mismatch.pdf"),
    releasePath: path.join(releaseDir, "release.zip"),
    okHash: sha256Bytes(okBytes),
    releaseHash: sha256Bytes(releaseBytes)
  };
  await fsp.writeFile(files.okPath, okBytes);
  await fsp.writeFile(files.mismatchPath, mismatchBytes);
  await fsp.writeFile(files.releasePath, releaseBytes);
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files, { includeBlockers });

  return { tempRoot, dataDir, repositoryDir, files };
}

function envFor(fixture, overrides = {}) {
  return {
    PDM_DATA_DIR: fixture.dataDir,
    PDM_REPOSITORY_DIR: fixture.repositoryDir,
    PDM_STORAGE_DRY_RUN_TARGET_PROVIDER: "local_staging_directory",
    PDM_STORAGE_DRY_RUN_TARGET_BUCKET: "qc-staging",
    PDM_STORAGE_DRY_RUN_TARGET_PREFIX: "qc",
    ...overrides
  };
}

async function writeGovernanceGateFixture(fixture, overrides = {}) {
  const filePath = path.join(fixture.tempRoot, overrides.filename ?? "file-storage-governance-gate.json");
  const status = overrides.status ?? "stable";
  const legacyUnclassifiedRows = Number(overrides.legacyUnclassifiedRows ?? 0);
  const report = {
    reportType: "file-storage-governance-gate",
    gateVersion: "file-storage-governance-gate/v1",
    generatedAt: "2026-06-11T00:00:00.000Z",
    assumptions: {
      evidenceOnly: true,
      noProviderRequests: true,
      noFilesDeleted: true,
      noMetadataPointersUpdated: true
    },
    source: {
      available: overrides.sourceAvailable !== false,
      runId: "storage-governance-qc",
      period: "2026-06",
      evidenceJsonPath: "storage-monthly-evidence.json",
      evidenceMarkdownPath: "storage-monthly-evidence.md"
    },
    summary: {
      status,
      governanceLevel: overrides.governanceLevel ?? (status === "stable" ? "stable" : "review"),
      governanceLabel: overrides.governanceLabel ?? (status === "stable" ? "Stable" : "Evidence provenance review required"),
      blockerCount: Number(overrides.blockerCount ?? 0),
      warningCount: Number(overrides.warningCount ?? 0)
    },
    decisions: {
      providerMigration: {
        allowed: overrides.providerMigrationAllowed === true,
        reason: "fixture governance decision"
      },
      lifecycleCleanup: {
        allowed: overrides.lifecycleCleanupAllowed !== false,
        reason: "fixture lifecycle decision"
      },
      alternateProviderReview: {
        allowed: overrides.alternateProviderReviewAllowed === true,
        reason: "fixture alternate provider decision"
      }
    },
    evidenceQuality: {
      excludedQcRuntimeRows: Number(overrides.excludedQcRuntimeRows ?? 0),
      legacyUnclassifiedRows,
      provenanceReviewRequired: overrides.provenanceReviewRequired ?? legacyUnclassifiedRows > 0,
      qcRuntimeRowsExcluded: Number(overrides.excludedQcRuntimeRows ?? 0) > 0
    },
    readiness: {
      migrationReady: overrides.migrationReady !== false,
      blockers: overrides.blockers ?? [],
      warnings: overrides.warnings ?? []
    }
  };
  await fsp.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

async function main() {
  const disabledFixture = await createFixture({ includeBlockers: false });
  const disabledTarget = path.join(disabledFixture.tempRoot, "target-disabled");
  const disabledReport = await buildStorageMigrationExecutionGate({
    root: disabledFixture.tempRoot,
    targetRoot: disabledTarget,
    confirmStaging: false,
    env: envFor(disabledFixture)
  });

  record("STORAGE-MIGRATION-EXEC-GATE-001 report type is stable", disabledReport.reportType === "file-storage-migration-execution-gate");
  record("STORAGE-MIGRATION-EXEC-GATE-002 default gate is disabled", disabledReport.summary.status === "disabled" && disabledReport.summary.copiedCount === 0);
  record("STORAGE-MIGRATION-EXEC-GATE-003 disabled gate does not create target files", !(await exists(disabledTarget)));
  record("STORAGE-MIGRATION-EXEC-GATE-004 disabled gate keeps pointer and source guardrails", disabledReport.assumptions.noMetadataPointersUpdated === true && disabledReport.assumptions.noSourceFilesDeleted === true);

  const blockedFixture = await createFixture({ includeBlockers: true });
  const blockedTarget = path.join(blockedFixture.tempRoot, "target-blocked");
  const blockedGovernanceGatePath = await writeGovernanceGateFixture(blockedFixture);
  const blockedReport = await buildStorageMigrationExecutionGate({
    root: blockedFixture.tempRoot,
    targetRoot: blockedTarget,
    confirmStaging: true,
    governanceGatePath: blockedGovernanceGatePath,
    env: envFor(blockedFixture, { PDM_STORAGE_MIGRATION_EXECUTE_ENABLED: "1" })
  });

  record("STORAGE-MIGRATION-EXEC-GATE-005 blockers refuse execution", blockedReport.summary.status === "blocked" && blockedReport.summary.blockedCount === 2);
  record("STORAGE-MIGRATION-EXEC-GATE-006 blocked gate copies no files", blockedReport.summary.copiedCount === 0 && !(await exists(blockedTarget)));

  const missingGovernanceFixture = await createFixture({ includeBlockers: false });
  const missingGovernanceTarget = path.join(missingGovernanceFixture.tempRoot, "target-missing-governance");
  const missingGovernanceReport = await buildStorageMigrationExecutionGate({
    root: missingGovernanceFixture.tempRoot,
    targetRoot: missingGovernanceTarget,
    confirmStaging: true,
    env: envFor(missingGovernanceFixture, { PDM_STORAGE_MIGRATION_EXECUTE_ENABLED: "1" })
  });

  record(
    "STORAGE-MIGRATION-EXEC-GATE-020 missing governance gate refuses execution",
    missingGovernanceReport.summary.status === "blocked_missing_governance_gate" && missingGovernanceReport.summary.copiedCount === 0 && !(await exists(missingGovernanceTarget))
  );

  const legacyGovernanceFixture = await createFixture({ includeBlockers: false });
  const legacyGovernanceTarget = path.join(legacyGovernanceFixture.tempRoot, "target-legacy-governance");
  const legacyGovernancePath = await writeGovernanceGateFixture(legacyGovernanceFixture, {
    status: "cost_review_required",
    legacyUnclassifiedRows: 2
  });
  const legacyGovernanceReport = await buildStorageMigrationExecutionGate({
    root: legacyGovernanceFixture.tempRoot,
    targetRoot: legacyGovernanceTarget,
    confirmStaging: true,
    governanceGatePath: legacyGovernancePath,
    env: envFor(legacyGovernanceFixture, { PDM_STORAGE_MIGRATION_EXECUTE_ENABLED: "1" })
  });

  record(
    "STORAGE-MIGRATION-EXEC-GATE-021 provenance review governance refuses execution",
    legacyGovernanceReport.summary.status === "blocked_governance_not_ready" &&
      legacyGovernanceReport.governanceGate.evidenceQuality.provenanceReviewRequired === true &&
      legacyGovernanceReport.summary.copiedCount === 0 &&
      !(await exists(legacyGovernanceTarget))
  );

  const executeFixture = await createFixture({ includeBlockers: false });
  const targetRoot = path.join(executeFixture.tempRoot, "target-executed");
  const outputDir = path.join(executeFixture.tempRoot, "execution-output");
  const executeGovernanceGatePath = await writeGovernanceGateFixture(executeFixture);
  const executeReport = await buildStorageMigrationExecutionGate({
    root: executeFixture.tempRoot,
    targetRoot,
    confirmStaging: true,
    batchSize: 1,
    governanceGatePath: executeGovernanceGatePath,
    env: envFor(executeFixture, { PDM_STORAGE_MIGRATION_EXECUTE_ENABLED: "1" })
  });
  const outputs = await writeStorageMigrationExecutionGate(executeReport, outputDir);

  record("STORAGE-MIGRATION-EXEC-GATE-007 staging execution copies planned objects", executeReport.summary.status === "executed" && executeReport.summary.copiedCount === 2);
  record("STORAGE-MIGRATION-EXEC-GATE-008 copied objects are hash verified", executeReport.summary.hashVerifiedCount === 2 && executeReport.copied.every((item) => item.hashVerified));
  record("STORAGE-MIGRATION-EXEC-GATE-009 rollback source objects are verified", executeReport.summary.rollbackVerifiedCount === 2 && executeReport.rollbackVerification.every((item) => item.hashVerified));
  record("STORAGE-MIGRATION-EXEC-GATE-010 remote provider rows remain skipped", executeReport.summary.skippedCount === 1);
  record("STORAGE-MIGRATION-EXEC-GATE-011 source files are preserved", fs.existsSync(executeFixture.files.okPath) && fs.existsSync(executeFixture.files.releasePath));
  record("STORAGE-MIGRATION-EXEC-GATE-012 target files exist under staging root", executeReport.copied.every((item) => fs.existsSync(path.resolve(item.targetPath))));
  record(
    "STORAGE-MIGRATION-EXEC-GATE-013 target file hashes match expected hashes",
    (await Promise.all(executeReport.copied.map(async (item) => sha256File(path.resolve(item.targetPath))))).every(
      (hash, index) => hash === executeReport.copied[index].expectedSha256
    )
  );
  record("STORAGE-MIGRATION-EXEC-GATE-014 provider requests remain disabled", executeReport.assumptions.providerRequestsDisabled === true);
  record("STORAGE-MIGRATION-EXEC-GATE-015 metadata pointers are not updated", executeReport.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-MIGRATION-EXEC-GATE-016 JSON output is written", await exists(outputs.jsonPath));
  record("STORAGE-MIGRATION-EXEC-GATE-017 Markdown output is written", await exists(outputs.markdownPath));
  record("STORAGE-MIGRATION-EXEC-GATE-022 stable governance gate allows staging copy", executeReport.governanceGate.readyForStagingCopy === true && executeReport.inputs.governanceGatePath === executeGovernanceGatePath);

  const serialized =
    JSON.stringify(executeReport) +
    JSON.stringify(disabledReport) +
    JSON.stringify(blockedReport) +
    JSON.stringify(missingGovernanceReport) +
    JSON.stringify(legacyGovernanceReport);
  record("STORAGE-MIGRATION-EXEC-GATE-018 reports do not expose common cloud secret markers", !/(secret|service_role|X-Amz|BEGIN PRIVATE KEY)/i.test(serialized));

  const packageJson = readProjectFile(root, "package.json");
  record("STORAGE-MIGRATION-EXEC-GATE-019 package scripts are registered", packageJson.includes('"storage:migration-execution-gate"') && packageJson.includes('"qc:file-storage-migration-execution-gate"'));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(fixtureTempRoots.map((tempRoot) => fsp.rm(tempRoot, { recursive: true, force: true })));
  });
