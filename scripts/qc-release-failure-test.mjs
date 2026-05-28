import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import path from "node:path";

const root = process.cwd();
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const mockError = "MOCK_RELEASE_FAILURE: simulated Cloud Function outage";

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
      RELEASE_FUNCTION_URL: releaseFunctionUrl,
      RELEASE_FUNCTION_TOKEN: "mock-release-token",
      GOOGLE_DRIVE_RELEASED_FOLDER_ID: "mock-released-folder"
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
  form.set("drawing_number", `QC-RELFAIL-${unique}`);
  form.set("part_number", `P-QC-RELFAIL-${unique}`);
  form.set("part_name", "Release Failure Test Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "Validate release failure handling path");
  form.append("files", new File([Buffer.from("mock release failure pdf")], `QC-RELFAIL-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie },
    body: form
  });
  const body = await response.json();
  if (response.status !== 201) {
    throw new Error(`Submission setup failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body.submissionId;
}

function readSubmissionStatus(submissionId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db.prepare("SELECT status, release_error FROM submissions WHERE id = ?").get(submissionId);
  const releaseFailedLog = db
    .prepare("SELECT COUNT(*) count FROM audit_logs WHERE submission_id = ? AND action = 'ReleaseFailed'")
    .get(submissionId);
  db.close();
  return { ...row, releaseFailedAuditCount: releaseFailedLog?.count ?? 0 };
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

  const engineerCookie = await login(baseUrl, "engineer@example.com");
  const managerCookie = await login(baseUrl, "manager@example.com");
  const submissionId = await createSubmission(baseUrl, engineerCookie);

  const approvalResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ comment: "QC mock release failure test" })
  });
  const approvalBody = await approvalResponse.json();
  const stored = readSubmissionStatus(submissionId);
  const request = mock.requests[0];

  results.push(expect("RELFAIL-001 approve returns 500 when release function fails", approvalResponse.status, 500));
  results.push(expect("RELFAIL-002 approve response exposes ReleaseFailed status", approvalBody.status, "ReleaseFailed"));
  results.push(expect("RELFAIL-003 DB status becomes ReleaseFailed", stored.status, "ReleaseFailed"));
  results.push(expect("RELFAIL-004 DB stores release error", stored.release_error, mockError));
  results.push(expect("RELFAIL-005 audit log records ReleaseFailed", stored.releaseFailedAuditCount > 0, true));
  results.push(expect("RELFAIL-006 mock release function was called once", mock.requests.length, 1));
  results.push(expect("RELFAIL-007 release request uses Bearer token", request?.authorization, "Bearer mock-release-token"));
  results.push(expect("RELFAIL-008 release request includes submission id", request?.body?.submissionId, submissionId));

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
