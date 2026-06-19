#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getStorageEvidenceDashboard } from "../src/lib/storage-evidence-dashboard.ts";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixtureManifest() {
  return {
    reportType: "file-storage-monthly-evidence-scheduled-run",
    taskId: "DEV-STORAGE-COST-001",
    runId: "2026-06-storage-evidence-scheduled-qc",
    generatedAt: "2026-06-11T00:00:00.000Z",
    period: "2026-06",
    status: "blocked",
    suggestedExitCode: 2,
    outputDir: "data/storage-monthly-evidence/qc",
    files: {
      evidenceJson: "data/storage-monthly-evidence/qc/storage-monthly-evidence.json",
      evidenceMarkdown: "data/storage-monthly-evidence/qc/storage-monthly-evidence.md",
      runManifest: "data/storage-monthly-evidence/qc/storage-monthly-evidence-run.json",
      latestManifest: "data/storage-monthly-evidence/latest-storage-monthly-evidence-run.json"
    },
    summary: {
      metadataObjectCount: 4,
      metadataStorageBytes: 512,
      metadataStorageGb: 0.000001,
      scannedLocalRootsBytes: 384,
      scannedLocalRootsGb: 0.000001,
      duplicateRecoverableBytes: 128,
      missingLocalObjectCount: 1,
      hashMismatchCount: 0,
      orphanLocalFileCount: 0,
      auditedEgressRows: 2,
      auditedEgressBytes: 384,
      auditedEgressGb: 0.000001,
      publicShareEgressBytes: 256,
      excludedQcRuntimeRows: 0,
      legacyUnclassifiedRows: 0
    },
    readiness: {
      migrationReady: false,
      blockers: ["Missing local objects must be resolved before provider migration."],
      warnings: ["Public share package egress exists; review share expiry and supplier package size."]
    },
    thresholdUsage: {
      storage: { includedGb: 1, usageRatio: 0.1 },
      egress: { includedGb: 1, usageRatio: 0.1 }
    },
    recommendationCount: 3,
    guardrails: {
      noProviderRequests: true
    },
    rawToken: "dashboard-secret-token",
    signedUrl: "https://storage.example.invalid/dashboard-signed-url"
  };
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-dashboard-qc-"));
  const latestPath = path.join(tempRoot, "data", "storage-monthly-evidence", "latest-storage-monthly-evidence-run.json");
  const manifest = fixtureManifest();
  await writeJson(latestPath, manifest);
  await writeJson(path.join(tempRoot, "data", "storage-monthly-evidence", "qc", "storage-monthly-evidence.json"), {
    reportType: "file-storage-monthly-evidence"
  });
  await fsp.writeFile(
    path.join(tempRoot, "data", "storage-monthly-evidence", "qc", "storage-monthly-evidence.md"),
    "# Storage monthly evidence\n",
    "utf8"
  );

  const dashboard = await getStorageEvidenceDashboard({ root: tempRoot, latestManifestPath: latestPath });
  const missing = await getStorageEvidenceDashboard({ root: tempRoot, latestManifestPath: path.join(tempRoot, "missing.json") });
  const controlManifestPath = path.join(tempRoot, "data", "storage-monthly-evidence", "control-latest.json");
  await writeJson(controlManifestPath, {
    ...manifest,
    runId: "2026-06-storage-evidence-scheduled-control",
    status: "warning",
    readiness: {
      migrationReady: true,
      blockers: [],
      warnings: []
    },
    summary: {
      ...manifest.summary,
      auditedEgressRows: 3,
      publicShareEgressBytes: 0
    },
    thresholdUsage: {
      storage: { includedGb: 1, usageRatio: 0.95 },
      egress: { includedGb: 1, usageRatio: 0.2 }
    }
  });
  const controlDashboard = await getStorageEvidenceDashboard({ root: tempRoot, latestManifestPath: controlManifestPath });
  const legacyManifestPath = path.join(tempRoot, "data", "storage-monthly-evidence", "legacy-latest.json");
  await writeJson(legacyManifestPath, {
    ...manifest,
    runId: "2026-06-storage-evidence-scheduled-legacy",
    status: "warning",
    readiness: {
      migrationReady: true,
      blockers: [],
      warnings: ["Legacy StorageAccessed rows without provenance must be reviewed before formal monthly cost decisions."]
    },
    summary: {
      ...manifest.summary,
      publicShareEgressBytes: 0,
      legacyUnclassifiedRows: 2
    },
    thresholdUsage: {
      storage: { includedGb: 1, usageRatio: 0.1 },
      egress: { includedGb: 1, usageRatio: 0.1 }
    }
  });
  const legacyDashboard = await getStorageEvidenceDashboard({ root: tempRoot, latestManifestPath: legacyManifestPath });

  record("STORAGE-DASHBOARD-001 dashboard report type is stable", dashboard.reportType === "file-storage-evidence-dashboard");
  record("STORAGE-DASHBOARD-002 latest manifest is available", dashboard.source.available === true && dashboard.source.error === null);
  record("STORAGE-DASHBOARD-003 run status maps to critical severity", dashboard.run?.status === "blocked" && dashboard.run.severity === "critical");
  record("STORAGE-DASHBOARD-004 summary is exposed without full report payload", dashboard.summary?.metadataObjectCount === 4 && !("costReport" in dashboard) && !("egressReport" in dashboard));
  record("STORAGE-DASHBOARD-005 readiness blockers are preserved", dashboard.readiness?.blockers.length === 1 && dashboard.readiness.migrationReady === false);
  record("STORAGE-DASHBOARD-006 next actions include blocker and public share guidance", dashboard.nextActions.some((item) => item.includes("Resolve storage blockers")) && dashboard.nextActions.some((item) => item.includes("public share")));
  record("STORAGE-DASHBOARD-007 missing latest manifest returns controlled empty state", missing.source.available === false && missing.source.error === "latest_manifest_missing" && missing.nextActions[0].includes("storage:monthly-evidence:scheduled"));
  record(
    "STORAGE-DASHBOARD-023 manifest file paths resolve from workspace root when files exist",
    dashboard.source.evidenceJsonPath === path.join(tempRoot, "data", "storage-monthly-evidence", "qc", "storage-monthly-evidence.json") &&
      dashboard.source.evidenceMarkdownPath === path.join(tempRoot, "data", "storage-monthly-evidence", "qc", "storage-monthly-evidence.md")
  );
  record("STORAGE-DASHBOARD-018 blocked evidence produces blocked governance", dashboard.governance?.level === "blocked" && dashboard.governance.providerMigrationAllowed === false && dashboard.governance.lifecycleCleanupAllowed === false);
  record("STORAGE-DASHBOARD-019 critical storage usage recommends provider review", controlDashboard.governance?.level === "control" && controlDashboard.governance.alternateProviderReviewRecommended === true && controlDashboard.governance.providerMigrationAllowed === true);
  record("STORAGE-DASHBOARD-020 missing evidence has no governance snapshot", missing.governance === null);
  record("STORAGE-DASHBOARD-024 legacy rows are exposed in summary", legacyDashboard.summary?.legacyUnclassifiedRows === 2);
  record("STORAGE-DASHBOARD-025 legacy rows require provenance review governance", legacyDashboard.governance?.level === "review" && legacyDashboard.governance.label === "Evidence provenance review required" && legacyDashboard.governance.alternateProviderReviewRecommended === false);
  record("STORAGE-DASHBOARD-026 legacy rows add PM next action", legacyDashboard.nextActions.some((item) => item.includes("legacy StorageAccessed rows")));

  const serialized = JSON.stringify(dashboard);
  record("STORAGE-DASHBOARD-008 dashboard response does not expose raw token values", !serialized.includes("dashboard-secret-token"));
  record("STORAGE-DASHBOARD-009 dashboard response does not expose signed URL values", !serialized.includes("dashboard-signed-url") && !serialized.includes("storage.example.invalid"));

  const routeSource = await fsp.readFile(path.join(root, "src", "app", "api", "storage", "evidence", "route.ts"), "utf8");
  const notificationsRouteSource = await fsp.readFile(path.join(root, "src", "app", "api", "notifications", "route.ts"), "utf8");
  const dashboardSource = await fsp.readFile(path.join(root, "src", "components", "dashboard.tsx"), "utf8");
  const typesSource = await fsp.readFile(path.join(root, "src", "lib", "types.ts"), "utf8");
  const packageJson = await fsp.readFile(path.join(root, "package.json"), "utf8");
  record("STORAGE-DASHBOARD-010 API route requires manager/admin role", routeSource.includes('["Admin", "R&D Manager"]') && routeSource.includes("getStorageEvidenceDashboard"));
  record("STORAGE-DASHBOARD-011 package script is registered", packageJson.includes('"qc:file-storage-evidence-dashboard"'));
  record("STORAGE-DASHBOARD-012 notifications include storage evidence alert kind", typesSource.includes('"storage_evidence_alert"') && notificationsRouteSource.includes("buildStorageEvidenceNotification"));
  record("STORAGE-DASHBOARD-013 storage alerts are manager/admin scoped", notificationsRouteSource.includes('auth.user.role === "Admin" || auth.user.role === "R&D Manager"'));
  record("STORAGE-DASHBOARD-014 dashboard panel fetches storage evidence API", dashboardSource.includes('fetch("/api/storage/evidence")') && dashboardSource.includes("StorageEvidencePanel"));
  record("STORAGE-DASHBOARD-015 dashboard panel is manager/admin scoped", dashboardSource.includes("{canReview ? (") && dashboardSource.includes("<StorageEvidencePanel"));
  record("STORAGE-DASHBOARD-016 dashboard panel does not expose full report payload fields", !dashboardSource.includes("costReport") && !dashboardSource.includes("egressReport"));
  record("STORAGE-DASHBOARD-017 dashboard panel does not expose raw token or signed URL fields", !dashboardSource.includes("rawToken") && !dashboardSource.includes("signedUrl"));
  record("STORAGE-DASHBOARD-021 notification message includes governance label", notificationsRouteSource.includes("governanceLabel") && notificationsRouteSource.includes("governance ${governanceLabel}"));
  record("STORAGE-DASHBOARD-022 dashboard panel renders governance snapshot", dashboardSource.includes("Governance") && dashboardSource.includes("alternateProviderReviewRecommended"));

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
