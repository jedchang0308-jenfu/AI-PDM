import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import path from "node:path";

const root = process.cwd();
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";

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

function startApp(port) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_RELEASE_MODE: "strict",
      RELEASE_FUNCTION_URL: "",
      RELEASE_FUNCTION_TOKEN: "",
      GOOGLE_DRIVE_RELEASED_FOLDER_ID: ""
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
  form.set("drawing_number", `QC-RELCFG-${unique}`);
  form.set("part_number", `P-QC-RELCFG-${unique}`);
  form.set("part_name", "Release Config Guard Test Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "Validate strict release configuration guard");
  form.append("files", new File([Buffer.from("strict release config pdf")], `QC-RELCFG-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie },
    body: form
  });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`Submission setup failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body.submissionId;
}

function snapshotSetting(key) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
  db.close();
  return row ? { exists: true, value: row.value } : { exists: false, value: "" };
}

function writeSetting(key, value) {
  const db = new Database(dbPath, { fileMustExist: true });
  db.prepare(
    `INSERT INTO system_settings (key, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(key, value, new Date().toISOString(), null);
  db.close();
}

function restoreSetting(key, snapshot) {
  const db = new Database(dbPath, { fileMustExist: true });
  if (snapshot.exists) {
    db.prepare(
      `INSERT INTO system_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).run(key, snapshot.value, new Date().toISOString(), null);
  } else {
    db.prepare("DELETE FROM system_settings WHERE key = ?").run(key);
  }
  db.close();
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
const results = [];
const releasedFolderSnapshot = snapshotSetting("gdrive_released_folder_id");

try {
  writeSetting("gdrive_released_folder_id", "");

  const appPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  app = startApp(appPort);
  await waitForApp(baseUrl, app.getOutput);

  const engineerCookie = await login(baseUrl, "engineer@example.com");
  const managerCookie = await login(baseUrl, "manager@example.com");
  const submissionId = await createSubmission(baseUrl, engineerCookie);

  const approvalResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ comment: "QC strict release config guard test" })
  });
  const approvalBody = await approvalResponse.json();
  const stored = readSubmissionStatus(submissionId);

  results.push(expect("RELCFG-001 strict release without target returns 500", approvalResponse.status, 500));
  results.push(expect("RELCFG-002 response exposes ReleaseFailed status", approvalBody.status, "ReleaseFailed"));
  results.push(expect("RELCFG-003 response explains release is not configured", approvalBody.error?.startsWith("RELEASE_NOT_CONFIGURED"), true));
  results.push(expect("RELCFG-004 DB submission becomes ReleaseFailed", stored.status, "ReleaseFailed"));
  results.push(expect("RELCFG-005 DB stores release configuration error", stored.release_error?.startsWith("RELEASE_NOT_CONFIGURED"), true));
  results.push(expect("RELCFG-006 audit log records ReleaseFailed", stored.releaseFailedAuditCount > 0, true));

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
  restoreSetting("gdrive_released_folder_id", releasedFolderSnapshot);
}
