#!/usr/bin/env node

import crypto from "node:crypto";
import Database from "better-sqlite3";
import path from "node:path";
import { chromium } from "playwright";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3131";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const token = Date.now().toString().slice(-7);
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function launchBrowser() {
  const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome";
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function apiLogin(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`Login ${email}`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record(`Session cookie ${email}`, Boolean(name && valueParts.length > 0), cookie ? "cookie received" : "missing cookie");
  return { header: cookie, name, value: valueParts.join("=") };
}

async function requestJson(cookie, route, init = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    ...init,
    headers: {
      cookie: cookie.header,
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${route} HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return { response, body };
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision ?? "1");
  form.set("material", "QC-Material");
  form.set("surface_finish", "QC-Finish");
  form.set("document_type", input.documentType ?? "Assembly");
  form.set("change_description", "QC seed for BOM review diff UI");
  if (input.references) form.set("cad_references_json", JSON.stringify(input.references));
  form.append("files", new File([Buffer.from("bom review ui qc")], `${input.drawingNumber}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, { method: "POST", headers: { cookie: cookie.header }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`Create ${input.partNumber}`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  return { submissionId: body.submissionId, ...input };
}

function markReleased(...submissionIds) {
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    const update = db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, updated_at = ? WHERE id = ?");
    for (const submissionId of submissionIds) update.run(now, now, submissionId);
  } finally {
    db.close();
  }
}

function staticChecks() {
  const pageSource = readProjectFile(root, "src/app/bom/reviews/page.tsx");
  const sidebarSource = readProjectFile(root, "src/components/sidebar-nav.tsx");
  const draftDiffRoute = readProjectFile(root, "src/app/api/bom/drafts/[draftId]/diff/route.ts");
  const pendingRoute = readProjectFile(root, "src/app/api/bom/reviews/pending/route.ts");
  const repositorySource = readProjectFile(root, "src/lib/repositories/bom-repository.ts");
  const packageSource = readProjectFile(root, "package.json");

  record("Sidebar links BOM review page", sidebarSource.includes("/bom/reviews") && sidebarSource.includes("BOM 審核"), "sidebar-nav.tsx");
  record("Review page leads with diff table", pageSource.includes("BOM 差異") && pageSource.includes("bom-review-diff-table"), "page.tsx");
  record("Review page renders approve reject controls", pageSource.includes("核准發布") && pageSource.includes("退回修改"), "page.tsx");
  record("Draft diff route exists", draftDiffRoute.includes("getBomWorkbenchDraftDiff"), "diff route");
  record("Pending review route is manager only", pendingRoute.includes("R&D Manager") && pendingRoute.includes("listPendingBomWorkbenchReviews"), "pending route");
  record("Repository diff detects key fields", ["quantity", "hierarchy", "revision", "sequence"].every((field) => repositorySource.includes(field)), "bom-repository.ts");
  record("Package exposes review UI QC", packageSource.includes("qc:bom-workbench-review-ui"), "package.json");
}

async function seedReviewedBom(engineerCookie, managerCookie) {
  const childA = await createSubmission(engineerCookie, {
    drawingNumber: `BOMREV-${token}-A`,
    partNumber: `P-BOMREV-${token}-A`,
    partName: "QC BOM review child A",
    revision: "1",
    documentType: "Part"
  });
  const childB = await createSubmission(engineerCookie, {
    drawingNumber: `BOMREV-${token}-B`,
    partNumber: `P-BOMREV-${token}-B`,
    partName: "QC BOM review child B",
    revision: "1",
    documentType: "Part"
  });
  markReleased(childA.submissionId, childB.submissionId);

  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMREV-${token}-ASM`,
    partNumber: `P-BOMREV-${token}-ASM`,
    partName: "QC BOM review assembly",
    revision: "1",
    documentType: "Assembly",
    references: [
      {
        sourceFilename: `BOMREV-${token}-ASM.sldasm`,
        sourceFileRole: "sldasm",
        referencedFilename: `${childA.drawingNumber}.sldprt`,
        referencedPartNumber: childA.partNumber,
        referencedDrawingNumber: childA.drawingNumber,
        referencedRevision: childA.revision,
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc-bom-workbench-review-ui",
        confidence: "high"
      }
    ]
  });

  const firstDraft = (await requestJson(engineerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "QC baseline released", setActive: true })
  })).body.draft;
  const firstReview = (await requestJson(engineerCookie, `/api/bom/drafts/${firstDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "QC baseline release" })
  })).body.review;
  await requestJson(managerCookie, `/api/bom/reviews/${firstReview.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC baseline approved" })
  });

  const secondDraft = (await requestJson(engineerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "QC diff review target", setActive: true })
  })).body.draft;
  const groupId = crypto.randomUUID();
  const childAId = secondDraft.lines[0].id;
  await requestJson(engineerCookie, `/api/bom/drafts/${secondDraft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: "QC create diff for manager page",
      lines: [
        { id: groupId, parentLineId: null, nodeType: "group", groupName: "QC 更新群組", sequenceNo: 1 },
        { id: childAId, parentLineId: groupId, nodeType: "item", partNumber: childA.partNumber, revision: "1", quantity: 2, sequenceNo: 1 },
        { id: crypto.randomUUID(), parentLineId: null, nodeType: "item", partNumber: childB.partNumber, revision: "1", quantity: 3, sequenceNo: 2 }
      ]
    })
  });
  const secondReview = (await requestJson(engineerCookie, `/api/bom/drafts/${secondDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "QC manager diff review target" })
  })).body.review;

  const diff = (await requestJson(managerCookie, `/api/bom/drafts/${secondDraft.id}/diff`)).body.diff;
  record("Draft diff API returns base snapshot", Boolean(diff.base_snapshot?.id), JSON.stringify(diff.base_snapshot));
  record("Draft diff API detects added lines", diff.summary.added_count >= 2, JSON.stringify(diff.summary));
  record("Draft diff API detects changed line", diff.summary.changed_count >= 1, JSON.stringify(diff.summary));
  const changedChild = diff.changes.find((change) => change.label.includes(childA.partNumber));
  record(
    "Draft diff API detects quantity and hierarchy change",
    Boolean(changedChild?.changed_fields.includes("quantity") && changedChild?.changed_fields.includes("hierarchy")),
    JSON.stringify(changedChild)
  );

  const pending = (await requestJson(managerCookie, "/api/bom/reviews/pending")).body.reviews;
  record("Pending review API includes seeded review", pending.some((review) => review.id === secondReview.id), `${pending.length} pending`);

  return { parent, childA, childB, reviewId: secondReview.id };
}

async function verifyReviewPage(browser, seed, managerCookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    const location = message.location();
    if (message.type() === "error" && !location.url.endsWith("/favicon.ico")) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name: managerCookie.name, value: managerCookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);

  await page.goto(`${apiBaseUrl}/bom/reviews`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "BOM 審核" }).waitFor({ timeout: 15_000 });
  record("Review page renders", await page.getByRole("heading", { name: "BOM 審核" }).isVisible());
  await page.locator(".bom-review-card", { hasText: seed.parent.partNumber }).first().click();
  record("Review card shows seeded parent", await page.locator(".bom-review-card", { hasText: seed.parent.partNumber }).first().isVisible());
  record("Diff table shows added child", await page.locator(".bom-review-diff-table", { hasText: seed.childB.partNumber }).isVisible());
  record("Diff table shows quantity field", await page.locator(".bom-review-diff-table", { hasText: "數量" }).isVisible());
  record("Diff table shows hierarchy field", await page.locator(".bom-review-diff-table", { hasText: "階層" }).isVisible());
  record("Diff table shows previous released baseline", await page.getByText(/Released 1|上一份 Released BOM/).first().isVisible());

  await page.getByLabel("主管意見").fill("QC manager reviewed diff and approved");
  await page.getByRole("button", { name: "核准發布" }).click();
  await page.getByText("BOM 已核准發布").waitFor({ timeout: 15_000 });
  record("Manager can approve from review page", await page.getByText("BOM 已核准發布").isVisible());
  await page.getByRole("link", { name: "匯出 XLSX" }).waitFor({ timeout: 15_000 });
  await page.getByRole("link", { name: "匯出 CSV" }).waitFor({ timeout: 15_000 });
  const xlsxHref = await page.getByRole("link", { name: "匯出 XLSX" }).getAttribute("href");
  const csvHref = await page.getByRole("link", { name: "匯出 CSV" }).getAttribute("href");
  const xlsxResponse = await page.request.get(new URL(xlsxHref, apiBaseUrl).toString());
  const csvResponse = await page.request.get(new URL(csvHref, apiBaseUrl).toString());
  record("Review page XLSX export link downloads", xlsxResponse.ok() && xlsxResponse.headers()["content-type"]?.includes("spreadsheetml"), `HTTP ${xlsxResponse.status()}`);
  record("Review page CSV export link downloads", csvResponse.ok() && csvResponse.headers()["content-type"]?.includes("text/csv"), `HTTP ${csvResponse.status()}`);

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Review page desktop has no horizontal overflow", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("Review page desktop has no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

async function verifyMobileReviewPage(browser, seed, managerCookie) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 }, isMobile: true });
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name: managerCookie.name, value: managerCookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.goto(`${apiBaseUrl}/bom/reviews`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "BOM 審核" }).waitFor({ timeout: 15_000 });
  record("Review page mobile renders", await page.getByRole("heading", { name: "BOM 審核" }).isVisible());
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Review page mobile has no page-level horizontal overflow", bodyOverflow <= 2, `${bodyOverflow}px`);
  await context.close();
}

async function run() {
  staticChecks();
  const engineerCookie = await apiLogin("engineer@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const seed = await seedReviewedBom(engineerCookie, managerCookie);
  const browser = await launchBrowser();
  try {
    await verifyReviewPage(browser, seed, managerCookie);
    await verifyMobileReviewPage(browser, seed, managerCookie);
  } finally {
    await browser.close();
  }
}

run()
  .then(() => {
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          total: results.length,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length,
          results
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          total: results.length,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length || 1,
          results,
          error: error.message
        },
        null,
        2
      )
    );
    process.exit(1);
  });
