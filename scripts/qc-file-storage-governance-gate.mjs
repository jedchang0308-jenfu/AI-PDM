#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_GOVERNANCE_GATE_VERSION,
  buildStorageGovernanceGate,
  writeStorageGovernanceGate
} from "./generate-file-storage-governance-gate.mjs";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function manifest(overrides = {}) {
  const summary = {
    metadataObjectCount: 10,
    metadataStorageBytes: 1024,
    metadataStorageGb: 0.000001,
    scannedLocalRootsBytes: 1024,
    scannedLocalRootsGb: 0.000001,
    duplicateRecoverableBytes: 0,
    missingLocalObjectCount: 0,
    hashMismatchCount: 0,
    orphanLocalFileCount: 0,
    auditedEgressRows: 2,
    auditedEgressBytes: 1024,
    auditedEgressGb: 0.000001,
    publicShareEgressBytes: 0,
    excludedQcRuntimeRows: 0,
    legacyUnclassifiedRows: 0,
    ...(overrides.summary ?? {})
  };
  return {
    reportType: "file-storage-monthly-evidence-scheduled-run",
    taskId: "DEV-STORAGE-COST-001",
    runId: overrides.runId ?? "storage-governance-qc",
    generatedAt: "2026-06-11T00:00:00.000Z",
    period: "2026-06",
    status: overrides.status ?? "ok",
    suggestedExitCode: overrides.suggestedExitCode ?? 0,
    outputDir: "data/storage-monthly-evidence/qc",
    files: {
      evidenceJson: "data/storage-monthly-evidence/qc/storage-monthly-evidence.json",
      evidenceMarkdown: "data/storage-monthly-evidence/qc/storage-monthly-evidence.md",
      runManifest: "data/storage-monthly-evidence/qc/storage-monthly-evidence-run.json",
      latestManifest: "data/storage-monthly-evidence/latest-storage-monthly-evidence-run.json"
    },
    summary,
    readiness: {
      migrationReady: true,
      blockers: [],
      warnings: [],
      ...(overrides.readiness ?? {})
    },
    thresholdUsage: overrides.thresholdUsage ?? {
      storage: { includedGb: 1, usageRatio: 0.2 },
      egress: { includedGb: 1, usageRatio: 0.2 }
    },
    recommendationCount: 1,
    rawToken: "governance-secret-token",
    signedUrl: "https://storage.example.invalid/governance-signed-url"
  };
}

async function reportFor(tempRoot, name, value) {
  const latestManifestPath = path.join(tempRoot, `${name}.json`);
  await writeJson(latestManifestPath, value);
  return buildStorageGovernanceGate({ root: tempRoot, latestManifestPath });
}

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-governance-gate-qc-"));
  const missing = await buildStorageGovernanceGate({
    root: tempRoot,
    latestManifestPath: path.join(tempRoot, "missing.json")
  });
  const blocked = await reportFor(tempRoot, "blocked", manifest({
    status: "blocked",
    suggestedExitCode: 2,
    readiness: {
      migrationReady: false,
      blockers: ["Missing local objects must be resolved before provider migration."],
      warnings: []
    },
    summary: {
      missingLocalObjectCount: 1
    }
  }));
  const observe = await reportFor(tempRoot, "observe", manifest({
    summary: {
      auditedEgressRows: 0,
      auditedEgressBytes: 0,
      auditedEgressGb: 0
    }
  }));
  const review = await reportFor(tempRoot, "review", manifest({
    status: "warning",
    summary: {
      publicShareEgressBytes: 4096
    },
    thresholdUsage: {
      storage: { includedGb: 1, usageRatio: 0.71 },
      egress: { includedGb: 1, usageRatio: 0.2 }
    }
  }));
  const control = await reportFor(tempRoot, "control", manifest({
    status: "warning",
    thresholdUsage: {
      storage: { includedGb: 1, usageRatio: 0.95 },
      egress: { includedGb: 1, usageRatio: 0.2 }
    }
  }));
  const stable = await reportFor(tempRoot, "stable", manifest());
  const legacy = await reportFor(tempRoot, "legacy", manifest({
    status: "warning",
    readiness: {
      migrationReady: true,
      blockers: [],
      warnings: ["Legacy StorageAccessed rows without provenance must be reviewed before formal monthly cost decisions."]
    },
    summary: {
      legacyUnclassifiedRows: 2
    }
  }));

  record("STORAGE-GOVERNANCE-GATE-001 gate version is stable", stable.gateVersion === STORAGE_GOVERNANCE_GATE_VERSION);
  record("STORAGE-GOVERNANCE-GATE-002 missing evidence blocks all actions", missing.summary.status === "blocked_missing_evidence" && missing.decisions.providerMigration.allowed === false && missing.decisions.lifecycleCleanup.allowed === false);
  record("STORAGE-GOVERNANCE-GATE-003 integrity blockers block migration and cleanup", blocked.summary.status === "blocked_storage_integrity" && blocked.decisions.providerMigration.allowed === false && blocked.decisions.lifecycleCleanup.allowed === false);
  record("STORAGE-GOVERNANCE-GATE-004 observation mode blocks action until egress is proven", observe.summary.status === "observation_required" && observe.decisions.providerMigration.allowed === false && observe.decisions.lifecycleCleanup.allowed === false);
  record("STORAGE-GOVERNANCE-GATE-005 review status recommends alternate provider review but blocks migration", review.summary.status === "cost_review_required" && review.decisions.alternateProviderReview.allowed === true && review.decisions.providerMigration.allowed === false);
  record("STORAGE-GOVERNANCE-GATE-006 control status allows provider migration review", control.summary.status === "cost_controls_required" && control.decisions.providerMigration.allowed === true && control.decisions.lifecycleCleanup.allowed === true);
  record("STORAGE-GOVERNANCE-GATE-007 stable status allows cleanup review but not provider migration", stable.summary.status === "stable" && stable.decisions.providerMigration.allowed === false && stable.decisions.lifecycleCleanup.allowed === true);
  record("STORAGE-GOVERNANCE-GATE-008 gate keeps no side-effect assumptions", stable.assumptions.noProviderRequests === true && stable.assumptions.noFilesDeleted === true && stable.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-GOVERNANCE-GATE-015 legacy unclassified rows require review", legacy.summary.status === "cost_review_required" && legacy.summary.governanceLabel === "Evidence provenance review required");
  record("STORAGE-GOVERNANCE-GATE-016 legacy review does not recommend alternate provider by itself", legacy.decisions.alternateProviderReview.allowed === false && legacy.decisions.providerMigration.allowed === false);
  record("STORAGE-GOVERNANCE-GATE-017 evidence quality counts are reported", legacy.evidenceQuality.legacyUnclassifiedRows === 2 && legacy.evidenceQuality.provenanceReviewRequired === true);

  const outputDir = path.join(tempRoot, "out");
  const outputs = await writeStorageGovernanceGate(control, outputDir);
  record("STORAGE-GOVERNANCE-GATE-009 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record(
    "STORAGE-GOVERNANCE-GATE-010 output records management decisions",
    outputBody.includes("Provider migration allowed: true") && outputBody.includes("Alternate provider review required: true")
  );
  const legacyOutputDir = path.join(tempRoot, "legacy-out");
  const legacyOutputs = await writeStorageGovernanceGate(legacy, legacyOutputDir);
  const legacyOutputBody = `${await fsp.readFile(legacyOutputs.jsonPath, "utf8")}\n${await fsp.readFile(legacyOutputs.markdownPath, "utf8")}`;
  record("STORAGE-GOVERNANCE-GATE-018 markdown records evidence quality", legacyOutputBody.includes("## Evidence Quality") && legacyOutputBody.includes("Legacy unclassified rows: 2") && legacyOutputBody.includes("Provenance review required: true"));

  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");
  record("STORAGE-GOVERNANCE-GATE-011 package scripts are registered", packageJson.includes('"storage:governance-gate"') && packageJson.includes('"qc:file-storage-governance-gate"'));
  record("STORAGE-GOVERNANCE-GATE-012 PM evidence references Phase 5M", planSource.includes("Phase 5M") && devTaskSource.includes("Phase 5M"));

  const generatorSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-governance-gate.mjs"), "utf8");
  record(
    "STORAGE-GOVERNANCE-GATE-013 generator has no provider or Supabase side-effect imports",
    !/(mcp__codex_apps__supabase|_confirm_cost|_create_project|_create_branch|supabase\.storage\.from|copyFile|unlink|rm\()/i.test(generatorSource)
  );
  const serialized = JSON.stringify([missing, blocked, observe, review, control, stable, legacy]) + outputBody + legacyOutputBody;
  record(
    "STORAGE-GOVERNANCE-GATE-014 reports do not expose common cloud credential markers",
    !/(governance-secret-token|governance-signed-url|service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
