import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const browserBaseUrl = toBrowserBaseUrl(apiBaseUrl);
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const results = [];

function toBrowserBaseUrl(value) {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1") {
    url.hostname = "localhost";
  }
  return url.toString().replace(/\/$/, "");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
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

async function createSubmission(cookie) {
  const form = new FormData();
  form.set("drawing_number", `FIND-${unique}`);
  form.set("part_number", `P-FIND-${unique}`);
  form.set("part_name", "Find-first dashboard seed");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for dashboard find-first layout");
  form.append("files", new File([Buffer.from("find first pdf placeholder")], `FIND-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record("Find-first seed submission created", response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
}

async function authenticatedPage(browser, email) {
  const cookie = await apiLogin(email);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  await page.getByRole("heading", { name: "PDM 圖面資料庫" }).waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const submissionId = await createSubmission(engineerCookie);
  const browser = await chromium.launch({ headless: true });

  try {
    const { context, page } = await authenticatedPage(browser, "manager@example.com");
    const primarySearch = page.locator(".primary-search input");
    record("DFF-001 first viewport is find-focused", await page.getByRole("heading", { name: "PDM 圖面資料庫" }).isVisible());
    record("DFF-002 primary search is prominent", await primarySearch.isVisible());
    record(
      "DFF-003 primary search supports drawing metadata",
      (await primarySearch.getAttribute("placeholder")) === "搜尋圖號、料號、品名、版次、材質、檔名、狀態或提交者"
    );
    record("DFF-004 default list status is All", ((await page.locator(".status-tabs button.active").textContent()) ?? "").trim() === "全部");
    record("DFF-005 list title is drawing data", await page.getByRole("heading", { name: "圖面資料", exact: true }).isVisible());
    record("DFF-006 old review-list title is removed", (await page.getByRole("heading", { name: "送審清單" }).count()) === 0);

    record("DFF-007 find workflow area is ready", await page.locator(".quick-access").isVisible());

    const compactNotifications = page.locator(".notification-center.compact-notifications");
    record("DFF-008 notifications are downgraded to compact area", await compactNotifications.isVisible());
    record("DFF-009 notification list is capped to six", await compactNotifications.locator(".notification-item").count().then((count) => count <= 6));

    await primarySearch.fill(`FIND-${unique}`);
    await page.getByText(`FIND-${unique}`).first().waitFor({ timeout: 15000 });
    record("DFF-010 primary search finds seeded drawing", await page.getByText(`FIND-${unique}`).count().then((count) => count > 0));
    const resultRow = page.locator("tr", { hasText: `FIND-${unique}` }).first();
    record("DFF-011 file availability is visible in result row", ((await resultRow.innerText()) ?? "").includes("PDF"));
    record("DFF-012 result detail can still open", await resultRow.click().then(() => true));
    await page.locator(".detail-title-stack", { hasText: `FIND-${unique}` }).waitFor({ timeout: 15000 });
    record(
      "DFF-013 selected drawing detail loads by business identity",
      await page.locator(".detail-title-stack", { hasText: `FIND-${unique}` }).count().then((count) => count > 0)
    );

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
