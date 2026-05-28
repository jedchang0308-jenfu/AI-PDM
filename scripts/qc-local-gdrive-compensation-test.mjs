import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import path from "node:path";

const root = process.cwd();
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const pendingFolderId = "mock-pending-folder";
const releasedFolderId = "mock-released-folder";
const mockToken = "mock-drive-token";

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

function startMockDrive() {
  const state = {
    requests: [],
    fileId: "mock-drive-file-compensation",
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

      if (req.method === "POST" && url.pathname === "/upload/drive/v3/files") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: state.fileId }));
        return;
      }

      if (req.method === "GET" && url.pathname === `/drive/v3/files/${state.fileId}`) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ parents: state.parents }));
        return;
      }

      if (req.method === "PATCH" && url.pathname === `/drive/v3/files/${state.fileId}`) {
        const addParents = url.searchParams.get("addParents");
        const removeParents = url.searchParams.get("removeParents");
        if (addParents || removeParents) {
          state.parents = state.parents.filter((parent) => !removeParents?.split(",").includes(parent));
          for (const parent of addParents?.split(",") ?? []) {
            if (parent && !state.parents.includes(parent)) state.parents.push(parent);
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: state.fileId, parents: state.parents }));
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

function startApp(port, driveBaseUrl) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      GOOGLE_DRIVE_API_BASE_URL: `${driveBaseUrl}/drive/v3`,
      GOOGLE_DRIVE_UPLOAD_BASE_URL: `${driveBaseUrl}/upload/drive/v3`,
      GOOGLE_DRIVE_MOCK_ACCESS_TOKEN: mockToken,
      GOOGLE_DRIVE_PENDING_FOLDER_ID: pendingFolderId,
      GOOGLE_DRIVE_RELEASED_FOLDER_ID: releasedFolderId,
      RELEASE_FUNCTION_URL: ""
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

async function createSubmission(baseUrl, engineerCookie) {
  const unique = Date.now().toString().slice(-6);
  const form = new FormData();
  form.set("drawing_number", `QC-COMP-${unique}`);
  form.set("part_number", `P-QC-COMP-${unique}`);
  form.set("part_name", "Local Drive Compensation Test Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "Validate local Google Drive release compensation");
  form.append("files", new File([Buffer.from("mock compensation pdf")], `QC-COMP-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie },
    body: form
  });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`Submission setup failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body.submissionId;
}

function readState(submissionId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const file = db
    .prepare("SELECT gdrive_status, gdrive_file_id FROM submission_files WHERE submission_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(submissionId);
  const submission = db.prepare("SELECT status, release_error FROM submissions WHERE id = ?").get(submissionId);
  const releaseFailedLog = db
    .prepare("SELECT COUNT(*) count FROM audit_logs WHERE submission_id = ? AND action = 'ReleaseFailed'")
    .get(submissionId);
  db.close();
  return { file, submission, releaseFailedAuditCount: releaseFailedLog?.count ?? 0 };
}

async function waitForUploaded(submissionId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { file } = readState(submissionId);
    if (file?.gdrive_status === "uploaded") return file;
    if (file?.gdrive_status === "failed") throw new Error(`Drive upload failed for ${submissionId}`);
    await delay(300);
  }
  throw new Error(`Timed out waiting for Drive upload on ${submissionId}`);
}

function expect(name, actual, expected) {
  const passed = actual === expected;
  return { name, passed, actual, expected };
}

let app;
let mock;
const results = [];

try {
  mock = await startMockDrive();
  const appPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  app = startApp(appPort, mock.baseUrl);
  await waitForApp(baseUrl, app.getOutput);

  const engineerCookie = await login(baseUrl, "engineer@example.com");
  const managerCookie = await login(baseUrl, "manager@example.com");
  const submissionId = await createSubmission(baseUrl, engineerCookie);
  await waitForUploaded(submissionId);

  const approvalResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ comment: "QC local Drive compensation test" })
  });
  const approvalBody = await approvalResponse.json();
  const stored = readState(submissionId);

  results.push(expect("COMP-001 approve returns 500 when local Drive metadata write fails", approvalResponse.status, 500));
  results.push(expect("COMP-002 response exposes ReleaseFailed status", approvalBody.status, "ReleaseFailed"));
  results.push(expect("COMP-003 DB submission becomes ReleaseFailed", stored.submission?.status, "ReleaseFailed"));
  results.push(expect("COMP-004 DB stores local gdrive release error", stored.submission?.release_error?.startsWith("LOCAL_GDRIVE_RELEASE_FAILED"), true));
  results.push(expect("COMP-005 DB file status is compensated back to uploaded", stored.file?.gdrive_status, "uploaded"));
  results.push(expect("COMP-006 mock Drive parent is compensated back to Pending", mock.state.parents.join(","), pendingFolderId));
  results.push(expect("COMP-007 metadata write was attempted once", mock.state.appPropertiesAttempts, 1));
  results.push(expect("COMP-008 audit log records ReleaseFailed", stored.releaseFailedAuditCount > 0, true));
  results.push(expect("COMP-009 Drive calls use bearer token", mock.state.requests.every((request) => request.authorization === `Bearer ${mockToken}`), true));

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
}
