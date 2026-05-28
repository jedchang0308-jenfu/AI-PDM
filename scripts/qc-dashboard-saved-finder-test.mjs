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

function savedSearchRow(page, name) {
  return page.locator(".saved-finder-item").filter({ hasText: name });
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
  form.set("drawing_number", `SAVED-${token}`);
  form.set("part_number", `P-SAVED-${token}`);
  form.set("part_name", "Saved finder seed");
  form.set("revision", "A");
  form.set("product_line", `SavedLine-${token}`);
  form.set("customer", `SavedCustomer-${token}`);
  form.set("project_code", `SavedProject-${token}`);
  form.set("process_name", `SavedProcess-${token}`);
  form.set("machine", `SavedMachine-${token}`);
  form.set("material", `SavedMaterial-${token}`);
  form.set("surface_finish", `SavedFinish-${token}`);
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for saved finder");
  form.append("files", new File([Buffer.from("saved finder placeholder")], `SAVED-${token}.pdf`, { type: "application/pdf" }));
  const response = await fetch(`${apiBaseUrl}/api/submissions`, { method: "POST", headers: { cookie: cookie.header }, body: form });
  const body = await response.json().catch(() => ({}));
  record("Saved finder seed created", response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
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
  const engineerCookie = await apiLogin("engineer@example.com");
  await createSubmission(engineerCookie);
  const managerCookie = await apiLogin("manager@example.com");
  const browser = await chromium.launch({ headless: true });
  const savedName = `Saved Filter ${token}`;

  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.locator(".finder-filter-menu summary").click();
    await page.locator(".finder-filter-grid input").nth(0).fill(`SavedLine-${token}`);
    await page.locator(".finder-filter-grid input").nth(1).fill(`SavedCustomer-${token}`);
    await page.getByLabel("Saved finder search name").fill(savedName);
    await page.getByRole("button", { name: "儲存常用條件" }).click();
    await savedSearchRow(page, savedName).waitFor({ timeout: 5000 });
    record("SF-001 saved condition appears immediately", await savedSearchRow(page, savedName).isVisible());

    const storageSnapshot = await page.evaluate(() => ({
      manager: window.localStorage.getItem("pdm.savedFinderSearches.user-manager-demo"),
      engineer: window.localStorage.getItem("pdm.savedFinderSearches.user-engineer-demo")
    }));
    record("SF-002 saved condition uses manager-scoped key", Boolean(storageSnapshot.manager?.includes(savedName)));
    record("SF-003 saved condition does not write engineer key", !storageSnapshot.engineer?.includes(savedName));

    await page.reload();
    await page.locator(".primary-search input").waitFor({ timeout: 15000 });
    await page.locator(".finder-filter-menu summary").click();
    await savedSearchRow(page, savedName).locator("button").first().click();
    await page.locator("tbody tr", { hasText: `SAVED-${token}` }).first().waitFor({ timeout: 15000 });
    record("SF-004 saved condition applies after reload", await page.locator("tbody tr", { hasText: `SAVED-${token}` }).count().then((count) => count > 0));

    await savedSearchRow(page, savedName).locator(".icon-button").click();
    record("SF-005 deleted condition disappears", await savedSearchRow(page, savedName).count().then((count) => count === 0));
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
