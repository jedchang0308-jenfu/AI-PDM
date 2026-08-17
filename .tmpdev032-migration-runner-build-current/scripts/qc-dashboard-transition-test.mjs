import { chromium } from "playwright";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
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

async function createSubmission(cookie) {
  const drawingNumber = `TRANS-${token}`;
  const form = new FormData();
  form.set("drawing_number", drawingNumber);
  form.set("part_number", `P-TRANS-${token}`);
  form.set("part_name", "Transition search seed");
  form.set("revision", "A");
  form.set("material", "TRANS-Material");
  form.set("surface_finish", "TRANS-Finish");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for transition search");
  form.append("files", new File([Buffer.from("transition placeholder")], `${drawingNumber}.pdf`, { type: "application/pdf" }));
  const response = await fetch(`${apiBaseUrl}/api/submissions`, { method: "POST", headers: { cookie: cookie.header }, body: form });
  const body = await response.json().catch(() => ({}));
  record("transition seed created", response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, drawingNumber };
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
  const source = readProjectFile(root, "src/components/dashboard.tsx");
  record("TRANS-001 Dashboard imports useTransition", source.includes("useTransition"));
  record("TRANS-002 submissions update is wrapped in startTransition", /startSubmissionTransition\(\(\) => \{\s+setSubmissions/s.test(source));

  const engineerCookie = await apiLogin("engineer@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const seed = await createSubmission(engineerCookie);

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    const input = page.locator(".primary-search input");
    await input.fill("TRANS");
    await input.pressSequentially(`-${token}`, { delay: 5 });
    record("TRANS-003 rapid typing keeps input value", (await input.inputValue()) === seed.drawingNumber);
    await page.locator("tbody tr", { hasText: seed.drawingNumber }).first().waitFor({ timeout: 15000 });
    record("TRANS-004 rapid search still renders target row", await page.locator("tbody tr", { hasText: seed.drawingNumber }).count().then((count) => count > 0));

    await page.locator(".status-tabs button").filter({ hasText: "待審核" }).click();
    await page.locator("tbody tr", { hasText: seed.drawingNumber }).first().waitFor({ timeout: 15000 });
    record("TRANS-005 status switch remains usable after rapid input", await page.locator("tbody tr", { hasText: seed.drawingNumber }).count().then((count) => count > 0));
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
