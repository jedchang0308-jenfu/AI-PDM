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
    fileId: "mock-drive-file-1",
    parents: [pendingFolderId],
    appProperties: null
  };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyBuffer = Buffer.concat(chunks);
      const bodyText = bodyBuffer.toString("utf8");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      state.requests.push({
        method: req.method,
        path: url.pathname,
        search: url.search,
        authorization: req.headers.authorization ?? "",
        contentType: req.headers["content-type"] ?? "",
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
          state.parents = state.parents.filter((parent) => parent !== removeParents);
          if (addParents && !state.parents.includes(addParents)) state.parents.push(addParents);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: state.fileId, parents: state.parents }));
          return;
        }

        const parsed = bodyText ? JSON.parse(bodyText) : {};
        state.appProperties = parsed.appProperties ?? null;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: state.fileId, appProperties: state.appProperties }));
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
      resolve({
        server,
        state,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
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
  form.set("drawing_number", `QC-GDRIVE-${unique}`);
  form.set("part_number", `P-QC-GDRIVE-${unique}`);
  form.set("part_name", "Google Drive Integration Test Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "Validate mocked Google Drive upload and release");
  form.append("files", new File([Buffer.from("mock gdrive pdf")], `QC-GDRIVE-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie },
    body: form
  });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`Submission setup failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body.submissionId;
}

function readFileState(submissionId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db
    .prepare("SELECT id, gdrive_status, gdrive_file_id FROM submission_files WHERE submission_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(submissionId);
  db.close();
  return row;
}

async function waitForUploaded(submissionId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const row = readFileState(submissionId);
    if (row?.gdrive_status === "uploaded") return row;
    if (row?.gdrive_status === "failed") throw new Error(`Drive upload failed for ${submissionId}`);
    await delay(300);
  }
  throw new Error(`Timed out waiting for Drive upload on ${submissionId}`);
}

function expect(name, actual, expected) {
  const passed = actual === expected;
  return { name, passed, actual, expected };
}

function hasRequest(state, predicate) {
  return state.requests.some(predicate);
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
  const uploaded = await waitForUploaded(submissionId);

  const approvalResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ comment: "QC mocked Google Drive integration test" })
  });
  const approvalBody = await approvalResponse.json();
  const moved = readFileState(submissionId);

  results.push(expect("GDRIVE-001 background upload marks file uploaded", uploaded.gdrive_status, "uploaded"));
  results.push(expect("GDRIVE-002 DB stores mock Drive file id", uploaded.gdrive_file_id, mock.state.fileId));
  results.push(expect("GDRIVE-003 approve returns Released with local-gdrive", approvalBody.release?.mode, "local-gdrive"));
  results.push(expect("GDRIVE-004 release marks file moved", moved.gdrive_status, "moved"));
  results.push(expect("GDRIVE-005 mock Drive upload was called", hasRequest(mock.state, (request) => request.method === "POST" && request.path === "/upload/drive/v3/files"), true));
  results.push(expect("GDRIVE-006 mock Drive move was called", hasRequest(mock.state, (request) => request.method === "PATCH" && request.search.includes(`addParents=${releasedFolderId}`)), true));
  results.push(expect("GDRIVE-007 mock Drive metadata was written", mock.state.appProperties?.Status, "Official"));
  results.push(expect("GDRIVE-008 metadata includes submission id", mock.state.appProperties?.SubmissionId, submissionId));
  results.push(expect("GDRIVE-009 Drive calls use bearer token", mock.state.requests.every((request) => request.authorization === `Bearer ${mockToken}`), true));

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
