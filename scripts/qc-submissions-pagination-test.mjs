import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const browserBaseUrl = toBrowserBaseUrl(apiBaseUrl);
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const token = Date.now().toString().slice(-6);
const results = [];

function toBrowserBaseUrl(value) {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1") url.hostname = "localhost";
  return url.toString().replace(/\/$/, "");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function getDb() {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  return new Database(path.join(dataDir, "ai-pdm.sqlite"));
}

function seedRows() {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, display_name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("user-pagination-other", "Pagination Other", "pagination-other@example.com", null, "Engineer", now, now);
  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertSubmission = db.prepare(
    `INSERT OR IGNORE INTO submissions (
      id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine,
      material, surface_finish, document_type, change_description, status, submitted_by, approval_required, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const ownIds = [];
  const otherIds = [];
  for (let index = 0; index < 125; index += 1) {
    const itemId = `item-page-${token}-${index}`;
    const submissionId = `SUB-PAGE-${token}-${String(index).padStart(3, "0")}`;
    ownIds.push(submissionId);
    insertItem.run(itemId, `P-PAGE-${token}-${index}`, `Pagination seed ${index}`, "A", now, now);
    insertSubmission.run(
      submissionId,
      itemId,
      `PAGE-${token}-${index}`,
      "A",
      "",
      "",
      "",
      "",
      "",
      "PaginationMaterial",
      "PaginationFinish",
      "Drawing",
      "QC pagination seed",
      "Rejected",
      "user-engineer-demo",
      1,
      new Date(Date.now() + index).toISOString(),
      new Date(Date.now() + index).toISOString()
    );
  }
  for (let index = 0; index < 5; index += 1) {
    const itemId = `item-page-other-${token}-${index}`;
    const submissionId = `SUB-PAGE-OTHER-${token}-${index}`;
    otherIds.push(submissionId);
    insertItem.run(itemId, `P-PAGE-OTHER-${token}-${index}`, `Other pagination seed ${index}`, "A", now, now);
    insertSubmission.run(
      submissionId,
      itemId,
      `PAGE-OTHER-${token}-${index}`,
      "A",
      "",
      "",
      "",
      "",
      "",
      "PaginationMaterial",
      "PaginationFinish",
      "Drawing",
      "QC other pagination seed",
      "Rejected",
      "user-pagination-other",
      1,
      new Date(Date.now() + index).toISOString(),
      new Date(Date.now() + index).toISOString()
    );
  }
  db.close();
  return { ownIds, otherIds };
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`login ${email}`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  return { header: cookie, name, value: valueParts.join("=") };
}

async function fetchSubmissions(cookie, params) {
  const url = new URL(`${apiBaseUrl}/api/submissions`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { cookie: cookie.header } });
  const body = await response.json().catch(() => ({}));
  record(`submissions ${url.search}`, response.ok, `HTTP ${response.status}`);
  return body;
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
  const { ownIds, otherIds } = seedRows();
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const firstPage = await fetchSubmissions(engineerCookie, { status: "Rejected" });
  record("PAGE-001 default page returns at most 100 rows", firstPage.submissions?.length <= 100, `count ${firstPage.submissions?.length}`);
  record("PAGE-002 default page advertises next offset", firstPage.pagination?.limit === 100 && firstPage.pagination?.hasMore === true);
  record(
    "PAGE-003 Engineer page excludes other Engineer rows",
    !firstPage.submissions?.some((submission) => otherIds.includes(submission.id))
  );

  const secondPage = await fetchSubmissions(engineerCookie, { status: "Rejected", limit: 100, offset: 100 });
  record("PAGE-004 second page returns remaining own rows", secondPage.submissions?.some((submission) => ownIds.includes(submission.id)));
  record("PAGE-005 second page remains permission scoped", !secondPage.submissions?.some((submission) => otherIds.includes(submission.id)));

  const searchResponse = await fetch(`${apiBaseUrl}/api/search?q=${encodeURIComponent(`PAGE-${token}-124`)}`, {
    headers: { cookie: engineerCookie.header }
  });
  const searchBody = await searchResponse.json().catch(() => ({}));
  record("PAGE-006 existing search still finds beyond first page", searchBody.submissions?.some((submission) => submission.id === ownIds[124]));

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.getByRole("button", { name: "載入更多" }).waitFor({ timeout: 15000 });
    const before = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: "載入更多" }).click();
    await page.waitForFunction((count) => document.querySelectorAll("tbody tr").length > count, before, { timeout: 15000 });
    const after = await page.locator("tbody tr").count();
    record("PAGE-007 Dashboard load-more appends rows", after > before, `before ${before}, after ${after}`);
    await context.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ passed: results.length, failed: 0, token, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, token, results, error: error.message }, null, 2));
  process.exit(1);
});
