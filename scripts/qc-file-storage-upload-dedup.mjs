#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

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

async function compileFileStorageModule(outputDir) {
  const source = read("src/lib/file-storage.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true
    },
    fileName: "file-storage.ts"
  });
  const outputPath = path.join(outputDir, "file-storage.mjs");
  await fsp.writeFile(outputPath, compiled.outputText, "utf8");
  return outputPath;
}

try {
  const packageJson = JSON.parse(read("package.json"));
  const storageSource = read("src/lib/file-storage.ts");
  const submissionWriteRepository = read("src/lib/repositories/submission-write-async-repository.ts");
  const devTask = read(".ai-doc/dev_task.md");

  record(
    "STORAGE-UPLOAD-DEDUP-001 package script is registered",
    packageJson.scripts?.["qc:file-storage-upload-dedup"] === "node scripts/qc-file-storage-upload-dedup.mjs"
  );
  record(
    "STORAGE-UPLOAD-DEDUP-002 local adapter computes hash before write",
    includesAll(storageSource, ["const contentHash = sha256(input.bytes)", "findExistingObjectBySha256(contentHash)", "await fs.writeFile(localPath, input.bytes)"])
  );
  record(
    "STORAGE-UPLOAD-DEDUP-003 local adapter returns existing object when duplicate hash exists",
    includesAll(storageSource, ["if (existing) {", "key: existing.key", "localPath: existing.localPath", "bytes: existing.bytes", "sha256: contentHash"])
  );
  record(
    "STORAGE-UPLOAD-DEDUP-004 dedup scan stays inside repository root",
    includesAll(storageSource, ["path.resolve(/*turbopackIgnore: true*/ this.repositoryDir)", "listLocalRepositoryFiles(repositoryRoot)", "path.relative(repositoryRoot, localPath)"])
  );
  record(
    "STORAGE-UPLOAD-DEDUP-005 dev_task tracks upload-time dedup requirement",
    devTask.includes("重複檔案上傳時不重複存 physical object")
  );

  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-dedup-"));
  const modulePath = await compileFileStorageModule(tmpRoot);
  const { LocalRepositoryStorageAdapter, sha256 } = await import(pathToFileURL(modulePath).href);
  const repositoryDir = path.join(tmpRoot, "repository");
  const storage = new LocalRepositoryStorageAdapter(repositoryDir);

  const firstBytes = Buffer.from("same uploaded CAD bytes");
  const secondBytes = Buffer.from("same uploaded CAD bytes");
  const differentBytes = Buffer.from("different uploaded PDF bytes");

  const first = await storage.putObject({ key: "pending/2026/06/SUB-A/source.sldprt", bytes: firstBytes });
  const duplicate = await storage.putObject({ key: "pending/2026/06/SUB-B/copy.sldprt", bytes: secondBytes });
  const different = await storage.putObject({ key: "pending/2026/06/SUB-C/source.pdf", bytes: differentBytes });

  const physicalFiles = [];
  async function collectFiles(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await collectFiles(entryPath);
      if (entry.isFile()) physicalFiles.push(entryPath);
    }
  }
  await collectFiles(repositoryDir);

  record("STORAGE-UPLOAD-DEDUP-006 duplicate upload reuses canonical local path", duplicate.localPath === first.localPath, JSON.stringify({ first: first.localPath, duplicate: duplicate.localPath }));
  record("STORAGE-UPLOAD-DEDUP-007 duplicate upload reuses canonical storage key", duplicate.key === first.key, JSON.stringify({ first: first.key, duplicate: duplicate.key }));
  record("STORAGE-UPLOAD-DEDUP-008 duplicate upload keeps caller-visible hash", duplicate.sha256 === sha256(secondBytes), duplicate.sha256);
  record("STORAGE-UPLOAD-DEDUP-009 different content still writes a separate physical object", different.localPath !== first.localPath, JSON.stringify({ first: first.localPath, different: different.localPath }));
  record("STORAGE-UPLOAD-DEDUP-010 repository has two physical files for three writes with one duplicate", physicalFiles.length === 2, JSON.stringify(physicalFiles));
  record("STORAGE-UPLOAD-DEDUP-011 readObject reads reused duplicate bytes", (await storage.readObject(duplicate.key)).equals(firstBytes));
  record("STORAGE-UPLOAD-DEDUP-012 verifyObjectHash passes for reused duplicate key", await storage.verifyObjectHash(duplicate.key, duplicate.sha256));
  record(
    "STORAGE-UPLOAD-DEDUP-013 business file rows are still inserted per uploaded file",
    includesAll(submissionWriteRepository, ["const fileEntries = input.files.map", "for (const file of fileEntries)", "INSERT_ASYNC_SUBMISSION_FILE_SQL"])
  );
  record(
    "STORAGE-UPLOAD-DEDUP-014 submit audit still records original upload file count",
    includesAll(submissionWriteRepository, ['action: "Submit"', "fileCount: input.files.length"])
  );

  await fsp.rm(tmpRoot, { recursive: true, force: true });
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
