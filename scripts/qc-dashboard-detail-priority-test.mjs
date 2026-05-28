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
  form.set("drawing_number", `DETAIL-${unique}`);
  form.set("part_number", `P-DETAIL-${unique}`);
  form.set("part_name", "Detail priority seed");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for detail priority layout");
  form.append("files", new File([Buffer.from("detail priority pdf placeholder")], `DETAIL-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record("Detail priority seed submission created", response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
}

async function authenticatedPage(browser, email) {
  const cookie = await apiLogin(email);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
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

async function topOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Missing visible selector ${selector}`);
  return box.y;
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const submissionId = await createSubmission(engineerCookie);
  const browser = await chromium.launch({ headless: true });

  try {
    const { context, page } = await authenticatedPage(browser, "manager@example.com");
    await page.locator(".primary-search input").fill(`DETAIL-${unique}`);
    await page.getByText(`DETAIL-${unique}`).first().waitFor({ timeout: 15000 });
    await page.locator("tr", { hasText: `DETAIL-${unique}` }).first().click();
    await page.getByText(submissionId).first().waitFor({ timeout: 15000 });

    record("DDP-001 detail title is drawing-oriented", await page.getByRole("heading", { name: "圖面明細" }).isVisible());
    record("DDP-002 old review detail title is removed", (await page.getByRole("heading", { name: "送審明細" }).count()) === 0);
    record("DDP-003 file section is labelled", await page.locator(".file-list-label", { hasText: "檔案" }).isVisible());

    const fileTop = await topOf(page, ".file-list");
    const revisionTop = await topOf(page, ".revision-history");
    const bomTop = await topOf(page, ".bom-list");
    const whereUsedTop = await topOf(page, ".where-used-list");
    const checkoutTop = await topOf(page, ".checkout-card");
    const discussionTop = await topOf(page, ".discussion-panel");
    const issueTop = await topOf(page, ".issue-panel");

    record("DDP-004 files appear before checkout/review tools", fileTop < checkoutTop);
    record("DDP-005 revision history appears before checkout/review tools", revisionTop < checkoutTop);
    record("DDP-006 BOM appears before checkout/review tools", bomTop < checkoutTop);
    record("DDP-007 Where-used appears before checkout/review tools", whereUsedTop < checkoutTop);
    record("DDP-008 discussion is below drawing context", discussionTop > whereUsedTop);
    record("DDP-009 review issues are below drawing context", issueTop > whereUsedTop);

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
