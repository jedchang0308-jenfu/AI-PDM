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
  const drawingNumber = `ROWMEMO-${token}`;
  const form = new FormData();
  form.set("drawing_number", drawingNumber);
  form.set("part_number", `P-ROWMEMO-${token}`);
  form.set("part_name", "Row memo seed");
  form.set("revision", "A");
  form.set("material", "ROWMEMO-Material");
  form.set("surface_finish", "ROWMEMO-Finish");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for memoized row");
  form.append("files", new File([Buffer.from("row memo placeholder")], `${drawingNumber}.pdf`, { type: "application/pdf" }));
  const response = await fetch(`${apiBaseUrl}/api/submissions`, { method: "POST", headers: { cookie: cookie.header }, body: form });
  const body = await response.json().catch(() => ({}));
  record("row memo seed created", response.status === 201, `HTTP ${response.status}`);
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
  record("ROWMEMO-001 SubmissionRow uses memo", /const SubmissionRow = memo\(function SubmissionRow/.test(source));
  record("ROWMEMO-002 table renders SubmissionRow component", source.includes("<SubmissionRow"));

  const engineerCookie = await apiLogin("engineer@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const seed = await createSubmission(engineerCookie);

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.locator(".primary-search input").fill(seed.drawingNumber);
    const row = page.locator("tbody tr", { hasText: seed.drawingNumber }).first();
    await row.waitFor({ timeout: 15000 });
    await row.click();
    record("ROWMEMO-003 memoized row still opens detail", await page.locator(".detail", { hasText: seed.drawingNumber }).isVisible());
    await row.locator(".favorite").click();
    record("ROWMEMO-004 memoized row favorite still toggles", await row.locator(".favorite.active").count().then((count) => count === 1));
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
