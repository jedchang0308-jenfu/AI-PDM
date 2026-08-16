#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function importTypeScriptModule(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
  });
  const encoded = Buffer.from(compiled.outputText, "utf8").toString("base64");
  return {
    source,
    module: await import(`data:text/javascript;base64,${encoded}`)
  };
}

async function main() {
  const root = process.cwd();
  const helperPath = path.join(root, "src", "lib", "storage-upload-policy.ts");
  const routePath = path.join(root, "src", "app", "api", "submissions", "route.ts");
  const validationPath = path.join(root, "src", "lib", "validation.ts");
  const configPath = path.join(root, "src", "lib", "config.ts");
  const masterAttachmentPath = path.join(root, "src", "lib", "repositories", "master-attachment-repository.ts");
  const submissionWriteRepositoryPath = path.join(root, "src", "lib", "repositories", "submission-write-async-repository.ts");
  const packagePath = path.join(root, "package.json");

  const { source: helperSource, module: policy } = await importTypeScriptModule(helperPath);
  const routeSource = await fs.readFile(routePath, "utf8");
  const validationSource = await fs.readFile(validationPath, "utf8");
  const configSource = await fs.readFile(configPath, "utf8");
  const masterAttachmentSource = await fs.readFile(masterAttachmentPath, "utf8");
  const submissionWriteRepositorySource = await fs.readFile(submissionWriteRepositoryPath, "utf8");
  const packageJson = await fs.readFile(packagePath, "utf8");

  record(
    "STORAGE-UPLOAD-POLICY-001 default remains 50 MiB",
    policy.getStorageUploadPolicy({}).maxUploadFileBytes === 50 * 1024 * 1024
  );
  record(
    "STORAGE-UPLOAD-POLICY-002 byte env takes precedence over MB env",
    policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "1048576", PDM_STORAGE_MAX_UPLOAD_MB: "500" }).maxUploadFileBytes === 1048576 &&
      policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "1048576", PDM_STORAGE_MAX_UPLOAD_MB: "500" }).source === "PDM_MAX_UPLOAD_FILE_BYTES"
  );
  record(
    "STORAGE-UPLOAD-POLICY-003 storage MB env is accepted for cost-control policy",
    policy.getStorageUploadPolicy({ PDM_STORAGE_MAX_UPLOAD_MB: "2.5" }).maxUploadFileBytes === Math.floor(2.5 * 1024 * 1024) &&
      policy.getStorageUploadPolicy({ PDM_STORAGE_MAX_UPLOAD_MB: "2.5" }).source === "PDM_STORAGE_MAX_UPLOAD_MB"
  );
  record(
    "STORAGE-UPLOAD-POLICY-004 invalid env values fall back safely",
    policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "-1", PDM_STORAGE_MAX_UPLOAD_MB: "0" }).source === "default"
  );
  record(
    "STORAGE-UPLOAD-POLICY-005 master attachment override wins only for attachments",
    policy.getMasterAttachmentUploadPolicy({
      PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES: "12345",
      PDM_MAX_UPLOAD_FILE_BYTES: "1048576"
    }).maxUploadFileBytes === 12345 &&
      policy.getMasterAttachmentUploadPolicy({
        PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES: "12345",
        PDM_MAX_UPLOAD_FILE_BYTES: "1048576"
      }).source === "PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES"
  );
  record(
    "STORAGE-UPLOAD-POLICY-006 master attachment fallback uses shared storage policy",
    policy.getMasterAttachmentUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "2097152" }).maxUploadFileBytes === 2097152
  );
  record(
    "STORAGE-UPLOAD-POLICY-007 validator flags files above configured limit",
    policy.validateStorageUploadFile({ name: "large.step", size: 1025 }, policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "1024" })).code === "file_too_large"
  );
  record(
    "STORAGE-UPLOAD-POLICY-008 validator passes files at configured limit",
    policy.validateStorageUploadFile({ name: "limit.step", size: 1024 }, policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "1024" })).ok === true
  );
  record(
    "STORAGE-UPLOAD-POLICY-009 default large-file threshold is 500 MiB",
    policy.getStorageUploadPolicy({}).largeFileThresholdBytes === 500 * 1024 * 1024 &&
      policy.getStorageUploadPolicy({}).largeFileThresholdSource === "default"
  );
  record(
    "STORAGE-UPLOAD-POLICY-010 large-file threshold env is accepted",
    policy.getStorageUploadPolicy({ PDM_STORAGE_LARGE_FILE_THRESHOLD_MB: "750" }).largeFileThresholdBytes === 750 * 1024 * 1024 &&
      policy.getStorageUploadPolicy({ PDM_STORAGE_LARGE_FILE_THRESHOLD_MB: "750" }).largeFileThresholdSource === "PDM_STORAGE_LARGE_FILE_THRESHOLD_MB"
  );
  record(
    "STORAGE-UPLOAD-POLICY-011 large-file threshold cannot be below max upload",
    policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "10485760", PDM_STORAGE_LARGE_FILE_THRESHOLD_MB: "1" }).largeFileThresholdBytes === 10485760 &&
      policy.getStorageUploadPolicy({ PDM_MAX_UPLOAD_FILE_BYTES: "10485760", PDM_STORAGE_LARGE_FILE_THRESHOLD_MB: "1" }).largeFileThresholdSource === "clamped_to_max_upload"
  );
  const decisionPolicy = policy.getStorageUploadPolicy({
    PDM_MAX_UPLOAD_FILE_BYTES: String(50 * 1024 * 1024),
    PDM_STORAGE_LARGE_FILE_THRESHOLD_MB: "500"
  });
  record(
    "STORAGE-UPLOAD-POLICY-012 files within max limit use normal upload",
    policy.getStorageUploadDecision({ name: "normal.pdf", size: 50 * 1024 * 1024 }, decisionPolicy).disposition === "normal_upload"
  );
  record(
    "STORAGE-UPLOAD-POLICY-013 files above max but below large threshold require Admin override",
    policy.getStorageUploadDecision({ name: "medium.step", size: 100 * 1024 * 1024 }, decisionPolicy).disposition === "admin_override_required"
  );
  record(
    "STORAGE-UPLOAD-POLICY-014 files above large threshold require alternate large-file path",
    policy.getStorageUploadDecision({ name: "huge.sldasm", size: 501 * 1024 * 1024 }, decisionPolicy).disposition === "alternate_large_file_path_required"
  );
  record(
    "STORAGE-UPLOAD-POLICY-015 actionable decisions omit normal uploads",
    policy.getActionableStorageUploadDecisions(
      [
        { name: "normal.pdf", size: 1024 },
        { name: "medium.step", size: 100 * 1024 * 1024 },
        { name: "huge.sldasm", size: 501 * 1024 * 1024 }
      ],
      decisionPolicy
    ).length === 2
  );
  record(
    "STORAGE-UPLOAD-POLICY-016 validator exposes disposition for oversized files",
    policy.validateStorageUploadFile({ name: "huge.sldasm", size: 501 * 1024 * 1024 }, decisionPolicy).disposition ===
      "alternate_large_file_path_required"
  );
  const largeFileIntakePackage = policy.getAlternateLargeFileIntakePackage(
    [
      { name: "medium.step", size: 100 * 1024 * 1024 },
      { name: "huge.sldasm", size: 501 * 1024 * 1024 }
    ],
    decisionPolicy
  );
  record(
    "STORAGE-UPLOAD-POLICY-017 alternate large-file package is required only for threshold breaches",
    largeFileIntakePackage.required === true &&
      largeFileIntakePackage.blockedNormalSubmission === true &&
      largeFileIntakePackage.items.length === 1 &&
      largeFileIntakePackage.items[0].filename === "huge.sldasm"
  );
  record(
    "STORAGE-UPLOAD-POLICY-018 alternate large-file package exposes intake metadata contract",
    largeFileIntakePackage.packageVersion === "storage-large-file-intake/v1" &&
      largeFileIntakePackage.items[0].intakeAction === "register_external_storage_object" &&
      largeFileIntakePackage.items[0].auditAction === "LargeFileIntakeRequired" &&
      largeFileIntakePackage.items[0].requiredMetadata.includes("sha256") &&
      largeFileIntakePackage.items[0].requiredMetadata.includes("objectKey") &&
      largeFileIntakePackage.items[0].allowedProviderProfiles.includes("s3_compatible")
  );
  record(
    "STORAGE-UPLOAD-POLICY-019 alternate large-file package is empty for normal and Admin-override files",
    policy.getAlternateLargeFileIntakePackage(
      [
        { name: "normal.pdf", size: 1024 },
        { name: "medium.step", size: 100 * 1024 * 1024 }
      ],
      decisionPolicy
    ).required === false
  );
  record(
    "STORAGE-UPLOAD-POLICY-020 submissions route uses shared policy",
    routeSource.includes('from "@/lib/storage-upload-policy";') &&
      routeSource.includes("const uploadPolicy = getStorageUploadPolicy()") &&
      routeSource.includes("uploadPolicy.maxUploadFileBytes") &&
      !routeSource.includes("function getMaxUploadFileBytes")
  );
  record(
    "STORAGE-UPLOAD-POLICY-021 submissions route emits upload decision detail codes",
    routeSource.includes("const uploadDecisions = getActionableStorageUploadDecisions(files, uploadPolicy)") &&
      routeSource.includes("storage_upload_decision=") &&
      routeSource.includes("large_file_threshold_bytes=")
  );
  record(
    "STORAGE-UPLOAD-POLICY-022 submissions route emits alternate large-file intake detail codes",
    routeSource.includes("const largeFileIntakePackage = getAlternateLargeFileIntakePackage(files, uploadPolicy)") &&
      routeSource.includes("large_file_intake_required=true") &&
      routeSource.includes("required_metadata=") &&
      routeSource.includes("allowed_provider_profiles=")
  );
  record(
    "STORAGE-UPLOAD-POLICY-023 validation supports controlled oversized-file override",
    validationSource.includes("allowOversizedFiles?: boolean") &&
      validationSource.includes("!options.allowOversizedFiles && file.size > maxFileBytes")
  );
  record(
    "STORAGE-UPLOAD-POLICY-024 submissions route reads Admin upload override form fields",
    routeSource.includes('form.get("storage_upload_override")') &&
      routeSource.includes('form.get("storage_upload_override_reason")') &&
      routeSource.includes("parseBooleanFormValue")
  );
  record(
    "STORAGE-UPLOAD-POLICY-025 submissions route allows oversized validation only after approved override",
    routeSource.includes("allowOversizedFiles: uploadOverride.approved") &&
      routeSource.includes("for (const decision of uploadOverride.approved ? [] : uploadDecisions)")
  );
  record(
    "STORAGE-UPLOAD-POLICY-026 submissions route restricts override to Admin with a reason",
    routeSource.includes('input.actorRole !== "Admin"') &&
      routeSource.includes("storage_upload_override_denied:admin_role_required") &&
      routeSource.includes("storage_upload_override_denied:reason_required")
  );
  record(
    "STORAGE-UPLOAD-POLICY-027 submissions route blocks override for alternate large-file path",
    routeSource.includes('decision.disposition === "alternate_large_file_path_required"') &&
      routeSource.includes("storage_upload_override_denied:alternate_large_file_path_required")
  );
  record(
    "STORAGE-UPLOAD-POLICY-028 submissions route forwards override audit payload",
    routeSource.includes("storageUploadOverride: uploadOverride.audit")
  );
  record(
    "STORAGE-UPLOAD-POLICY-029 submission write repository accepts override audit payload",
    submissionWriteRepositorySource.includes("storageUploadOverride?:") &&
      submissionWriteRepositorySource.includes("approvedBy: string") &&
      submissionWriteRepositorySource.includes("largeFileThresholdBytes: number")
  );
  record(
    "STORAGE-UPLOAD-POLICY-030 Submit audit includes override payload when present",
    submissionWriteRepositorySource.includes("storageUploadOverride: input.storageUploadOverride") &&
      submissionWriteRepositorySource.includes("fileCount: input.files.length")
  );
  record(
    "STORAGE-UPLOAD-POLICY-031 config uses shared policy",
    configSource.includes('import { getStorageUploadPolicy } from "@/lib/storage-upload-policy";') &&
      configSource.includes("maxUploadFileBytes: getStorageUploadPolicy().maxUploadFileBytes")
  );
  record(
    "STORAGE-UPLOAD-POLICY-032 master attachments use shared policy with scoped override",
    masterAttachmentSource.includes('import { getMasterAttachmentUploadPolicy } from "@/lib/storage-upload-policy";') &&
      masterAttachmentSource.includes("getMasterAttachmentUploadPolicy().maxUploadFileBytes")
  );
  record(
    "STORAGE-UPLOAD-POLICY-033 helper keeps legacy and storage cost env names visible",
    helperSource.includes("PDM_MAX_UPLOAD_FILE_BYTES") &&
      helperSource.includes("PDM_STORAGE_MAX_UPLOAD_MB") &&
      helperSource.includes("PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES") &&
      helperSource.includes("PDM_STORAGE_LARGE_FILE_THRESHOLD_MB")
  );
  record(
    "STORAGE-UPLOAD-POLICY-034 package script is registered",
    packageJson.includes('"qc:file-storage-upload-policy"')
  );

  const serialized = JSON.stringify({ helperSource, routeSource, validationSource, configSource, masterAttachmentSource, submissionWriteRepositorySource });
  record(
    "STORAGE-UPLOAD-POLICY-035 QC output does not expose common cloud secret markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
