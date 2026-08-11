#!/usr/bin/env node

import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-gdrive-compensation-"));
const pendingFolderId = "mock-pending-folder";
const releasedFolderId = "mock-released-folder";
const mockToken = "mock-drive-token";
const submissionId = "qc-gdrive-compensation-submission";
const dbFileId = "qc-gdrive-compensation-file";
const driveFileId = "mock-drive-file-compensation";

function startMockDrive() {
  const state = {
    requests: [],
    parents: [pendingFolderId],
    appPropertiesAttempts: 0
  };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      state.requests.push({
        method: req.method,
        path: url.pathname,
        search: url.search,
        authorization: req.headers.authorization ?? "",
        bodyText
      });

      if (req.method === "GET" && url.pathname === `/drive/v3/files/${driveFileId}`) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ parents: state.parents }));
        return;
      }

      if (req.method === "PATCH" && url.pathname === `/drive/v3/files/${driveFileId}`) {
        const addParents = url.searchParams.get("addParents");
        const removeParents = url.searchParams.get("removeParents");
        if (addParents || removeParents) {
          state.parents = state.parents.filter((parent) => !removeParents?.split(",").includes(parent));
          for (const parent of addParents?.split(",") ?? []) {
            if (parent && !state.parents.includes(parent)) state.parents.push(parent);
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: driveFileId, parents: state.parents }));
          return;
        }

        state.appPropertiesAttempts += 1;
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "mock metadata write failure" }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Unhandled mock Drive route: ${req.method} ${url.pathname}${url.search}` }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Mock Drive server did not expose an address"));
        return;
      }
      resolve({ server, state, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

let mock;
let database;
const results = [];

try {
  mock = await startMockDrive();
  process.env.PDM_AUTH_MODE = "demo";
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = tempDir;
  process.env.PDM_REPOSITORY_DIR = path.join(tempDir, "repository");
  process.env.PDM_STORAGE_PROVIDER = "local_repository";
  process.env.PDM_POSTGRES_URL = "";
  process.env.DATABASE_URL = "";
  process.env.RELEASE_FUNCTION_URL = "";
  process.env.GOOGLE_DRIVE_API_BASE_URL = `${mock.baseUrl}/drive/v3`;
  process.env.GOOGLE_DRIVE_UPLOAD_BASE_URL = `${mock.baseUrl}/upload/drive/v3`;
  process.env.GOOGLE_DRIVE_MOCK_ACCESS_TOKEN = mockToken;
  process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID = pendingFolderId;
  process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID = releasedFolderId;

  const [{ getDb }, { releaseSubmissionViaCloudFunctionAsync }] = await Promise.all([
    import("../src/lib/db.ts"),
    import("../src/lib/release-async.ts")
  ]);
  database = getDb();
  const now = new Date().toISOString();
  const companyId = "company-jenfu";
  const itemId = "qc-gdrive-compensation-item";
  const userId = "qc-gdrive-compensation-user";
  database
    .prepare("INSERT OR IGNORE INTO companies (id, company_code, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(companyId, "JENFU", "QC Jenfu", now, now);
  database
    .prepare("INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(userId, "QC GDrive User", "qc-gdrive-compensation@example.com", "Admin", companyId, now, now);
  database
    .prepare("INSERT INTO items (id, company_id, part_number, part_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(itemId, companyId, "QC-GDRIVE-COMP-P01", "QC GDrive Compensation Item", now, now);
  database
    .prepare(`
      INSERT INTO submissions (
        id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(submissionId, itemId, "QC-GDRIVE-COMP", "1", "S45C", "Black Oxide", "Drawing", "QC compensation fixture", "Pending", userId, now, now);
  database
    .prepare(`
      INSERT INTO submission_files (
        id, submission_id, file_role, original_filename, local_path, gdrive_file_id,
        gdrive_status, sha256, file_size, storage_provider, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(dbFileId, submissionId, "pdf", "QC-GDRIVE-COMP.pdf", "repository/QC-GDRIVE-COMP.pdf", driveFileId, "uploaded", "0".repeat(64), 32, "local_repository", now);

  let releaseError = "";
  try {
    await releaseSubmissionViaCloudFunctionAsync(
      {
        id: submissionId,
        drawing_number: "QC-GDRIVE-COMP",
        revision: "1",
        files: [
          {
            id: dbFileId,
            file_role: "pdf",
            original_filename: "QC-GDRIVE-COMP.pdf",
            gdrive_file_id: driveFileId,
            gdrive_status: "uploaded"
          }
        ]
      },
      userId
    );
  } catch (error) {
    releaseError = error instanceof Error ? error.message : String(error);
  }

  const storedFile = database.prepare("SELECT gdrive_status, gdrive_file_id FROM submission_files WHERE id = ?").get(dbFileId);
  const moveRequests = mock.state.requests.filter((request) => request.method === "PATCH" && (request.search.includes("addParents=") || request.search.includes("removeParents=")));
  results.push(expect("COMP-001 metadata failure is surfaced as local release failure", releaseError.startsWith("LOCAL_GDRIVE_RELEASE_FAILED"), true));
  results.push(expect("COMP-002 metadata write was attempted once", mock.state.appPropertiesAttempts, 1));
  results.push(expect("COMP-003 Drive move and compensation both ran", moveRequests.length, 2));
  results.push(expect("COMP-004 Drive parent is compensated back to Pending", mock.state.parents.join(","), pendingFolderId));
  results.push(expect("COMP-005 DB file status is compensated back to uploaded", storedFile?.gdrive_status, "uploaded"));
  results.push(expect("COMP-006 DB retains the original Drive file id", storedFile?.gdrive_file_id, driveFileId));
  results.push(expect("COMP-007 every Drive call uses the configured bearer token", mock.state.requests.every((request) => request.authorization === `Bearer ${mockToken}`), true));

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
