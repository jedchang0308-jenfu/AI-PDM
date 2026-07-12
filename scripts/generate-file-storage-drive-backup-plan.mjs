#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStorageMetadataContext } from "./generate-file-storage-cost-report.mjs";

export function classifyDriveBackupCandidate(candidate) {
  if (candidate.source === "file_derivatives" || candidate.derivativeKind) {
    return { coverage: "excluded", reason: "generated_preview_derivative_excluded" };
  }
  if (candidate.source === "release_packages") {
    return { coverage: "required", reason: "release_package_required" };
  }
  if (candidate.businessStatus === "Released" || candidate.businessStatus === "Obsolete") {
    return { coverage: "required", reason: "formal_release_required" };
  }
  if (candidate.source === "file_assets") {
    return { coverage: "selective", reason: "master_attachment_selective" };
  }
  return { coverage: "selective", reason: "draft_or_in_review_selective" };
}

export function buildDriveBackupPlanFromCandidates(candidates) {
  return candidates.map((candidate) => {
    const classification = classifyDriveBackupCandidate(candidate);
    return {
      id: candidate.id,
      source: candidate.source,
      filename: candidate.filename,
      coverage: classification.coverage,
      reason: classification.reason,
      storage: classification.coverage === "excluded"
        ? null
        : {
            provider: candidate.provider,
            bucket: candidate.bucket ?? null,
            key: candidate.storageKey
          },
      drive: {
        folderPath: buildDriveFolderPath(candidate, classification.coverage),
        filename: sanitizeDriveFilename(candidate.filename || `${candidate.id}.bin`),
        metadataFilename: metadataFilenameFor(candidate.filename || `${candidate.id}.bin`)
      },
      metadataSnapshot: buildMetadataSnapshot(candidate, classification)
    };
  });
}

export function buildDriveBackupPlanReport(options = {}) {
  const context = buildStorageMetadataContext(options);
  const candidates = context.metadataObjects.map((object) => ({
    id: object.id,
    source: object.source,
    provider: object.provider,
    bucket: object.bucket ?? null,
    storageKey: object.storageKey,
    filename: object.filename,
    fileRole: object.fileRole,
    businessStatus: object.businessStatus,
    linkedEntityType: object.linkedEntityType,
    linkedEntityId: object.linkedEntityId,
    revision: object.revision ?? null,
    sha256: object.hash,
    bytes: object.bytes
  }));
  const plan = buildDriveBackupPlanFromCandidates(candidates);
  const summary = summarizePlan(plan);

  return {
    reportType: "file-storage-drive-backup-plan",
    generatedAt: new Date().toISOString(),
    assumptions: {
      supabaseAndPostgresAreCoreAuthority: true,
      googleDriveIsBackupMirrorOnly: true,
      googleDriveDoesNotServeRuntimeReads: true,
      noDriveDeletesOrOverwritesInFirstVersion: true,
      generatedPreviewDerivativesExcludedByDefault: true,
      metadataSnapshotsAreRestoreAidsNotAuthority: true,
      metadataSnapshotsExcludeSecretsSignedUrlsAndLocalAbsolutePaths: true,
      metadataSidecarsPlannedBesideBackedUpBlobs: true
    },
    inputs: {
      dbPath: path.relative(context.root, context.dbPath).split(path.sep).join("/"),
      dbExists: context.dbRows.exists,
      metadataObjectCount: candidates.length
    },
    summary,
    manifestTemplate: buildDriveBackupManifestFromPlan(plan),
    restoreIndex: buildDriveBackupRestoreIndexFromPlan(plan),
    driftReportTemplate: buildDriveBackupDriftReportFromPlan(plan),
    plan
  };
}

export function resolveCollisionSafeDriveFilename(filename, existingFilenames, identity) {
  const safe = sanitizeDriveFilename(filename);
  const existing = new Set([...existingFilenames].map((name) => name.toLowerCase()));
  if (!existing.has(safe.toLowerCase())) return safe;
  const parsed = path.parse(safe);
  const suffix = `__PDM-${sanitizeDriveFilename(identity).slice(0, 12) || "object"}`;
  return `${parsed.name}${suffix}${parsed.ext}`;
}

export function buildDriveBackupRestoreIndexFromPlan(plan) {
  return {
    schema: "ai-pdm-drive-backup-restore-index.v1",
    generatedAt: new Date().toISOString(),
    entries: plan
      .filter((item) => item.coverage !== "excluded")
      .map((item) => ({
        source: item.source,
        id: item.id,
        coverage: item.coverage,
        reason: item.reason,
        linkedEntityType: item.metadataSnapshot.linkedEntityType,
        linkedEntityId: item.metadataSnapshot.linkedEntityId,
        revision: item.metadataSnapshot.revision,
        filename: item.filename,
        driveFolderPath: item.drive.folderPath,
        driveFilename: item.drive.filename,
        metadataFilename: item.drive.metadataFilename,
        storage: item.storage,
        sha256: item.metadataSnapshot.sha256,
        fileSize: item.metadataSnapshot.fileSize
      }))
  };
}

export function buildDriveBackupManifestFromPlan(plan, results = []) {
  const resultByCandidateId = new Map(results.map((result) => [result.candidateId, result]));
  return {
    schema: "ai-pdm-drive-backup-manifest.v1",
    generatedAt: new Date().toISOString(),
    authority: "supabase_core",
    entries: plan
      .filter((item) => item.coverage !== "excluded")
      .map((item) => {
        const result = resultByCandidateId.get(item.id);
        return {
          source: item.source,
          id: item.id,
          coverage: item.coverage,
          reason: item.reason,
          filename: item.filename,
          driveFolderPath: item.drive.folderPath,
          driveFilename: result?.driveFilename ?? item.drive.filename,
          driveFileId: result?.driveFileId ?? null,
          metadataFilename: result?.metadataFilename ?? item.drive.metadataFilename,
          metadataDriveFileId: result?.metadataDriveFileId ?? null,
          backupStatus: result?.status ?? "planned",
          metadataStatus: result?.metadataStatus ?? "planned",
          storage: item.storage,
          sha256: item.metadataSnapshot.sha256,
          fileSize: item.metadataSnapshot.fileSize
        };
      })
  };
}

export function buildDriveBackupDriftReportFromPlan(plan, results = []) {
  const resultByCandidateId = new Map(results.map((result) => [result.candidateId, result]));
  const findings = [];
  for (const item of plan) {
    if (item.coverage === "excluded") continue;
    const result = resultByCandidateId.get(item.id);
    if (!result) {
      if (item.coverage === "required") {
        findings.push({
          candidateId: item.id,
          source: item.source,
          severity: "error",
          kind: "missing_result",
          message: "Required backup item has no execution result."
        });
      }
      continue;
    }
    if (item.coverage === "required" && result.status === "skipped") {
      findings.push({
        candidateId: item.id,
        source: item.source,
        severity: "error",
        kind: "required_skipped",
        message: "Required backup item was skipped."
      });
    }
    if (result.status === "failed") {
      findings.push({
        candidateId: item.id,
        source: item.source,
        severity: item.coverage === "required" ? "error" : "warning",
        kind: "blob_failed",
        message: result.error ?? "Backup blob failed."
      });
    }
    if (result.metadataStatus === "failed") {
      findings.push({
        candidateId: item.id,
        source: item.source,
        severity: item.coverage === "required" ? "error" : "warning",
        kind: "metadata_failed",
        message: result.metadataError ?? "Backup metadata snapshot failed."
      });
    }
    if (item.coverage === "required" && !result.metadataStatus) {
      findings.push({
        candidateId: item.id,
        source: item.source,
        severity: "error",
        kind: "metadata_missing",
        message: "Required backup item is missing metadata snapshot execution evidence."
      });
    }
  }
  return {
    schema: "ai-pdm-drive-backup-drift-report.v1",
    generatedAt: new Date().toISOString(),
    summary: {
      totalPlanItems: plan.length,
      executableItems: plan.filter((item) => item.coverage !== "excluded").length,
      resultCount: results.length,
      errorCount: findings.filter((finding) => finding.severity === "error").length,
      warningCount: findings.filter((finding) => finding.severity === "warning").length
    },
    findings
  };
}

function summarizePlan(plan) {
  const summary = {
    total: plan.length,
    required: 0,
    selective: 0,
    excluded: 0,
    byReason: {}
  };
  for (const item of plan) {
    summary[item.coverage] += 1;
    summary.byReason[item.reason] = (summary.byReason[item.reason] ?? 0) + 1;
  }
  return summary;
}

function buildMetadataSnapshot(candidate, classification) {
  return {
    schema: "ai-pdm-drive-backup-metadata.v1",
    source: candidate.source,
    id: candidate.id,
    coverage: classification.coverage,
    reason: classification.reason,
    linkedEntityType: candidate.linkedEntityType ?? null,
    linkedEntityId: candidate.linkedEntityId ?? null,
    revision: candidate.revision ?? null,
    filename: candidate.filename,
    fileRole: candidate.fileRole ?? null,
    businessStatus: candidate.businessStatus ?? null,
    storage: classification.coverage === "excluded"
      ? null
      : {
          provider: candidate.provider,
          bucket: candidate.bucket ?? null,
          key: candidate.storageKey
        },
    sha256: candidate.sha256 ?? null,
    fileSize: candidate.bytes ?? null
  };
}

function buildDriveFolderPath(candidate, coverage) {
  return [
    coverage === "required" ? "formal-released" : coverage,
    sanitizeDriveSegment(candidate.source),
    sanitizeDriveSegment(candidate.linkedEntityType ?? "unlinked"),
    sanitizeDriveSegment(candidate.linkedEntityId ?? candidate.id),
    sanitizeDriveSegment(candidate.revision ? `rev-${candidate.revision}` : "rev-unlabeled"),
    sanitizeDriveSegment(candidate.fileRole ?? "file"),
    sanitizeDriveSegment(String(candidate.sha256 ?? candidate.id).slice(0, 16))
  ];
}

function sanitizeDriveSegment(value) {
  return sanitizeDriveFilename(value).replace(/\.+$/g, "").trim() || "unnamed";
}

function sanitizeDriveFilename(value) {
  return String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.\./g, "_")
    .trim() || "unnamed";
}

function metadataFilenameFor(filename) {
  return sanitizeDriveFilename(`${sanitizeDriveFilename(filename)}.metadata.json`);
}

async function main() {
  const report = buildDriveBackupPlanReport();
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0) {
    const outPath = process.argv[outIndex + 1];
    if (!outPath) throw new Error("--out requires a path");
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
