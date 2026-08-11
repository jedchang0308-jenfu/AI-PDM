#!/usr/bin/env node

import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-release-failure-"));
const mockError = "MOCK_RELEASE_FAILURE: simulated Cloud Function outage";
const submissionId = "qc-release-failure-submission";

function startMockReleaseFunction() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization ?? "",
        body: body ? JSON.parse(body) : null
      });
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: mockError }));
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
  const userId = "qc-release-failure-user";
  const itemId = "qc-release-failure-item";
  database.prepare("INSERT OR IGNORE INTO companies (id, company_code, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(companyId, "JENFU", "QC Jenfu", now, now);
  database.prepare("INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(userId, "QC Release User", "qc-release-failure@example.com", "Admin", companyId, now, now);
  database.prepare("INSERT INTO items (id, company_id, part_number, part_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(itemId, companyId, "QC-RELFAIL-P01", "QC Release Failure Item", now, now);
  database.prepare(`
    INSERT INTO submissions (
      id, item_id, drawing_number, revision, material, surface_finish, document_type,
      change_description, status, submitted_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(submissionId, itemId, "QC-RELFAIL", "1", "S45C", "Black Oxide", "Drawing", "QC release failure fixture", "Pending", userId, now, now);
  database.prepare(`
    INSERT INTO submission_files (
      id, submission_id, file_role, original_filename, local_path, gdrive_status,
      sha256, file_size, storage_provider, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("qc-release-failure-file", submissionId, "pdf", "QC-RELFAIL.pdf", "repository/QC-RELFAIL.pdf", "none", "0".repeat(64), 32, "local_repository", now);
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
  process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID = "mock-pending-folder";
  process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID = "mock-released-folder";

  const [{ getDb }, { releaseSubmissionViaCloudFunctionAsync }] = await Promise.all([
    import("../src/lib/db.ts"),
    import("../src/lib/release-async.ts")
  ]);
  database = getDb();
  const { userId } = seedReleaseFixture(database);
  const submission = {
    id: submissionId,
    drawing_number: "QC-RELFAIL",
    revision: "1",
    files: [
      {
        id: "qc-release-failure-file",
        file_role: "pdf",
        original_filename: "QC-RELFAIL.pdf",
        gdrive_file_id: null,
        gdrive_status: "none"
      }
    ]
  };

  let releaseError = "";
  try {
    await releaseSubmissionViaCloudFunctionAsync(submission, userId);
  } catch (error) {
    releaseError = error instanceof Error ? error.message : String(error);
  }
  const request = mock.requests[0];
  results.push(expect("RELFAIL-001 release adapter surfaces Cloud Function error", releaseError, mockError));
  results.push(expect("RELFAIL-002 mock release function was called once", mock.requests.length, 1));
  results.push(expect("RELFAIL-003 release request uses POST", request?.method, "POST"));
  results.push(expect("RELFAIL-004 release request uses Bearer token", request?.authorization, "Bearer mock-release-token"));
  results.push(expect("RELFAIL-005 release request includes submission id", request?.body?.submissionId, submissionId));
  results.push(expect("RELFAIL-006 release request includes drawing revision", `${request?.body?.drawingNumber}/${request?.body?.revision}`, "QC-RELFAIL/1"));
  results.push(expect("RELFAIL-007 release request preserves file role and name", `${request?.body?.files?.[0]?.fileRole}/${request?.body?.files?.[0]?.originalFilename}`, "pdf/QC-RELFAIL.pdf"));

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
