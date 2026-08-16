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

function seedRows() {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertSubmission = db.prepare(
    `INSERT OR IGNORE INTO submissions (
      id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine,
      material, surface_finish, document_type, change_description, status, submitted_by, approval_required, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let index = 0; index < 150; index += 1) {
    const stamp = new Date(Date.now() + 60_000 + index).toISOString();
    const itemId = `item-virt-${token}-${index}`;
    insertItem.run(itemId, `P-VIRT-${token}-${index}`, `Virtual row seed ${index}`, "A", stamp, stamp);
    insertSubmission.run(
      `SUB-VIRT-${token}-${String(index).padStart(3, "0")}`,
      itemId,
      `VIRT-${token}-${String(index).padStart(3, "0")}`,
      "A",
      "",
      "",
      "",
      "",
      "",
      "VirtualMaterial",
      "VirtualFinish",
      "Drawing",
      "QC virtual table seed",
      "Rejected",
      "user-engineer-demo",
      1,
      stamp,
      stamp
    );
  }
  db.close();
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
  await page.locator(".virtual-table-wrap").waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  seedRows();
  const managerCookie = await login("manager@example.com");
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.locator(".status-tabs button").nth(4).click();
    await page.locator("tbody tr", { hasText: `VIRT-${token}-149` }).first().waitFor({ timeout: 15000 });
    const renderedRows = await page.locator("tbody tr:not(.virtual-spacer)").count();
    const totalRows = await page.locator(".virtual-table-wrap").getAttribute("data-total-rows");
    record("VT-001 table receives full page data", Number(totalRows) >= 100, `total ${totalRows}`);
    record("VT-002 table renders only visible row range", renderedRows < 60, `rendered ${renderedRows}`);

    await page.locator(".virtual-table-wrap").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.locator("tbody tr", { hasText: `VIRT-${token}-050` }).first().waitFor({ timeout: 15000 });
    record("VT-003 scrolling renders lower visible range", await page.locator("tbody tr", { hasText: `VIRT-${token}-050` }).count().then((count) => count > 0));

    const targetRow = page.locator("tbody tr", { hasText: `VIRT-${token}-050` }).first();
    await targetRow.click();
    await page.getByText(`SUB-VIRT-${token}-050`).first().waitFor({ timeout: 15000 });
    record("VT-004 selecting virtualized row opens detail", await page.getByText(`SUB-VIRT-${token}-050`).count().then((count) => count > 0));

    await targetRow.locator(".icon-button.favorite").click();
    await targetRow.locator(".icon-button.favorite.active").waitFor({ timeout: 5000 });
    record("VT-005 favorite still works on virtualized row", await targetRow.locator(".icon-button.favorite.active").isVisible());
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
