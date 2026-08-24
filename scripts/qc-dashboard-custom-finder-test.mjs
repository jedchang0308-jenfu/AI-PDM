import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const browserBaseUrl = toBrowserBaseUrl(apiBaseUrl);
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const results = [];
const root = process.cwd();

function toBrowserBaseUrl(value) {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1") url.hostname = "localhost";
  return url.toString().replace(/\/$/, "");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

function getDbPath() {
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  return path.join(dataDir, "ai-pdm.sqlite");
}

function ensureUser() {
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(readProjectFile(root, "db/schema.sql"));
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, display_name, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       display_name = excluded.display_name,
       password_hash = excluded.password_hash,
       role = excluded.role,
       updated_at = excluded.updated_at`
  ).run("user-finder-other-engineer", "Finder Other Engineer", "finder-other@example.com", hashPassword(password), "Engineer", now, now);
  db.close();
}

async function apiLogin(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`API login ${email}`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  return { header: cookie, name, value: valueParts.join("=") };
}

async function createSubmission(cookie, prefix, productLine, childPartNumber) {
  const drawingNumber = `${prefix}-${unique}`;
  const fileName = `${drawingNumber}.sldasm`;
  const form = new FormData();
  form.set("drawing_number", drawingNumber);
  form.set("part_number", `P-${drawingNumber}`);
  form.set("part_name", `${prefix} custom finder seed`);
  form.set("revision", "A");
  form.set("product_line", productLine);
  form.set("customer", `FinderCustomer-${unique}`);
  form.set("project_code", `FinderProject-${unique}`);
  form.set("process_name", `FinderProcess-${unique}`);
  form.set("machine", `FinderMachine-${unique}`);
  form.set("material", `FinderMaterial-${unique}`);
  form.set("surface_finish", `FinderFinish-${unique}`);
  form.set("document_type", "Assembly");
  form.set("change_description", "QC seed for custom finder");
  form.set(
    "cad_references_json",
    JSON.stringify([
      {
        sourceFilename: fileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${childPartNumber}.sldprt`,
        referencedPartNumber: childPartNumber,
        referenceType: "unknown",
        quantity: 2,
        extractionMethod: "qc_custom_finder",
        confidence: "high"
      }
    ])
  );
  form.append("files", new File([Buffer.from("custom finder assembly placeholder")], fileName, { type: "application/octet-stream" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`${prefix} custom finder seed created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, drawingNumber };
}

async function search(cookie, params) {
  const url = new URL(`${apiBaseUrl}/api/search`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { cookie: cookie.header } });
  const body = await response.json().catch(() => ({}));
  record(`search ${url.search}`, response.ok, `HTTP ${response.status}`);
  return body.submissions ?? [];
}

async function authenticatedPage(browser, cookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const page = await context.newPage();
  await page.goto(`${browserBaseUrl}/`);
  await page.locator(".primary-search input").waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  ensureUser();
  const engineerCookie = await apiLogin("engineer@example.com");
  const otherCookie = await apiLogin("finder-other@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const productLine = `FinderLine-${unique}`;
  const childPartNumber = `FinderChild-${unique}`;
  const target = await createSubmission(engineerCookie, "FINDER", productLine, childPartNumber);
  const other = await createSubmission(otherCookie, "FINDER-OTHER", productLine, `OtherChild-${unique}`);

  const combined = await search(managerCookie, {
    productLine,
    customer: `FinderCustomer-${unique}`,
    projectCode: `FinderProject-${unique}`,
    processName: `FinderProcess-${unique}`,
    machine: `FinderMachine-${unique}`,
    material: `FinderMaterial-${unique}`,
    surfaceFinish: `FinderFinish-${unique}`,
    status: "Pending"
  });
  record("DCF-001 combined custom conditions find target", combined.some((submission) => submission.id === target.submissionId));

  const childResults = await search(managerCookie, { childPartNumber });
  record("DCF-002 child part number finds parent assembly", childResults.some((submission) => submission.id === target.submissionId));

  const scoped = await search(engineerCookie, { productLine });
  record("DCF-003 Engineer custom finder includes own submission", scoped.some((submission) => submission.id === target.submissionId));
  record("DCF-004 Engineer custom finder excludes other Engineer submission", !scoped.some((submission) => submission.id === other.submissionId));

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.getByText("進階搜尋", { exact: true }).click();
    await page.getByPlaceholder("產品線").fill(productLine);
    await page.getByPlaceholder("子件料號").fill(childPartNumber);
    await page.locator("tr", { hasText: target.drawingNumber }).first().waitFor({ timeout: 15000 });
    record("DCF-005 Dashboard advanced finder filters visible results", await page.locator("tr", { hasText: target.drawingNumber }).count().then((count) => count > 0));

    await page.getByRole("button", { name: "清除進階搜尋" }).click();
    await page.getByPlaceholder("產品線").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    const searchInput = page.locator(".primary-search input");
    await searchInput.fill(target.drawingNumber);
    const fullTextRow = page.locator("tbody tr", { hasText: target.drawingNumber }).first();
    await fullTextRow.waitFor({ timeout: 15000 });
    record("DCF-006 existing full-text search still works", await fullTextRow.isVisible());
    await context.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
