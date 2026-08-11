#!/usr/bin/env node

import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-release-folders-"));
const selectedPendingFolderId = "selected-pending-folder";
const selectedReleasedFolderId = "selected-released-folder";
const envPendingFolderId = "env-pending-folder";
const envReleasedFolderId = "env-released-folder";
const submissionId = "qc-release-folder-submission";

function startMockReleaseFunction() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization ?? "",
        body: parsed
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        mode: "cloud-function",
        released: true,
        pendingFolderId: parsed.pendingFolderId,
        releasedFolderId: parsed.releasedFolderId,
        files: parsed.files ?? []
      }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Mock release server did not expose an address"));
        return;
      }
      resolve({ server, requests, url: `http://127.0.0.1:${address.port}/release` });
    });
  });
}

function seedReleaseFixture(database) {
  const now = new Date().toISOString();
  const companyId = "company-jenfu";
  const userId = "qc-release-folder-user";
  const itemId = "qc-release-folder-item";
  database.prepare("INSERT OR IGNORE INTO companies (id, company_code, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(companyId, "JENFU", "QC Jenfu", now, now);
  database.prepare("INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(userId, "QC Release Folder User", "qc-release-folder@example.com", "Admin", companyId, now, now);
  database.prepare("INSERT INTO items (id, company_id, part_number, part_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(itemId, companyId, "QC-RELFOLDER-P01", "QC Release Folder Item", now, now);
  database.prepare(`
    INSERT INTO submissions (
      id, item_id, drawing_number, revision, material, surface_finish, document_type,
      change_description, status, submitted_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(submissionId, itemId, "QC-RELFOLDER", "1", "S45C", "Black Oxide", "Drawing", "QC release folder fixture", "Pending", userId, now, now);
  database.prepare(`
    INSERT INTO submission_files (
      id, submission_id, file_role, original_filename, local_path, gdrive_status,
      sha256, file_size, storage_provider, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("qc-release-folder-file", submissionId, "pdf", "QC-RELFOLDER.pdf", "repository/QC-RELFOLDER.pdf", "none", "0".repeat(64), 32, "local_repository", now);
  database.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)").run("gdrive_pending_folder_id", selectedPendingFolderId, now, userId);
  database.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)").run("gdrive_released_folder_id", selectedReleasedFolderId, now, userId);
  return { userId };
}

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

let mock;
let database;
const results = [];

try {
  mock = await startMockReleaseFunction();
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = tempDir;
  process.env.PDM_REPOSITORY_DIR = path.join(tempDir, "repository");
  process.env.PDM_POSTGRES_URL = "";
  process.env.DATABASE_URL = "";
  process.env.PDM_RELEASE_MODE = "strict";
  process.env.RELEASE_FUNCTION_URL = mock.url;
  process.env.RELEASE_FUNCTION_TOKEN = "mock-release-token";
  process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID = envPendingFolderId;
  process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID = envReleasedFolderId;

  const [{ getDb }, { releaseSubmissionViaCloudFunctionAsync }] = await Promise.all([
    import("../src/lib/db.ts"),
    import("../src/lib/release-async.ts")
  ]);
  database = getDb();
  const { userId } = seedReleaseFixture(database);
  const release = await releaseSubmissionViaCloudFunctionAsync(
    {
      id: submissionId,
      drawing_number: "QC-RELFOLDER",
      revision: "1",
      files: [
        {
          id: "qc-release-folder-file",
          file_role: "pdf",
          original_filename: "QC-RELFOLDER.pdf",
          gdrive_file_id: null,
          gdrive_status: "none"
        }
      ]
    },
    userId
  );

  const request = mock.requests[0];
  results.push(expect("RELFOLDER-001 release adapter returns Cloud Function mode", release.mode, "cloud-function"));
  results.push(expect("RELFOLDER-002 mock release function called once", mock.requests.length, 1));
  results.push(expect("RELFOLDER-003 release request uses bearer token", request?.authorization, "Bearer mock-release-token"));
  results.push(expect("RELFOLDER-004 request uses selected Pending folder", request?.body?.pendingFolderId, selectedPendingFolderId));
  results.push(expect("RELFOLDER-005 request uses selected Released folder", request?.body?.releasedFolderId, selectedReleasedFolderId));
  results.push(expect("RELFOLDER-006 selected Pending folder overrides env fallback", request?.body?.pendingFolderId === envPendingFolderId, false));
  results.push(expect("RELFOLDER-007 selected Released folder overrides env fallback", request?.body?.releasedFolderId === envReleasedFolderId, false));
  results.push(expect("RELFOLDER-008 response echoes selected Pending folder", release.pendingFolderId, selectedPendingFolderId));
  results.push(expect("RELFOLDER-009 response echoes selected Released folder", release.releasedFolderId, selectedReleasedFolderId));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ passed: 0, failed: 1, results, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  database?.close();
  if (mock) await new Promise((resolve) => mock.server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
