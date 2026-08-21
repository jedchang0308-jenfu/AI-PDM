import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-ux-attributes-"));
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];
const read = (relativePath) => readProjectFile(root, relativePath);
const readJson = (relativePath) => readProjectJson(root, relativePath);

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

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
      requests.push({ method: req.method, url: req.url, body: parsed });
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
      resolve({ server, requests, url: `http://127.0.0.1:${address.port}/release` });
    });
  });
}

function startApp(port, releaseFunctionUrl) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_NEXT_DIST_DIR: `.tmp/next-qc-ux-${process.pid}-${port}`,
      PDM_RELEASE_MODE: "strict",
      RELEASE_FUNCTION_URL: releaseFunctionUrl,
      RELEASE_FUNCTION_TOKEN: "mock-release-token",
      GOOGLE_DRIVE_PENDING_FOLDER_ID: "ux-pending-folder",
      GOOGLE_DRIVE_RELEASED_FOLDER_ID: "ux-released-folder"
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
  record(`Login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function createSubmission(baseUrl, engineerCookie, unique) {
  const form = new FormData();
  form.set("drawing_number", `QC-UX-${unique}`);
  form.set("part_number", `P-QC-UX-${unique}`);
  form.set("part_name", "UX Attribute Hierarchy Test Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "Validate UI attribute hierarchy and diagnostic values");
  form.set("approval_required", "1");
  form.append("files", new File([Buffer.from("ux attribute hierarchy pdf")], `QC-UX-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record("Seed submission created", response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  return body.submissionId;
}

async function approveSubmission(baseUrl, managerCookie, submissionId) {
  const response = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ comment: "QC UX attribute hierarchy approval" })
  });
  const body = await response.json().catch(() => ({}));
  record("Seed submission released", response.status === 200 && body.status === "Released", `HTTP ${response.status} ${JSON.stringify(body)}`);
}

async function createReadonlyShare(baseUrl, managerCookie, submissionId) {
  const response = await fetch(`${baseUrl}/api/submissions/${submissionId}/shares`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ label: "QC UX share", days: 7 })
  });
  const body = await response.json().catch(() => ({}));
  record("Readonly share created", response.status === 201 && Boolean(body.token), `HTTP ${response.status} ${JSON.stringify(body)}`);
  return body.token;
}

async function authenticatedContext(browser, baseUrl, cookieHeader, viewport) {
  const context = await browser.newContext({ viewport });
  const [name, ...valueParts] = cookieHeader.split("=");
  await context.addCookies([
    {
      name,
      value: valueParts.join("="),
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  return context;
}

async function verifyNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} avoids horizontal overflow`, overflow <= 2, `${overflow}px`);
}

async function verifyDashboard(browser, baseUrl, managerCookie, drawingNumber) {
  const context = await authenticatedContext(browser, baseUrl, managerCookie, { width: 1440, height: 1100 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const row = page.locator("tbody tr", { hasText: drawingNumber }).first();
  await row.waitFor({ timeout: 15000 });
  record("Dashboard table drawing uses primary identity", (await row.locator(".identity-primary").count()) >= 1);
  record("Dashboard table revision/file availability uses badges", (await row.locator(".metadata-badge").count()) >= 2);
  await row.click();
  await page.locator(".detail-quick-actions").waitFor({ timeout: 15000 });
  await page.locator(".system-diagnostics > summary").click();
  record("Dashboard system diagnostics use diagnostic values", (await page.locator(".system-diagnostics .diagnostic-value").count()) >= 3);
  await verifyNoOverflow(page, "Dashboard desktop");
  record("Dashboard has no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

async function verifyUpload(browser, baseUrl, engineerCookie) {
  const context = await authenticatedContext(browser, baseUrl, engineerCookie, { width: 390, height: 920 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}/upload`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "UX-ATTRIBUTE-A.slddrw",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("mock solidworks drawing")
  });
  await page.locator(".upload-file-item").waitFor({ timeout: 15000 });
  record("Upload file row uses format badge", (await page.locator(".upload-file-item .file-kind-badge").count()) === 1);
  record("Upload file row uses metadata pairs", (await page.locator(".upload-file-item .metadata-pair").count()) >= 2);
  await verifyNoOverflow(page, "Upload mobile");
  record("Upload has no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

async function verifyHandoff(browser, baseUrl, managerCookie, drawingNumber) {
  const context = await authenticatedContext(browser, baseUrl, managerCookie, { width: 1440, height: 1000 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/handoff`, { waitUntil: "networkidle" });
  await page.locator(".handoff-card .identity-primary", { hasText: drawingNumber }).waitFor({ timeout: 15000 });
  record("Handoff card uses primary identity", (await page.locator(".handoff-card .identity-primary", { hasText: drawingNumber }).count()) === 1);
  record("Handoff card uses metadata badges", (await page.locator(".handoff-card .metadata-badge").count()) >= 1);
  await page.locator(".handoff-package .integrity-details > summary").first().click();
  record("Handoff package SHA uses diagnostic value", await page.locator(".handoff-package .diagnostic-value", { hasText: "SHA256" }).first().isVisible());
  await verifyNoOverflow(page, "Handoff desktop");
  await context.close();
}

async function verifyPublicShare(browser, baseUrl, token, drawingNumber) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/share/${token}`, { waitUntil: "networkidle" });
  await page.locator(".public-share-hero .identity-primary", { hasText: drawingNumber }).waitFor({ timeout: 15000 });
  record("Public share hero uses primary identity", (await page.locator(".public-share-hero .identity-primary", { hasText: drawingNumber }).count()) === 1);
  record("Public share metadata rows render", (await page.locator(".public-share-hero .metadata-pair").count()) >= 2);
  await page.locator(".public-share-panel .integrity-details > summary").first().click();
  record("Public share SHA uses diagnostic value", await page.locator(".public-share-panel .diagnostic-value", { hasText: "SHA256" }).first().isVisible());
  await verifyNoOverflow(page, "Public share mobile");
  await context.close();
}

function runStaticChecks() {
  const css = read("src/app/globals.css");
  const dashboardLayout = read("src/components/dashboard/layout-parts.tsx");
  const dashboard = read("src/components/dashboard.tsx");
  const handoff = read("src/app/handoff/page.tsx");
  const share = read("src/app/share/[token]/page.tsx");
  const upload = read("src/app/upload/page.tsx");
  const packageJson = readJson("package.json");

  record("CSS limits detail row label selector to direct children", css.includes(".detail-row > span"));
  record("CSS includes diagnostic value primitive", css.includes(".diagnostic-value") && css.includes(".integrity-details .diagnostic-value"));
  record(
    "Dashboard table uses primary identity and metadata badges",
    dashboardLayout.includes("identity-primary") &&
      dashboardLayout.includes("metadata-badge") &&
      dashboardLayout.includes("submission.revision")
  );
  record("Dashboard sandbox metadata avoids raw dotted strings", !dashboard.includes("source_revision} - 試作版次"));
  record("Handoff SHA values use diagnostic primitive", !handoff.includes("<small>SHA256") && handoff.includes('className="diagnostic-value">SHA256'));
  record("Public share SHA values use diagnostic primitive", !share.includes("<small>SHA256") && share.includes('className="diagnostic-value">SHA256'));
  record("Public share source filename uses diagnostic primitive", share.includes("來源檔案 {line.source_filename}"));
  record("Upload success submission ID uses diagnostic primitive", upload.includes("送審 ID {message.submissionId}"));
  record("Package exposes UX hierarchy QC script", packageJson.scripts?.["qc:ux-attribute-hierarchy"] === "node scripts/qc-ux-attribute-hierarchy.mjs");
}

let app;
let mock;
try {
  runStaticChecks();
  mock = await startMockReleaseFunction();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port, mock.url);
  await waitForApp(baseUrl, app.getOutput);

  const unique = Date.now().toString().slice(-6);
  const engineerCookie = await login(baseUrl, "engineer@example.com");
  const managerCookie = await login(baseUrl, "manager@example.com");
  const submissionId = await createSubmission(baseUrl, engineerCookie, unique);
  await approveSubmission(baseUrl, managerCookie, submissionId);
  const token = await createReadonlyShare(baseUrl, managerCookie, submissionId);
  const drawingNumber = `QC-UX-${unique}`;

  const browser = await chromium.launch({ headless: true });
  try {
    await verifyDashboard(browser, baseUrl, managerCookie, drawingNumber);
    await verifyUpload(browser, baseUrl, engineerCookie);
    await verifyHandoff(browser, baseUrl, managerCookie, drawingNumber);
    await verifyPublicShare(browser, baseUrl, token, drawingNumber);
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        total: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
        results
      },
      null,
      2
    )
  );
  process.exitCode = 0;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        total: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length || 1,
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
  await delay(500);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.warn(`Cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}
