#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const dataDir = process.env.PDM_QC_DATA_DIR;
const repositoryDir = process.env.PDM_QC_REPOSITORY_DIR;
const expectedMaxUploadBytes = Number(process.env.PDM_QC_MAX_UPLOAD_BYTES ?? 1024);
if (!dataDir || !repositoryDir) throw new Error("PDM_QC_DATA_DIR and PDM_QC_REPOSITORY_DIR are required");

const resolvedDataDir = path.resolve(dataDir);
const resolvedRepositoryDir = path.resolve(repositoryDir);
const resolvedTempDir = path.resolve(os.tmpdir());
if (!resolvedDataDir.startsWith(resolvedTempDir + path.sep) || !resolvedRepositoryDir.startsWith(resolvedTempDir + path.sep)) {
  throw new Error("QC HTTP paths must stay inside the operating-system temp directory");
}

const db = new Database(path.join(resolvedDataDir, "ai-pdm.sqlite"));
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";

async function requestJson(pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(email) {
  const { response } = await requestJson("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `${email} login succeeds`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, `${email} login returns a session cookie`);
  return cookie;
}

function tableCount(table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function listFiles(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
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

function persistedState() {
  return {
    drafts: tableCount("bom_drafts"),
    lines: tableCount("bom_lines_tree"),
    jobs: tableCount("bom_import_jobs"),
    assets: tableCount("file_assets"),
    events: tableCount("bom_edit_events"),
    audits: tableCount("audit_logs"),
    activeDraftId: db.prepare("SELECT id FROM bom_drafts WHERE is_active = 1 ORDER BY id LIMIT 1").get()?.id ?? null,
    files: listFiles(resolvedRepositoryDir)
  };
}

const submissionId = "SUB-20260515-0001";
const validText = "Part Number\tQuantity\nQC-HTTP-CHILD\t2";
const importUrl = "/api/bom/drafts/import-xls";

try {
  const managerCookie = await login("manager@example.com");
  const engineerCookie = await login("engineer@example.com");

  const unauthenticatedState = persistedState();
  const unauthenticated = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId, content: validText })
  });
  assert(
    unauthenticated.response.status === 401 || unauthenticated.response.status === 403,
    `unauthenticated import is rejected (HTTP ${unauthenticated.response.status})`
  );
  assert.deepEqual(persistedState(), unauthenticatedState, "unauthenticated import has zero persistence delta");

  const valid = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({
      submissionId,
      setActive: true,
      originalFilename: "../../qc-http.xls",
      content: validText
    })
  });
  assert.equal(valid.response.status, 201, `valid import returns 201 (${JSON.stringify(valid.body)})`);
  assert.equal(valid.body.draft?.lines?.[0]?.part_number, "QC-HTTP-CHILD", "valid import preserves parsed output");
  const validAsset = db.prepare("SELECT * FROM file_assets WHERE id = ?").get(valid.body.importJob.source_asset_id);
  assert(validAsset && fs.existsSync(validAsset.original_path), "valid import persists the source file");
  assert.equal(validAsset.content_hash, crypto.createHash("sha256").update(validText).digest("hex"), "HTTP import persists the exact content hash");
  const relativeAssetPath = path.relative(resolvedRepositoryDir, validAsset.original_path);
  assert(!relativeAssetPath.startsWith("..") && !path.isAbsolute(relativeAssetPath), "HTTP filename traversal stays inside the repository");

  for (const oversizedRequest of [
    {
      label: "JSON text",
      init: {
        method: "POST",
        headers: { "content-type": "application/json", cookie: managerCookie },
        body: JSON.stringify({ submissionId, originalFilename: "oversize-text.xls", content: "A".repeat(expectedMaxUploadBytes + 1) })
      }
    },
    {
      label: "JSON base64",
      init: {
        method: "POST",
        headers: { "content-type": "application/json", cookie: managerCookie },
        body: JSON.stringify({
          submissionId,
          originalFilename: "oversize-base64.xls",
          contentBase64: Buffer.alloc(expectedMaxUploadBytes + 1, 65).toString("base64")
        })
      }
    },
    {
      label: "multipart",
      init: (() => {
        const form = new FormData();
        form.set("submissionId", submissionId);
        form.set("file", new File([Buffer.alloc(expectedMaxUploadBytes + 1, 65)], "oversize-multipart.xls"));
        return { method: "POST", headers: { cookie: managerCookie }, body: form };
      })()
    }
  ]) {
    const before = persistedState();
    const oversized = await requestJson(importUrl, oversizedRequest.init);
    assert.equal(oversized.response.status, 413, `${oversizedRequest.label} oversized import returns 413`);
    assert.equal(oversized.body.error, "file_too_large", `${oversizedRequest.label} uses the shared size error code`);
    assert.equal(oversized.body.maxUploadFileBytes, expectedMaxUploadBytes, `${oversizedRequest.label} reports the effective policy`);
    assert.deepEqual(persistedState(), before, `${oversizedRequest.label} oversized import has zero persistence delta`);
  }

  const malformedBase64State = persistedState();
  const malformedBase64 = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ submissionId, originalFilename: "bad-base64.xls", contentBase64: "A===not-base64" })
  });
  assert.equal(malformedBase64.response.status, 400, "malformed base64 returns 400");
  assert.equal(malformedBase64.body.error, "BOM_XLS_BASE64_INVALID", "malformed base64 has an explicit client-error code");
  assert.deepEqual(persistedState(), malformedBase64State, "malformed base64 has zero persistence delta");

  const invalidPayloadState = persistedState();
  const invalidJson = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: "{"
  });
  assert.equal(invalidJson.response.status, 400, "malformed JSON returns 400");
  assert.equal(invalidJson.body.error, "BOM_XLS_PAYLOAD_INVALID", "malformed JSON uses the generic payload contract");
  const missingFileForm = new FormData();
  missingFileForm.set("submissionId", submissionId);
  const missingMultipartFile = await requestJson(importUrl, {
    method: "POST",
    headers: { cookie: managerCookie },
    body: missingFileForm
  });
  assert.equal(missingMultipartFile.response.status, 400, "multipart payload without a file returns 400");
  assert.equal(missingMultipartFile.body.error, "BOM_XLS_FILE_REQUIRED", "missing multipart file has an explicit client-error code");
  assert.deepEqual(persistedState(), invalidPayloadState, "invalid payloads have zero persistence delta");

  const binaryState = persistedState();
  const binary = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({
      submissionId,
      originalFilename: "binary.xls",
      contentBase64: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).toString("base64")
    })
  });
  assert.equal(binary.response.status, 400, "known unsupported binary input remains a 400 client error");
  assert.equal(binary.body.error, "BOM_XLS_BINARY_UNSUPPORTED", "binary input preserves its domain error code");
  assert.deepEqual(persistedState(), binaryState, "binary parse rejection has zero persistence delta");

  const stateBeforeDatabaseFault = persistedState();
  db.exec(`
    CREATE TRIGGER qc_http_fail_bom_file_asset
    BEFORE INSERT ON file_assets
    BEGIN
      SELECT RAISE(ABORT, 'QC_HTTP_DB_FAULT');
    END;
  `);
  const databaseFault = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ submissionId, originalFilename: "database-fault.xls", content: validText })
  });
  assert.equal(databaseFault.response.status, 500, "database failure returns HTTP 500");
  assert.deepEqual(databaseFault.body, { error: "BOM_XLS_IMPORT_FAILED", message: "BOM XLS import failed." }, "database failure uses the generic operational contract");
  assert.deepEqual(persistedState(), stateBeforeDatabaseFault, "database failure rolls back rows, active identity, and source file");
  db.exec("DROP TRIGGER qc_http_fail_bom_file_asset");

  const bomImportsDir = path.join(resolvedRepositoryDir, "bom-imports");
  const resolvedBomImportsDir = path.resolve(bomImportsDir);
  assert(resolvedBomImportsDir.startsWith(resolvedRepositoryDir + path.sep), "filesystem fault target stays inside the isolated repository");
  fs.rmSync(resolvedBomImportsDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(resolvedBomImportsDir), { recursive: true });
  fs.writeFileSync(resolvedBomImportsDir, "QC ENOTDIR blocker", "utf8");
  const stateBeforeFilesystemFault = persistedState();
  const filesystemFault = await requestJson(importUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ submissionId, originalFilename: "filesystem-fault.xls", content: validText })
  });
  assert.equal(filesystemFault.response.status, 500, "filesystem failure returns HTTP 500");
  assert.deepEqual(filesystemFault.body, { error: "BOM_XLS_IMPORT_FAILED", message: "BOM XLS import failed." }, "filesystem failure does not expose ENOTDIR or local paths");
  assert.deepEqual(persistedState(), stateBeforeFilesystemFault, "filesystem failure has zero database and file delta");

  const managerNotifications = await requestJson("/api/notifications", { headers: { cookie: managerCookie } });
  const engineerNotifications = await requestJson("/api/notifications", { headers: { cookie: engineerCookie } });
  assert.equal(managerNotifications.response.status, 200, "manager notification read path remains available");
  assert.equal(engineerNotifications.response.status, 200, "engineer notification read path remains available");

  console.log("QC System Health Phase 6-8 HTTP: PASS (auth, valid import, JSON/base64/multipart 413, parse 400, DB/filesystem generic 500, zero-delta compensation, notifications)");
} finally {
  try {
    db.exec("DROP TRIGGER IF EXISTS qc_http_fail_bom_file_asset");
  } finally {
    db.close();
  }
}
