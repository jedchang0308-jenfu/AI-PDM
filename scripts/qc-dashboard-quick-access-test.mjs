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
  form.set("drawing_number", `QUICK-${unique}`);
  form.set("part_number", `P-QUICK-${unique}`);
  form.set("part_name", "Quick access seed");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for quick access layout");
  form.append("files", new File([Buffer.from("quick access pdf placeholder")], `QUICK-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record("Quick access seed submission created", response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
}

async function authenticatedPage(browser, email) {
  const cookie = await apiLogin(email);
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
  await page.getByRole("heading", { name: "PDM 圖面資料庫" }).waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const submissionId = await createSubmission(engineerCookie);
  const browser = await chromium.launch({ headless: true });

  try {
    const { context, page } = await authenticatedPage(browser, "manager@example.com");
    const quickAccess = page.locator(".quick-access");
    record("DQA-001 quick access area is visible", await quickAccess.isVisible());

    for (const label of ["全部圖面", "最近發布", "我建立的", "Checkout 中", "缺交接檔", "Release 失敗"]) {
      record(`DQA-002 quick chip ${label}`, await quickAccess.getByRole("button", { name: label }).isVisible());
    }

    const searchInput = page.locator(".primary-search input");
    await searchInput.fill(`QUICK-${unique}`);
    await page.getByText(`QUICK-${unique}`).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(700);
    record("DQA-003 recent search chip is recorded", await quickAccess.getByRole("button", { name: `QUICK-${unique}`, exact: true }).isVisible());

    await page.locator("tr", { hasText: `QUICK-${unique}` }).first().click();
    await page.getByText(submissionId).first().waitFor({ timeout: 15000 });
    record("DQA-004 recent drawing chip is recorded", await quickAccess.getByRole("button", { name: `QUICK-${unique} Rev A` }).isVisible());

    await quickAccess.getByRole("button", { name: "Release 失敗" }).click();
    record("DQA-005 release failed quick chip becomes active", await page.locator(".quick-chip.active", { hasText: "Release 失敗" }).isVisible());
    record("DQA-006 release failed quick chip drives status tab", ((await page.locator(".status-tabs button.active").textContent()) ?? "").trim() === "發布失敗");

    await quickAccess.getByRole("button", { name: "缺交接檔" }).click();
    record("DQA-007 missing handoff quick chip becomes active", await page.locator(".quick-chip.active", { hasText: "缺交接檔" }).isVisible());

    await quickAccess.getByRole("button", { name: `QUICK-${unique}`, exact: true }).click();
    await page.getByText(`QUICK-${unique}`).first().waitFor({ timeout: 15000 });
    record("DQA-008 recent search chip restores search", (await searchInput.inputValue()) === `QUICK-${unique}`);

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
