#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildStorageMetadataContext } from "./generate-file-storage-cost-report.mjs";
import { buildStorageMetadataModelBlueprint, buildStorageObjectReferencePreview } from "./storage-metadata-model.mjs";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function toPosixRelative(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function objectSortKey(object) {
  const protectedRank = object.source === "release_packages" || object.fileRole === "release_package" ? 0 : object.businessStatus === "Released" ? 1 : 2;
  const providerRank = object.provider === "local_repository" ? 0 : 1;
  const createdAt = object.createdAt ?? "";
  return `${protectedRank}:${providerRank}:${createdAt}:${object.id}`;
}

function chooseCanonicalObject(group) {
  return [...group].sort((a, b) => {
    const keyA = objectSortKey(a);
    const keyB = objectSortKey(b);
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    return Number(b.bytes || 0) - Number(a.bytes || 0);
  })[0];
}

function validateObjectForDedup(object) {
  if (!object.hash) {
    return { valid: false, reason: "sha256_missing" };
  }
  if (object.hashAlgorithm !== "SHA-256") {
    return { valid: false, reason: "unsupported_hash_algorithm" };
  }
  if (!object.storageKey) {
    return { valid: false, reason: "storage_key_missing" };
  }
  if (object.provider !== "local_repository") {
    return { valid: true, verificationMode: "metadata_only_remote_provider" };
  }
  if (!object.pathForExistenceCheck) {
    return { valid: false, reason: "local_path_missing" };
  }

  const sourcePath = path.resolve(object.pathForExistenceCheck);
  const localRoot = path.resolve(object.localRoot);
  const insideRoot = sourcePath === localRoot || sourcePath.startsWith(localRoot + path.sep);
  if (!insideRoot) {
    return { valid: false, reason: "source_path_outside_local_root" };
  }
  if (!fs.existsSync(sourcePath)) {
    return { valid: false, reason: "source_file_missing" };
  }

  const actualSha256 = sha256File(sourcePath);
  if (actualSha256 !== object.hash) {
    return {
      valid: false,
      reason: "sha256_mismatch",
      expectedSha256: object.hash,
      actualSha256
    };
  }

  return { valid: true, verificationMode: "local_sha256_verified" };
}

function buildPointerPreview(reference) {
  return {
    referenceId: reference.referenceId,
    linkedEntityType: reference.linkedEntityType,
    linkedEntityId: reference.linkedEntityId,
    fileRole: reference.fileRole,
    filename: reference.filename,
    proposedReferenceStatus: "active",
    note: "Requires future storage_object_references schema before pointer can be persisted."
  };
}

export function buildStorageDedupReferenceDryRun(options = {}) {
  const context = buildStorageMetadataContext(options);
  const blueprint = buildStorageMetadataModelBlueprint();
  const references = buildStorageObjectReferencePreview(context.metadataObjects);
  const referencesById = new Map(references.map((reference) => [reference.referenceId, reference]));
  const groups = new Map();
  const skipped = [];

  for (const object of context.metadataObjects) {
    if (!object.hash) {
      skipped.push({
        id: object.id,
        source: object.source,
        provider: object.provider,
        reason: "sha256_missing"
      });
      continue;
    }
    const fingerprint = `${object.provider}:${object.hashAlgorithm ?? "unknown"}:${object.hash}`;
    const group = groups.get(fingerprint) ?? [];
    group.push(object);
    groups.set(fingerprint, group);
  }

  const candidateGroups = [];
  const blocked = [];

  for (const [fingerprint, group] of groups.entries()) {
    if (group.length < 2) continue;
    const validations = group.map((object) => ({ object, validation: validateObjectForDedup(object) }));
    const invalid = validations.filter((item) => !item.validation.valid);
    if (invalid.length) {
      blocked.push({
        fingerprint,
        hash: group[0].hash,
        provider: group[0].provider,
        memberCount: group.length,
        reasons: [...new Set(invalid.map((item) => item.validation.reason))],
        members: invalid.map((item) => ({
          id: item.object.id,
          source: item.object.source,
          filename: item.object.filename,
          storageKey: item.object.storageKey,
          reason: item.validation.reason,
          expectedSha256: item.validation.expectedSha256,
          actualSha256: item.validation.actualSha256
        }))
      });
      continue;
    }

    const canonical = chooseCanonicalObject(group);
    const referencePreviews = group.map((object) => {
      const reference = referencesById.get(`${object.source}:${object.id}`);
      return buildPointerPreview(reference);
    });
    const totalReferenceBytes = group.reduce((sum, object) => sum + Number(object.bytes || 0), 0);
    const canonicalBytes = Number(canonical.bytes || 0);

    candidateGroups.push({
      fingerprint,
      provider: canonical.provider,
      hashAlgorithm: canonical.hashAlgorithm,
      sha256: canonical.hash,
      canonicalObject: {
        id: canonical.id,
        source: canonical.source,
        filename: canonical.filename,
        fileRole: canonical.fileRole,
        storageKey: canonical.storageKey,
        provider: canonical.provider,
        bytes: canonical.bytes,
        lifecycleTier: canonical.lifecycleTier,
        businessStatus: canonical.businessStatus,
        reason: "prefer_released_or_earliest_verified_object"
      },
      references: referencePreviews,
      memberCount: group.length,
      totalReferenceBytes,
      canonicalBytes,
      estimatedRecoverableBytes: Math.max(0, totalReferenceBytes - canonicalBytes),
      verificationModes: [...new Set(validations.map((item) => item.validation.verificationMode))],
      action: "create_one_storage_object_and_many_storage_object_references_after_schema_gate"
    });
  }

  const candidateReferenceCount = candidateGroups.reduce((sum, group) => sum + group.references.length, 0);
  const estimatedRecoverableBytes = candidateGroups.reduce((sum, group) => sum + group.estimatedRecoverableBytes, 0);

  return {
    reportType: "file-storage-dedup-reference-dry-run",
    generatedAt: new Date().toISOString(),
    assumptions: {
      dryRunOnly: true,
      noSchemaMigrationExecuted: true,
      noRuntimeTablesCreated: true,
      noFilesDeleted: true,
      noObjectsMerged: true,
      noMetadataPointersUpdated: true,
      noProviderRequests: true,
      releasedFilesProtected: true
    },
    inputs: {
      dbPath: toPosixRelative(context.root, context.dbPath),
      dbExists: context.dbRows.exists,
      repositoryDir: toPosixRelative(context.root, context.repositoryDir),
      releasePackageDir: toPosixRelative(context.root, context.releasePackageRoot)
    },
    targetSchema: {
      blueprintVersion: blueprint.version,
      status: blueprint.status,
      tables: blueprint.tables.map((table) => table.name)
    },
    summary: {
      totalMetadataObjects: context.metadataObjects.length,
      duplicateHashGroupCount: candidateGroups.length + blocked.length,
      candidateGroupCount: candidateGroups.length,
      candidateReferenceCount,
      estimatedRecoverableBytes,
      blockedGroupCount: blocked.length,
      skippedObjectCount: skipped.length
    },
    candidateGroups,
    blocked,
    skipped,
    recommendations: buildRecommendations(candidateGroups, blocked, skipped)
  };
}

function buildRecommendations(candidateGroups, blocked, skipped) {
  const recommendations = [];
  if (blocked.length) {
    recommendations.push("Resolve missing files, outside-root paths, missing SHA-256, or hash mismatches before enabling deduplication references.");
  }
  if (candidateGroups.length) {
    recommendations.push("Create storage_objects / storage_object_references schema before replacing duplicate physical-object writes.");
  }
  if (candidateGroups.some((group) => group.verificationModes.includes("metadata_only_remote_provider"))) {
    recommendations.push("Remote-provider duplicates require provider-side hash verification before cleanup or pointer consolidation.");
  }
  if (skipped.length) {
    recommendations.push("Backfill SHA-256 metadata for skipped objects before deduplication planning.");
  }
  if (!recommendations.length) {
    recommendations.push("No duplicate SHA-256 reference candidates found. Keep deduplication gate ready for future PDM uploads.");
  }
  return recommendations;
}

function renderMarkdown(report) {
  const lines = [
    "# File Storage Dedup Reference Dry Run",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Guardrails",
    "",
    `- Dry run only: ${report.assumptions.dryRunOnly}`,
    `- No files deleted: ${report.assumptions.noFilesDeleted}`,
    `- No metadata pointers updated: ${report.assumptions.noMetadataPointersUpdated}`,
    `- No provider requests: ${report.assumptions.noProviderRequests}`,
    "",
    "## Summary",
    "",
    `- Metadata objects: ${report.summary.totalMetadataObjects}`,
    `- Candidate groups: ${report.summary.candidateGroupCount}`,
    `- Candidate references: ${report.summary.candidateReferenceCount}`,
    `- Estimated recoverable bytes: ${report.summary.estimatedRecoverableBytes}`,
    `- Blocked groups: ${report.summary.blockedGroupCount}`,
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((item) => `- ${item}`)
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = buildStorageDedupReferenceDryRun();
  const outIndex = process.argv.indexOf("--output");
  if (outIndex >= 0) {
    const outputDir = process.argv[outIndex + 1];
    if (!outputDir) throw new Error("--output requires a directory");
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(path.join(outputDir, "storage-dedup-reference-dry-run.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fsp.writeFile(path.join(outputDir, "storage-dedup-reference-dry-run.md"), renderMarkdown(report), "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
