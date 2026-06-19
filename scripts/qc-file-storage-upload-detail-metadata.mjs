#!/usr/bin/env node

import fs from "node:fs";

const results = [];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function ordered(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

try {
  const packageJson = JSON.parse(read("package.json"));
  const validation = read("src/lib/validation.ts");
  const fileStore = read("src/lib/file-store.ts");
  const submissionRoute = read("src/app/api/submissions/route.ts");
  const detailRoute = read("src/app/api/submissions/[id]/route.ts");
  const writeRepository = read("src/lib/repositories/submission-write-async-repository.ts");
  const listRepository = read("src/lib/repositories/submission-list-async-repository.ts");
  const types = read("src/lib/types.ts");
  const apiQc = read("scripts/qc-api-test.mjs");

  record(
    "STORAGE-UPLOAD-METADATA-001 package script is registered",
    packageJson.scripts?.["qc:file-storage-upload-detail-metadata"] ===
      "node scripts/qc-file-storage-upload-detail-metadata.mjs"
  );
  record(
    "STORAGE-UPLOAD-METADATA-002 validation allows CAD/PDF/DWG upload roles",
    includesAll(validation, ['"sldprt"', '"sldasm"', '"slddrw"', '"pdf"', '"dwg"', "normalizeFileRole(filename: string)"])
  );
  record(
    "STORAGE-UPLOAD-METADATA-003 SubmissionFile type exposes detail metadata",
    includesAll(types, [
      "export type SubmissionFile",
      "file_role: FileRole",
      "original_filename: string",
      "local_path: string",
      "gdrive_status",
      "sha256: string",
      "file_size: number",
      "created_at: string"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-004 upload path collects all form files before validation",
    includesAll(submissionRoute, ['form.getAll("files")', "validateUploadedFiles(files", "saveUploadedFiles(submissionFolderName, files)"])
  );
  record(
    "STORAGE-UPLOAD-METADATA-005 file-store writes through storage service and records role/hash/size/path",
    includesAll(fileStore, [
      "createFileStorageService()",
      "Buffer.from(await file.arrayBuffer())",
      "normalizeFileRole(file.name)",
      "originalFilename: file.name",
      "localPath: stored.localPath",
      "sha256: stored.sha256",
      "fileSize: stored.bytes"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-006 createSubmissionRecordAsync receives saved files",
    ordered(submissionRoute, "const savedFiles = await saveUploadedFiles", "files: savedFiles")
  );
  record(
    "STORAGE-UPLOAD-METADATA-007 repository inserts role/name/path/hash/size metadata",
    includesAll(writeRepository, [
      "INSERT INTO submission_files",
      "file_role, original_filename, local_path, gdrive_file_id",
      "sha256, file_size, created_at",
      ":fileRole",
      ":originalFilename",
      ":localPath",
      ":sha256",
      ":fileSize"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-008 detail repository selects all submission files",
    includesAll(listRepository, [
      "SELECT_ASYNC_SUBMISSION_FILES_SQL",
      "SELECT *",
      "FROM submission_files",
      "WHERE submission_id = :id",
      "ORDER BY created_at ASC"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-009 detail payload returns normalized files and file role summary",
    includesAll(listRepository, [
      "files: files.map(normalizeSubmissionFile)",
      "file_count: files.length",
      "file_roles: fileRoles || null",
      "file_size: Number(file.file_size ?? 0)"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-010 detail route uses async auth and canReadSubmission before returning payload",
    ordered(detailRoute, "requireAuthAsync(request)", "getSubmissionAsync(id)") &&
      ordered(detailRoute, "canReadSubmission(auth.user, submission)", "NextResponse.json({ submission })")
  );
  record(
    "STORAGE-UPLOAD-METADATA-011 qc:api already exercises created submission detail file metadata",
    includesAll(apiQc, [
      "duplicateSeedDetail.submission?.files?.find((file) => file.file_role === \"pdf\")",
      "pdfFile?.original_filename",
      "FILE-001 submission file download returns 200"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-012 qc:api already exercises native CAD upload roles",
    includesAll(apiQc, [
      "QC-MARKUP-NONPDF-",
      ".sldprt",
      "nonPdfFile = nonPdfMarkupDetailBody.submission?.files?.find((file) => file.file_role === \"sldprt\")"
    ])
  );
  record(
    "STORAGE-UPLOAD-METADATA-013 qc:api already exercises DWG missing-role metadata consumers",
    includesAll(apiQc, ["SUMMARY-009 AI summary reports missing DWG", "missing_file_roles?.includes(\"dwg\")"])
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        passed: results.length,
        failed: 1,
        error: error instanceof Error ? error.message : String(error),
        results
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
