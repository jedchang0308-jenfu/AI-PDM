#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import ts from "typescript";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function compileTypeScript(filePath, replacements = {}) {
  let source = await fs.readFile(filePath, "utf8");
  for (const [from, to] of Object.entries(replacements)) {
    source = source.replaceAll(from, to);
  }

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
  });
  return { source, url: toDataUrl(compiled.outputText) };
}

class TestAsyncDatabaseClient {
  kind = "sqlite";

  constructor(database) {
    this.database = database;
  }

  async query(sql, params) {
    return this.database.prepare(sql).all(params ?? {});
  }

  async queryOne(sql, params) {
    return this.database.prepare(sql).get(params ?? {}) ?? null;
  }

  async execute(sql, params) {
    this.database.prepare(sql).run(params ?? {});
  }

  async transaction(fn) {
    return this.database.transaction(() => fn(this))();
  }

  async close() {}
}

function createIntakeDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE storage_objects (
      object_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      bucket TEXT NOT NULL,
      object_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      hash_algorithm TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      mime_type TEXT,
      lifecycle_tier TEXT NOT NULL,
      object_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(provider_id, bucket, object_key)
    );

    CREATE TABLE storage_object_references (
      reference_id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL,
      linked_entity_type TEXT NOT NULL,
      linked_entity_id TEXT NOT NULL,
      file_role TEXT NOT NULL,
      filename TEXT NOT NULL,
      reference_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(object_id, linked_entity_type, linked_entity_id, file_role, filename)
    );

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      actor_id TEXT,
      action TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

try {
  const root = process.cwd();
  const policyPath = path.join(root, "src", "lib", "storage-upload-policy.ts");
  const intakePath = path.join(root, "src", "lib", "external-large-file-intake.ts");
  const intakeAsyncPath = path.join(root, "src", "lib", "external-large-file-intake-async.ts");
  const repositoryPath = path.join(root, "src", "lib", "repositories", "external-large-file-intake-async-repository.ts");
  const packagePath = path.join(root, "package.json");
  const planPath = path.join(root, ".ai-doc", "reports", "pm", "pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskPath = path.join(root, ".ai-doc", "dev_task.md");

  const policyCompiled = await compileTypeScript(policyPath);
  const policy = await import(policyCompiled.url);
  const intakeCompiled = await compileTypeScript(intakePath, {
    '"@/lib/storage-upload-policy"': `"${policyCompiled.url}"`,
    '"@/lib/types"': `"${toDataUrl("export {};")}"`
  });
  const intake = await import(intakeCompiled.url);
  const repositoryCompiled = await compileTypeScript(repositoryPath, {
    '"@/lib/external-large-file-intake"': `"${intakeCompiled.url}"`,
    '"@/lib/db-async-provider"': `"${toDataUrl("export {};")}"`
  });
  const repository = await import(repositoryCompiled.url);

  const packageJson = await fs.readFile(packagePath, "utf8");
  const intakeAsyncSource = await fs.readFile(intakeAsyncPath, "utf8");
  const repositorySource = await fs.readFile(repositoryPath, "utf8");
  const planSource = await fs.readFile(planPath, "utf8");
  const devTaskSource = await fs.readFile(devTaskPath, "utf8");

  const policyForLargeFiles = policy.getStorageUploadPolicy({
    PDM_MAX_UPLOAD_FILE_BYTES: String(50 * 1024 * 1024),
    PDM_STORAGE_LARGE_FILE_THRESHOLD_MB: "500"
  });
  const validInput = {
    submissionId: "sub-large-intake",
    linkedEntityType: "submission_file",
    linkedEntityId: "file-large-intake",
    filename: "large-assembly.sldasm",
    fileRole: "sldasm",
    owner: "engineering",
    sourcePath: "\\\\nas\\incoming\\large-assembly.sldasm",
    provider: "s3_compatible",
    providerId: "wasabi-prod",
    bucket: "pdm-large-files",
    objectKey: "sub-large-intake/large-assembly.sldasm",
    sha256: "a".repeat(64),
    fileSize: 501 * 1024 * 1024,
    mimeType: "application/octet-stream",
    retentionClass: "archive",
    restoreOwner: "pdm-admin",
    registeredBy: "user-admin-demo"
  };

  record(
    "EXTERNAL-LARGE-FILE-INTAKE-001 contract version is stable",
    intake.EXTERNAL_LARGE_FILE_INTAKE_CONTRACT_VERSION === "external-large-file-intake/v1"
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-002 valid large-file registration passes policy",
    intake.validateExternalLargeFileRegistrationInput(validInput, policyForLargeFiles).ok === true
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-003 normal-sized file is rejected",
    intake
      .validateExternalLargeFileRegistrationInput({ ...validInput, fileSize: 100 * 1024 * 1024 }, policyForLargeFiles)
      .errors.includes("alternate_large_file_path_not_required:admin_override_required")
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-004 unsupported provider profile is rejected",
    intake
      .validateExternalLargeFileRegistrationInput({ ...validInput, provider: "public_bucket" }, policyForLargeFiles)
      .errors.includes("unsupported_provider_profile:public_bucket")
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-005 invalid hash is rejected",
    intake.validateExternalLargeFileRegistrationInput({ ...validInput, sha256: "not-a-hash" }, policyForLargeFiles).errors.includes("invalid_sha256")
  );
  const auditDetail = intake.buildExternalLargeFileAuditDetail(validInput, {
    objectId: "obj-large",
    referenceId: "ref-large"
  });
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-006 audit detail records source path presence without raw source path",
    auditDetail.sourcePathRecorded === true && !JSON.stringify(auditDetail).includes(validInput.sourcePath)
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-007 repository targets storage object and reference tables",
    repositorySource.includes("INSERT INTO storage_objects") &&
      repositorySource.includes("INSERT INTO storage_object_references") &&
      repositorySource.includes("INSERT INTO audit_logs")
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-008 repository preserves provider-neutral object identity",
    repositorySource.includes("ON CONFLICT(provider_id, bucket, object_key)") &&
      repositorySource.includes("RETURNING object_id") &&
      repositorySource.includes("RETURNING reference_id")
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-009 service helper uses async database provider",
    intakeAsyncSource.includes("getAsyncDatabaseClient") && intakeAsyncSource.includes("registerExternalLargeFileObjectAsync")
  );

  const database = createIntakeDatabase();
  const client = new TestAsyncDatabaseClient(database);
  let id = 0;
  const repo = new repository.AsyncExternalLargeFileIntakeRepository(
    client,
    () => "2026-06-11T10:00:00.000Z",
    () => `id-${++id}`
  );
  const registration = await repo.registerExternalLargeFile(validInput);
  const objects = database.prepare("SELECT * FROM storage_objects").all();
  const references = database.prepare("SELECT * FROM storage_object_references").all();
  const audits = database.prepare("SELECT * FROM audit_logs").all();
  const parsedAudit = JSON.parse(audits[0].detail_json);

  record(
    "EXTERNAL-LARGE-FILE-INTAKE-010 semantic registration inserts object reference and audit",
    registration.auditAction === "LargeFileIntakeRegistered" &&
      objects.length === 1 &&
      references.length === 1 &&
      audits.length === 1 &&
      objects[0].provider_id === "wasabi-prod" &&
      references[0].linked_entity_id === "file-large-intake" &&
      audits[0].action === "LargeFileIntakeRegistered"
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-011 semantic audit omits raw source path and signed URL material",
    parsedAudit.sourcePathRecorded === true &&
      !audits[0].detail_json.includes(validInput.sourcePath) &&
      !/(X-Amz|signedURL|service_role|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(audits[0].detail_json)
  );

  await repo.registerExternalLargeFile({ ...validInput, mimeType: null });
  const objectCountAfterDuplicate = database.prepare("SELECT COUNT(*) AS count FROM storage_objects").get().count;
  const referenceCountAfterDuplicate = database.prepare("SELECT COUNT(*) AS count FROM storage_object_references").get().count;
  const auditCountAfterDuplicate = database.prepare("SELECT COUNT(*) AS count FROM audit_logs").get().count;
  database.close();
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-012 duplicate registration upserts object/reference and appends audit",
    Number(objectCountAfterDuplicate) === 1 && Number(referenceCountAfterDuplicate) === 1 && Number(auditCountAfterDuplicate) === 2
  );
  record("EXTERNAL-LARGE-FILE-INTAKE-013 package script is registered", packageJson.includes('"qc:external-large-file-intake"'));
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-014 PM evidence references Phase 4Q",
    planSource.includes("Phase 4Q") && devTaskSource.includes("Phase 4Q")
  );
  record(
    "EXTERNAL-LARGE-FILE-INTAKE-015 contract does not perform live provider IO",
    !repositorySource.includes("fetch(") &&
      !repositorySource.includes("createDownloadUrl") &&
      !repositorySource.includes("putObject") &&
      !repositorySource.includes("deleteObject")
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
