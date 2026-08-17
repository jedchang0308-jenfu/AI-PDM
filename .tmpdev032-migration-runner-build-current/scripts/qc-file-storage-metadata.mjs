#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildStorageDeduplicationPreview,
  buildStorageMetadataModelBlueprint,
  buildStorageObjectReferencePreview,
  STORAGE_METADATA_REQUIRED_DESCRIPTOR_FIELDS,
  validateStorageMetadataDescriptor
} from "./storage-metadata-model.mjs";
import { normalizeStorageMetadataRows, safeRelative } from "./storage-metadata-normalizer.mjs";

function record(results, name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

async function main() {
  const results = [];
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-metadata-qc-"));
  try {
    const repositoryDir = path.join(tempRoot, "repository");
    const releasePackageRoot = path.join(tempRoot, "release-packages");
    await fs.mkdir(path.join(repositoryDir, "submissions"), { recursive: true });
    await fs.mkdir(releasePackageRoot, { recursive: true });

    const sharedHash = "a".repeat(64);
    const rows = {
      submissionFiles: [
        {
          id: "sub-file-1",
          submission_id: "sub-1",
          file_role: "sldprt",
          original_filename: "part-a.sldprt",
          local_path: path.join(repositoryDir, "submissions", "part-a.sldprt"),
          sha256: sharedHash.toUpperCase(),
          file_size: 128,
          created_at: "2026-06-11T00:00:00.000Z",
          submission_status: "Pending"
        }
      ],
      releasePackages: [
        {
          id: "pkg-1",
          submission_id: "sub-1",
          package_filename: "release.zip",
          local_path: path.join(releasePackageRoot, "release.zip"),
          sha256: "b".repeat(64),
          file_size: 256,
          created_at: "2026-06-11T00:01:00.000Z"
        }
      ],
      fileAssets: [
        {
          id: "asset-local-legacy",
          storage_provider: "j_drive",
          original_path: path.join(repositoryDir, "submissions", "part-a-copy.sldprt"),
          storage_key: "legacy/part-a-copy.sldprt",
          file_name: "part-a-copy.sldprt",
          file_ext: ".sldprt",
          mime_type: "application/octet-stream",
          file_size: 128,
          content_hash: sharedHash,
          hash_algorithm: "sha-256",
          linked_entity_type: "part_number",
          linked_entity_id: "P-001",
          document_category: "cad",
          sync_status: "ready",
          deleted_at: null,
          created_at: "2026-06-11T00:02:00.000Z"
        },
        {
          id: "asset-s3",
          storage_provider: "s3_compatible",
          original_path: null,
          storage_key: "pdm/hot/asset-s3.step",
          file_name: "asset-s3.step",
          file_ext: ".step",
          mime_type: "application/step",
          file_size: 64,
          content_hash: "c".repeat(64),
          hash_algorithm: "SHA-256",
          linked_entity_type: "part_number",
          linked_entity_id: "P-002",
          document_category: "cad",
          sync_status: "migrated",
          deleted_at: null,
          created_at: "2026-06-11T00:03:00.000Z"
        },
        {
          id: "asset-r2-future",
          storage_provider: "cloudflare_r2",
          original_path: null,
          storage_key: "pdm/cold/asset-r2.step",
          file_name: "asset-r2.step",
          file_ext: ".step",
          mime_type: "application/step",
          file_size: 32,
          content_hash: "d".repeat(64),
          hash_algorithm: "SHA-256",
          linked_entity_type: "part_number",
          linked_entity_id: "P-003",
          document_category: "cad",
          sync_status: "archived",
          deleted_at: "2026-06-11T00:04:00.000Z",
          created_at: "2026-06-11T00:04:00.000Z"
        }
      ]
    };

    const objects = normalizeStorageMetadataRows(rows, { root: tempRoot, repositoryDir, releasePackageRoot });
    const blueprint = buildStorageMetadataModelBlueprint();
    const references = buildStorageObjectReferencePreview(objects);
    const dedupGroups = buildStorageDeduplicationPreview(objects);
    const descriptorResults = objects.map((object) => validateStorageMetadataDescriptor(object));

    record(results, "STORAGE-METADATA-001 descriptor count includes all legacy sources", objects.length === 5, String(objects.length));
    record(
      results,
      "STORAGE-METADATA-002 every descriptor has required model fields",
      objects.every((object) => STORAGE_METADATA_REQUIRED_DESCRIPTOR_FIELDS.every((field) => field in object))
    );
    record(results, "STORAGE-METADATA-003 descriptors validate against model contract", descriptorResults.every((result) => result.valid), JSON.stringify(descriptorResults.filter((result) => !result.valid)));
    record(results, "STORAGE-METADATA-004 legacy j_drive provider normalizes to local_repository", objects.some((object) => object.id === "asset-local-legacy" && object.provider === "local_repository"));
    record(results, "STORAGE-METADATA-005 future provider ids pass through without enum changes", objects.some((object) => object.id === "asset-r2-future" && object.provider === "cloudflare_r2"));
    record(results, "STORAGE-METADATA-006 release package descriptor is protected by source and role", objects.some((object) => object.id === "pkg-1" && object.source === "release_packages" && object.fileRole === "release_package"));
    record(results, "STORAGE-METADATA-007 local storage keys remain repository-relative", objects.some((object) => object.id === "sub-file-1" && object.storageKey === "submissions/part-a.sldprt"));
    record(results, "STORAGE-METADATA-008 safeRelative blocks out-of-root path traversal", safeRelative(repositoryDir, path.join(tempRoot, "outside.txt")).startsWith("[external]/"));
    record(results, "STORAGE-METADATA-009 blueprint is explicitly not applied as a live migration", blueprint.status === "blueprint_not_applied" && blueprint.guardrails.noSchemaMigrationExecuted === true);
    record(results, "STORAGE-METADATA-010 provider registry table is required", blueprint.tables.some((table) => table.name === "storage_providers"));
    record(results, "STORAGE-METADATA-011 storage objects use provider_id reference", blueprint.tables.some((table) => table.name === "storage_objects" && table.requiredColumns.includes("provider_id") && table.constraints.some((constraint) => /references storage_providers/i.test(constraint))));
    record(results, "STORAGE-METADATA-012 blueprint avoids provider enum CHECK on storage_objects", blueprint.guardrails.noProviderCheckConstraintEnum === true && !JSON.stringify(blueprint.tables.find((table) => table.name === "storage_objects")).includes("CHECK (provider"));
    record(results, "STORAGE-METADATA-013 object references model supports many business records per physical object", blueprint.tables.some((table) => table.name === "storage_object_references" && table.requiredColumns.includes("object_id") && table.requiredColumns.includes("linked_entity_type")));
    record(results, "STORAGE-METADATA-014 reference preview preserves business linkage", references.some((reference) => reference.referenceId === "file_assets:asset-s3" && reference.linkedEntityType === "part_number" && reference.linkedEntityId === "P-002"));
    record(results, "STORAGE-METADATA-015 dedup preview groups shared SHA-256 references", dedupGroups.some((group) => group.referenceCount === 2 && group.estimatedRecoverableBytes === 128));
    record(results, "STORAGE-METADATA-016 deleted file assets become cold lifecycle descriptors", objects.some((object) => object.id === "asset-r2-future" && object.lifecycleTier === "cold" && object.businessStatus === "Deleted"));
    record(results, "STORAGE-METADATA-017 package script is registered", (await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")).includes('"qc:file-storage-metadata"'));

    const serialized = JSON.stringify({ blueprint, objects, references, dedupGroups });
    record(results, "STORAGE-METADATA-018 metadata QC output does not expose common cloud secret markers", !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized));

    const failed = results.filter((result) => !result.passed);
    const summary = { passed: results.length - failed.length, failed: failed.length, results };
    console.log(JSON.stringify(summary, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
