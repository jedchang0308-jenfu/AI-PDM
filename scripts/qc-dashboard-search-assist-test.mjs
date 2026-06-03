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
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
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
  form.set("drawing_number", `ASSIST-${unique}`);
  form.set("part_number", `P-ASSIST-${unique}`);
  form.set("part_name", "Search assist seed");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for search assist");
  form.append("files", new File([Buffer.from("search assist pdf placeholder")], `ASSIST-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record("Search assist seed submission created", response.status === 201, `HTTP ${response.status}`);
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
    const input = page.locator(".primary-search input");
    await input.fill(`ASSIST-${unique.slice(0, 3)}`);
    const suggestion = page.locator(".search-suggestions button", { hasText: `ASSIST-${unique}` }).first();
    await suggestion.waitFor({ timeout: 15000 });
    record("DSA-001 autocomplete suggestions appear", await page.locator(".search-suggestions").isVisible());
    const suggestionText = (await suggestion.innerText()) ?? "";
    record(
      "DSA-002 suggestion contains drawing and revision",
      suggestionText.includes(`ASSIST-${unique}`) && (suggestionText.includes("Rev A") || suggestionText.includes("版次 A")),
      suggestionText
    );

    await suggestion.click();
    await page.locator(".detail-title-stack", { hasText: `ASSIST-${unique}` }).waitFor({ timeout: 15000 });
    record(
      "DSA-003 clicking suggestion opens drawing detail by business identity",
      await page.locator(".detail-title-stack", { hasText: `ASSIST-${unique}` }).count().then((count) => count > 0)
    );
    record("DSA-004 suggestion fills search with drawing number", (await input.inputValue()) === `ASSIST-${unique}`);

    await page.locator("tr", { hasText: `ASSIST-${unique}` }).getByRole("button", { name: `收藏 ASSIST-${unique}` }).click();
    await page.locator("tr", { hasText: `ASSIST-${unique}` }).locator(".icon-button.favorite.active").waitFor({ timeout: 5000 });
    record("DSA-005 favorite button becomes active", await page.locator("tr", { hasText: `ASSIST-${unique}` }).locator(".icon-button.favorite.active").isVisible());
    const favoriteGroup = page.locator(".recent-access > div", { hasText: "常用圖面" });
    record("DSA-006 favorite drawing chip is recorded", await favoriteGroup.getByRole("button", { name: `ASSIST-${unique} Rev A` }).isVisible());

    await page.locator(".detail-close-button").click();
    await page.locator(".detail-panel").waitFor({ state: "detached", timeout: 5000 });
    await favoriteGroup.getByRole("button", { name: `ASSIST-${unique} Rev A` }).click();
    await page.locator("tr", { hasText: `ASSIST-${unique}` }).first().waitFor({ timeout: 15000 });
    record("DSA-007 favorite chip restores drawing search", (await input.inputValue()) === `ASSIST-${unique}`);

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
