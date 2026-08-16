#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const root = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-system-health-fmea-"));
const databasePath = path.join(temporaryRoot, "ai-pdm.sqlite");
const repositoryDir = path.join(temporaryRoot, "repository");
const originalRepositoryDir = process.env.PDM_REPOSITORY_DIR;
const originalMaxUploadBytes = process.env.PDM_MAX_UPLOAD_FILE_BYTES;

process.env.PDM_REPOSITORY_DIR = repositoryDir;

const db = new Database(databasePath);
db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
db.pragma("foreign_keys = ON");

const now = "2026-08-09T00:00:00.000Z";
db.prepare("INSERT INTO companies (id, company_code, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
  .run("company-qc", "QC", "QC Company", now, now);
db.prepare(
  "INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run("user-qc", "QC Manager", "qc-manager@example.invalid", "R&D Manager", "company-qc", now, now);
db.prepare(
  "INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run("item-parent", "company-qc", "QC-PARENT", "QC Parent", "A", now, now);
db.prepare(
  `INSERT INTO submissions (
    id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
    change_description, status, submitted_by, approval_required, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  "submission-parent",
  "company-qc",
  "item-parent",
  "QC-DRAWING",
  "A",
  "QC",
  "QC",
  "Assembly",
  "QC FMEA fixture",
  "Pending",
  "user-qc",
  1,
  now,
  now
);

const { SQLiteAsyncDatabaseClient } = await import(
  pathToFileURL(path.join(root, "src", "lib", "db-async-provider.ts")).href
);
const { AsyncBomWorkbenchRepository, BomXlsImportError } = await import(
  pathToFileURL(path.join(root, "src", "lib", "repositories", "bom-workbench-async-repository.ts")).href
);

const client = new SQLiteAsyncDatabaseClient(db);
const repository = new AsyncBomWorkbenchRepository(client, () => now, () => crypto.randomUUID());
const importInput = (overrides = {}) => ({
  submissionId: "submission-parent",
  actorId: "user-qc",
  draftName: "QC BOM import",
  setActive: true,
  originalFilename: "../../qc-bom.xls",
  fileBuffer: Buffer.from("Part Number\tQuantity\nQC-CHILD\t2\nQC-CHILD\t3", "utf8"),
  ...overrides
});

function tableCount(table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function persistedState() {
  return {
    drafts: tableCount("bom_drafts"),
    lines: tableCount("bom_lines_tree"),
    jobs: tableCount("bom_import_jobs"),
    assets: tableCount("file_assets"),
    events: tableCount("bom_edit_events"),
    audits: tableCount("audit_logs"),
    activeDraftId: db.prepare("SELECT id FROM bom_drafts WHERE is_active = 1 ORDER BY id LIMIT 1").get()?.id ?? null,
    files: listFiles(repositoryDir)
  };
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else files.push(path.relative(directory, absolutePath).replaceAll(path.sep, "/"));
    }
  }
  return files.sort();
}

try {
  const first = await repository.createDraftFromSolidWorksXls(importInput());
  assert(first, "valid BOM import returns a draft and import job");
  assert.equal(first.draft.lines.length, 1, "duplicate part/revision rows merge into one transformed line");
  assert.equal(first.draft.lines[0].quantity, 5, "merged BOM line preserves the summed quantity");
  const firstAsset = db.prepare("SELECT * FROM file_assets WHERE id = ?").get(first.importJob.source_asset_id);
  assert(firstAsset, "valid BOM import creates its source asset");
  const relativeAssetPath = path.relative(repositoryDir, firstAsset.original_path);
  assert(!relativeAssetPath.startsWith("..") && !path.isAbsolute(relativeAssetPath), "sanitized filename stays inside the repository");
  assert.equal(
    firstAsset.content_hash,
    crypto.createHash("sha256").update(importInput().fileBuffer).digest("hex"),
    "persisted asset hash matches the uploaded bytes"
  );
  assert.equal(listFiles(repositoryDir).some((filename) => filename.endsWith(".tmp")), false, "atomic persistence leaves no temp file");

  const parserCases = [
    {
      filename: "quoted.csv",
      buffer: Buffer.from('Part Number,Revision,Quantity\r\n"QC,CHILD","A""1",2', "utf8"),
      format: "delimited",
      partNumber: "QC,CHILD",
      revision: 'A"1'
    },
    {
      filename: "table.xls",
      buffer: Buffer.from("<html><table><tr><th>Part Number</th><th>Quantity</th></tr><tr><td>QC-HTML</td><td>4</td></tr></table></html>", "utf8"),
      format: "html",
      partNumber: "QC-HTML",
      revision: null
    },
    {
      filename: "spreadsheet.xml",
      buffer: Buffer.from("<Workbook><Worksheet><Row><Cell><Data>Part Number</Data></Cell><Cell><Data>Quantity</Data></Cell></Row><Row><Cell><Data>QC-XML</Data></Cell><Cell><Data>6</Data></Cell></Row></Worksheet></Workbook>", "utf8"),
      format: "spreadsheetml",
      partNumber: "QC-XML",
      revision: null
    },
    {
      filename: "utf16.tsv",
      buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Part Number\tQuantity\r\nQC-UTF16\t7", "utf16le")]),
      format: "delimited",
      partNumber: "QC-UTF16",
      revision: null
    }
  ];
  for (const parserCase of parserCases) {
    const parsedImport = await repository.createDraftFromSolidWorksXls(
      importInput({ originalFilename: parserCase.filename, fileBuffer: parserCase.buffer, setActive: false })
    );
    assert(parsedImport, `${parserCase.filename} import succeeds`);
    assert.equal(parsedImport.draft.lines[0].part_number, parserCase.partNumber, `${parserCase.filename} preserves part number parsing`);
    assert.equal(parsedImport.draft.lines[0].revision, parserCase.revision, `${parserCase.filename} preserves revision parsing`);
    const metadata = JSON.parse(db.prepare("SELECT error_json FROM bom_import_jobs WHERE id = ?").get(parsedImport.importJob.id).error_json);
    assert.equal(metadata.format, parserCase.format, `${parserCase.filename} preserves source-format detection`);
  }

  const stateBeforeFault = persistedState();
  db.exec(`
    CREATE TRIGGER qc_fail_bom_file_asset
    BEFORE INSERT ON file_assets
    BEGIN
      SELECT RAISE(ABORT, 'QC_DB_FAULT');
    END;
  `);
  await assert.rejects(
    () => repository.createDraftFromSolidWorksXls(importInput({ originalFilename: "fault.xls" })),
    /QC_DB_FAULT/u,
    "SQLite fault propagates the original database failure"
  );
  assert.deepEqual(persistedState(), stateBeforeFault, "SQLite fault rolls back every row and removes the persisted original file");
  db.exec("DROP TRIGGER qc_fail_bom_file_asset");

  process.env.PDM_MAX_UPLOAD_FILE_BYTES = "1024";
  const stateBeforeOversize = persistedState();
  await assert.rejects(
    () => repository.createDraftFromSolidWorksXls(importInput({ originalFilename: "oversize.xls", fileBuffer: Buffer.alloc(2048, 65) })),
    (error) => error instanceof BomXlsImportError && error.code === "BOM_XLS_FILE_TOO_LARGE",
    "repository rejects oversized direct callers before parsing or persistence"
  );
  assert.deepEqual(persistedState(), stateBeforeOversize, "oversized direct call has zero database and filesystem delta");

  process.env.PDM_MAX_UPLOAD_FILE_BYTES = String(10 * 1024 * 1024);
  const databaseTimings = [];
  for (const method of ["query", "queryOne", "execute"]) {
    const original = client[method].bind(client);
    client[method] = async (...args) => {
      const operationStartedAt = performance.now();
      try {
        return await original(...args);
      } finally {
        databaseTimings.push({ method, elapsedMs: performance.now() - operationStartedAt });
      }
    };
  }
  const giantPartNumber = "P".repeat(5 * 1024 * 1024);
  const giantBuffer = Buffer.from(`Part Number\tQuantity\n${giantPartNumber}\t1`, "utf8");
  let lastHeartbeat = performance.now();
  let maxHeartbeatGapMs = 0;
  let heartbeatCount = 0;
  const heartbeat = setInterval(() => {
    const current = performance.now();
    maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, current - lastHeartbeat);
    lastHeartbeat = current;
    heartbeatCount += 1;
  }, 10);
  const startedAt = performance.now();
  try {
    const giant = await repository.createDraftFromSolidWorksXls(
      importInput({ originalFilename: "giant-row.xls", fileBuffer: giantBuffer, setActive: false })
    );
    assert(giant && giant.draft.lines.length === 1, "5 MiB giant-row import preserves functional output");
  } finally {
    const current = performance.now();
    maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, current - lastHeartbeat);
    clearInterval(heartbeat);
  }
  const elapsedMs = performance.now() - startedAt;
  assert(
    maxHeartbeatGapMs < 300,
    `5 MiB import keeps event-loop heartbeat below 300 ms (observed ${maxHeartbeatGapMs.toFixed(1)} ms across ${heartbeatCount} heartbeats; DB total ${databaseTimings.reduce((total, item) => total + item.elapsedMs, 0).toFixed(1)} ms, slowest ${Math.max(...databaseTimings.map((item) => item.elapsedMs)).toFixed(1)} ms)`
  );

  const routeSource = fs.readFileSync(path.join(root, "src", "app", "api", "bom", "drafts", "import-xls", "route.ts"), "utf8");
  assert(routeSource.indexOf("assertImportFileAllowed(originalFilename, file.size)") < routeSource.indexOf("file.arrayBuffer()"), "multipart size gate runs before byte materialization");
  assert.match(routeSource, /Buffer\.byteLength\(content, "utf8"\)[\s\S]*assertImportFileAllowed/u, "JSON text size is measured before Buffer creation");
  assert.match(routeSource, /error: "BOM_XLS_IMPORT_FAILED"[\s\S]*status: 500/u, "operational import failures use a generic HTTP 500 contract");
  assert.doesNotMatch(routeSource, /error instanceof Error \? error\.message : "BOM_XLS_IMPORT_FAILED"/u, "operational errors are not exposed to clients");

  console.log(
    `QC System Health Phase 6-8 backend FMEA: PASS (SQLite rollback/file compensation, size gate, generic 5xx, 5 MiB max heartbeat gap ${maxHeartbeatGapMs.toFixed(1)} ms, elapsed ${elapsedMs.toFixed(1)} ms)`
  );
} finally {
  db.close();
  if (originalRepositoryDir === undefined) delete process.env.PDM_REPOSITORY_DIR;
  else process.env.PDM_REPOSITORY_DIR = originalRepositoryDir;
  if (originalMaxUploadBytes === undefined) delete process.env.PDM_MAX_UPLOAD_FILE_BYTES;
  else process.env.PDM_MAX_UPLOAD_FILE_BYTES = originalMaxUploadBytes;
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  if (resolvedTemporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  }
}
