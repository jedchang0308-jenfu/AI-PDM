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

async function apiLogin(email) {
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

async function createSubmission(cookie, suffix) {
  const drawingNumber = `PERF10-${token}-${suffix}`;
  const form = new FormData();
  form.set("drawing_number", drawingNumber);
  form.set("part_number", `P-PERF10-${token}-${suffix}`);
  form.set("part_name", `Detail loading ${suffix}`);
  form.set("revision", suffix);
  form.set("material", "PERF10-Material");
  form.set("surface_finish", "PERF10-Finish");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for detail loading UX");
  form.append("files", new File([Buffer.from("detail loading placeholder")], `${drawingNumber}.pdf`, { type: "application/pdf" }));
  const response = await fetch(`${apiBaseUrl}/api/submissions`, { method: "POST", headers: { cookie: cookie.header }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`${drawingNumber} created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, drawingNumber };
}

async function authenticatedPage(browser, cookie, delayedSubmissionId) {
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
  await page.route(`**/api/submissions/${delayedSubmissionId}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto(`${browserBaseUrl}/`);
  await page.locator(".primary-search input").waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const older = await createSubmission(engineerCookie, "A");
  const newer = await createSubmission(engineerCookie, "B");

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie, older.submissionId);
    await page.locator(".primary-search input").fill(`PERF10-${token}`);
    await page.locator("tbody tr", { hasText: newer.drawingNumber }).first().waitFor({ timeout: 15000 });
    await page.locator(".detail", { hasText: newer.drawingNumber }).waitFor({ timeout: 15000 });

    const olderRow = page.locator("tbody tr", { hasText: older.drawingNumber }).first();
    await olderRow.click();
    record("PERF10-001 clicked row becomes active immediately", await olderRow.evaluate((row) => row.classList.contains("selected-row")));
    record("PERF10-002 detail panel exposes loading state", await page.locator("[data-testid='detail-loading']").isVisible());
    record("PERF10-003 previous detail remains visible during slow load", await page.locator(".detail", { hasText: newer.drawingNumber }).isVisible());

    await page.locator(".detail", { hasText: older.drawingNumber }).waitFor({ timeout: 15000 });
    record("PERF10-004 delayed detail eventually replaces previous detail", await page.locator(".detail", { hasText: older.drawingNumber }).isVisible());
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
