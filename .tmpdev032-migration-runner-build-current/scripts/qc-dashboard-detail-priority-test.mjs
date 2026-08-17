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

async function createSubmission(cookie, revision = "A") {
  const drawingNumber = `DETAIL-${unique}-${revision}`;
  const partNumber = `P-DETAIL-${unique}`;
  const form = new FormData();
  form.set("drawing_number", drawingNumber);
  form.set("part_number", partNumber);
  form.set("part_name", "Detail priority seed");
  form.set("revision", revision);
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "QC seed for detail priority layout");
  form.append("files", new File([Buffer.from("detail priority pdf placeholder")], `${drawingNumber}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`Detail priority seed ${revision} submission created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, drawingNumber, partNumber, revision };
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

function hasRequested(requestPaths, fragment) {
  return requestPaths.some((path) => path.includes(fragment));
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const primary = await createSubmission(engineerCookie, "A");
  const secondary = await createSubmission(engineerCookie, "B");
  const browser = await chromium.launch({ headless: true });

  try {
    const { context, page } = await authenticatedPage(browser, "manager@example.com");
    const requestPaths = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("/api/submissions/") || url.pathname.includes("/api/items/") || url.pathname.includes("/api/integrations/")) {
        requestPaths.push(`${url.pathname}${url.search}`);
      }
    });

    await page.locator(".primary-search input").fill(`DETAIL-${unique}`);
    await page.getByText(primary.drawingNumber).first().waitFor({ timeout: 15000 });
    record("DDP-020 list remains the primary focus before row selection", (await page.locator(".pdm-detail-drawer").count()) === 0);
    const targetRow = page.locator("tbody tr", { hasText: primary.drawingNumber }).first();
    await targetRow.waitFor({ timeout: 15000 });
    await targetRow.locator("td").first().waitFor({ state: "visible", timeout: 15000 });
    const identifierCellsBefore = await Promise.all([0, 1, 2].map((index) => targetRow.locator("td").nth(index).boundingBox()));
    await targetRow.click();
    await page.locator(".detail-quick-actions").waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);

    const detailBox = await page.locator(".pdm-detail-drawer").boundingBox();
    const viewport = page.viewportSize();
    const identifierCellsAfter = await Promise.all([0, 1, 2].map((index) => targetRow.locator("td").nth(index).boundingBox()));
    const thirdIdentifierCellBox = identifierCellsAfter[2];
    const identifierLayoutStable = identifierCellsBefore.every((before, index) => {
      const after = identifierCellsAfter[index];
      return Boolean(before && after && Math.abs(before.x - after.x) <= 1 && Math.abs(before.width - after.width) <= 1);
    });
    record(
      "DDP-021 detail opens as right-side drawer",
      Boolean(detailBox && viewport && detailBox.width >= 380 && detailBox.width <= viewport.width * 0.72 && detailBox.x > viewport.width * 0.5),
      JSON.stringify({ detailBox, viewport })
    );
    record(
      "DDP-022 detail overlay does not shift identifier columns",
      identifierLayoutStable,
      JSON.stringify({ identifierCellsBefore, identifierCellsAfter })
    );
    record(
      "DDP-024 overlay keeps drawing number, part number, and part name visible",
      Boolean(detailBox && thirdIdentifierCellBox && thirdIdentifierCellBox.x + thirdIdentifierCellBox.width <= detailBox.x),
      JSON.stringify({ detailBox, thirdIdentifierCellBox })
    );
    const backdropColor = await page.locator(".pdm-detail-drawer-backdrop").evaluate((element) => getComputedStyle(element).backgroundColor);
    record(
      "DDP-025 drawer does not darken the list backdrop",
      backdropColor === "rgba(0, 0, 0, 0)" || backdropColor === "transparent",
      backdropColor
    );

    record("DDP-001 detail title is drawing-oriented", await page.getByRole("heading", { name: "圖面明細" }).isVisible());
    record("DDP-002 old review detail title is removed", (await page.getByRole("heading", { name: "送審明細" }).count()) === 0);
    record("DDP-003 file section is labelled", await page.locator(".file-list-label", { hasText: "檔案" }).isVisible());
    record("DDP-004 quick actions show preview link", await page.locator(".detail-quick-actions").getByRole("link", { name: /預覽/ }).count().then((count) => count > 0));
    record("DDP-005 quick actions show download link", await page.locator(".detail-quick-actions").getByRole("link", { name: /下載/ }).count().then((count) => count > 0));
    const quickActionHeaderText = (await page.locator(".detail-quick-actions > div").first().textContent()) ?? "";
    record(
      "DDP-006 summary-table fields are not repeated in quick action header",
      !quickActionHeaderText.includes(primary.drawingNumber) && !quickActionHeaderText.includes(primary.partNumber),
      quickActionHeaderText
    );

    const highCostFragments = ["/ai-summary", "/ai-risks", "/reuse-candidates", "/duplicate-geometry", "/supplier-responses", "/sync-runs"];
    record(
      "DDP-007 high-cost resources are not requested on initial detail open",
      !highCostFragments.some((fragment) => hasRequested(requestPaths, fragment)),
      requestPaths.join(", ")
    );
    record(
      "DDP-008 system identifiers are collapsed on first paint",
      !(await page.locator(".system-diagnostics .detail-row", { hasText: "送審 ID" }).isVisible())
    );
    record(
      "DDP-009 SHA256 is hidden behind diagnostics expansion",
      !(await page.locator(".system-diagnostics .file-diagnostic-item", { hasText: "SHA256" }).isVisible())
    );

    const quickTop = await topOf(page, ".detail-quick-actions");
    const engineeringTop = await topOf(page, ".engineering-context");
    const collaborationTop = await topOf(page, ".collaboration-review");
    const diagnosticsTop = await topOf(page, ".system-diagnostics");
    record("DDP-010 workflow layers are ordered", quickTop < engineeringTop && engineeringTop < collaborationTop && collaborationTop < diagnosticsTop);

    await page.locator(".engineering-context > summary").click();
    await page.locator(".engineering-context .revision-history").waitFor({ timeout: 15000 });
    record("DDP-011 engineering expansion requests BOM diff", hasRequested(requestPaths, `/api/submissions/${primary.submissionId}/bom/diff`), requestPaths.join(", "));
    record("DDP-012 engineering expansion requests where-used", hasRequested(requestPaths, "/where-used"), requestPaths.join(", "));
    record("DDP-013 engineering expansion keeps BOM visible", await page.locator(".engineering-context .bom-list").isVisible());
    record("DDP-014 engineering expansion keeps where-used visible", await page.locator(".engineering-context .where-used-list").isVisible());
    await page.locator("tbody tr", { hasText: secondary.drawingNumber }).first().click();
    await page.locator(".detail-title-stack", { hasText: secondary.drawingNumber }).waitFor({ timeout: 15000 });
    await page.locator(".engineering-context .revision-history .revision-item", { hasText: "版次 B" }).waitFor({ timeout: 15000 });
    record(
      "DDP-026 open engineering context reloads revision history after row switch",
      await page.locator(".engineering-context .revision-history .revision-item", { hasText: "版次 B" }).isVisible()
    );
    const revisionHistoryText = (await page.locator(".engineering-context .revision-history").textContent()) ?? "";
    record(
      "DDP-027 revision history shows revision only without drawing or submission ids",
      revisionHistoryText.includes("版次 B") && !revisionHistoryText.includes(secondary.drawingNumber) && !revisionHistoryText.includes(secondary.submissionId),
      revisionHistoryText
    );
    const engineeringContextText = (await page.locator(".engineering-context").textContent()) ?? "";
    record(
      "DDP-028 engineering context does not expose raw submission ids",
      !/SUB-[A-Z0-9-]+/u.test(engineeringContextText),
      engineeringContextText
    );

    await page.locator(".collaboration-review > summary").click();
    await page.locator(".collaboration-review .discussion-panel").waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    record("DDP-015 collaboration expansion requests AI summary lazily", hasRequested(requestPaths, `/api/submissions/${secondary.submissionId}/ai-summary`), requestPaths.join(", "));
    record("DDP-016 collaboration expansion keeps approve control visible", await page.getByRole("button", { name: /核准/ }).count().then((count) => count > 0));
    record("DDP-017 review issues remain below engineering context", (await topOf(page, ".collaboration-review .issue-panel")) > (await topOf(page, ".engineering-context .where-used-list")));

    await page.locator(".system-diagnostics > summary").click();
    await page.locator(".system-diagnostics .detail-row", { hasText: "送審 ID" }).waitFor({ timeout: 15000 });
    record("DDP-018 diagnostics reveal submission id", await page.getByText(secondary.submissionId).first().isVisible());
    await page.locator(".system-diagnostics .file-diagnostic-item > summary").first().click();
    record("DDP-019 diagnostics reveal SHA256 after file expansion", await page.locator(".system-diagnostics .file-diagnostic-item", { hasText: "SHA256" }).isVisible());
    await page.locator("button[aria-label='關閉圖面明細']").click();
    await page.waitForTimeout(100);
    record("DDP-023 close control returns to list-only focus", (await page.locator(".pdm-detail-drawer").count()) === 0);

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
