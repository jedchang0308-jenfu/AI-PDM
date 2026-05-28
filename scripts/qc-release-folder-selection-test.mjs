import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-release-folders-"));
const dbPath = path.join(tempDir, "ai-pdm.sqlite");
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const selectedPendingFolderId = "selected-pending-folder";
const selectedReleasedFolderId = "selected-released-folder";
const envPendingFolderId = "env-pending-folder";
const envReleasedFolderId = "env-released-folder";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Unable to allocate a local port"));
        else resolve(port);
      });
    });
  });
}

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
      res.end(
        JSON.stringify({
          mode: "cloud-function",
          released: true,
          pendingFolderId: parsed.pendingFolderId,
          releasedFolderId: parsed.releasedFolderId,
          files: parsed.files ?? []
        })
      );
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
      resolve({
        server,
        requests,
        url: `http://127.0.0.1:${address.port}/release`
      });
    });
  });
}

function startApp(port, releaseFunctionUrl) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "strict",
      RELEASE_FUNCTION_URL: releaseFunctionUrl,
      RELEASE_FUNCTION_TOKEN: "mock-release-token",
      GOOGLE_DRIVE_PENDING_FOLDER_ID: envPendingFolderId,
      GOOGLE_DRIVE_RELEASED_FOLDER_ID: envReleasedFolderId
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  return { child, getOutput: () => output };
}

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    })
  ]);
}

async function waitForApp(baseUrl, getOutput) {
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`App did not become ready: ${lastError}\n${getOutput()}`);
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: demoPassword })
  });
  if (!response.ok) throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function configureFolders(baseUrl, adminCookie) {
  const response = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      gdrive_pending_folder_id: selectedPendingFolderId,
      gdrive_released_folder_id: selectedReleasedFolderId
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Settings update failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function createSubmission(baseUrl, engineerCookie) {
  const unique = Date.now().toString().slice(-6);
  const form = new FormData();
  form.set("drawing_number", `QC-RELFOLDER-${unique}`);
  form.set("part_number", `P-QC-RELFOLDER-${unique}`);
  form.set("part_name", "Release Folder Selection Test Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "Validate selected release folders are passed to Cloud Function");
  form.append("files", new File([Buffer.from("mock release folder selection pdf")], `QC-RELFOLDER-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie },
    body: form
  });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`Submission setup failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body.submissionId;
}

function readSubmissionStatus(submissionId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db.prepare("SELECT status, release_error FROM submissions WHERE id = ?").get(submissionId);
  db.close();
  return row;
}

function expect(name, actual, expected) {
  const passed = actual === expected;
  return { name, passed, actual, expected };
}

let app;
let mock;
const results = [];

try {
  mock = await startMockReleaseFunction();
  const appPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  app = startApp(appPort, mock.url);
  await waitForApp(baseUrl, app.getOutput);

  const adminCookie = await login(baseUrl, "admin@example.com");
  const engineerCookie = await login(baseUrl, "engineer@example.com");
  const managerCookie = await login(baseUrl, "manager@example.com");
  const settings = await configureFolders(baseUrl, adminCookie);
  const submissionId = await createSubmission(baseUrl, engineerCookie);

  const approvalResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ comment: "QC release folder selection test" })
  });
  const approvalBody = await approvalResponse.json();
  const request = mock.requests[0];
  const stored = readSubmissionStatus(submissionId);

  results.push(expect("RELFOLDER-001 admin settings update returns 200", settings.status, 200));
  results.push(expect("RELFOLDER-002 approve returns 200", approvalResponse.status, 200));
  results.push(expect("RELFOLDER-003 submission becomes Released", stored?.status, "Released"));
  results.push(expect("RELFOLDER-004 mock release function called once", mock.requests.length, 1));
  results.push(expect("RELFOLDER-005 release request uses bearer token", request?.authorization, "Bearer mock-release-token"));
  results.push(expect("RELFOLDER-006 request uses selected Pending folder", request?.body?.pendingFolderId, selectedPendingFolderId));
  results.push(expect("RELFOLDER-007 request uses selected Released folder", request?.body?.releasedFolderId, selectedReleasedFolderId));
  results.push(expect("RELFOLDER-008 request overrides env Pending folder", request?.body?.pendingFolderId === envPendingFolderId, false));
  results.push(expect("RELFOLDER-009 request overrides env Released folder", request?.body?.releasedFolderId === envReleasedFolderId, false));
  results.push(expect("RELFOLDER-010 response echoes Cloud Function release mode", approvalBody.release?.mode, "cloud-function"));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        passed: 0,
        failed: 1,
        results,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  if (app) await stopApp(app.child);
  if (mock) await new Promise((resolve) => mock.server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
