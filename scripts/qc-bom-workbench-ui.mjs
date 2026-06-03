#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3130";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const token = Date.now().toString().slice(-7);
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision ?? "A");
  form.set("material", "QC-Material");
  form.set("surface_finish", "QC-Finish");
  form.set("document_type", input.documentType ?? "Assembly");
  form.set("change_description", "QC seed for BOM workbench UI");
  if (input.references) form.set("cad_references_json", JSON.stringify(input.references));
  form.append("files", new File([Buffer.from("bom workbench ui qc")], `${input.drawingNumber}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`Create ${input.partNumber}`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  return { submissionId: body.submissionId, ...input };
}

function staticChecks() {
  const pageSource = read("src/app/bom/workbench/page.tsx");
  const sidebarSource = read("src/components/sidebar-nav.tsx");
  const packageSource = read("package.json");

  record("Sidebar links BOM Workbench", sidebarSource.includes("/bom/workbench") && sidebarSource.includes("BOM 工作台"), "sidebar-nav.tsx");
  record("Workbench page uses three panel layout", pageSource.includes("bom-library-panel") && pageSource.includes("bom-tree-panel") && pageSource.includes("bom-properties-panel"), "page.tsx");
  record("Workbench supports drag/drop", pageSource.includes("draggable") && pageSource.includes("onDrop") && pageSource.includes("handleTreeDrop"), "page.tsx");
  record("Workbench supports Undo Redo", pageSource.includes("Undo2") && pageSource.includes("Redo2") && pageSource.includes("beforeunload"), "page.tsx");
  record("Workbench calls BOM APIs", ["/api/bom/workbench", "/api/bom/drafts/from-assembly", "/api/bom/drafts/import-xls", "/api/bom/drafts/${selectedDraft.id}/active"].every((needle) => pageSource.includes(needle)), "page.tsx");
  record("Workbench supports clone compare review", pageSource.includes("cloneDraft") && pageSource.includes("buildCompareRows") && pageSource.includes("submit-review"), "page.tsx");
  record("Package exposes QC script", packageSource.includes("qc:bom-workbench-ui"), "package.json");
}

async function verifyDesktop(browser, parent, childB, cookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const consoleErrors = [];
  context.on("page", (page) => {
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
  });
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name: cookie.name, value: cookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();

  await page.goto(`${apiBaseUrl}/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "BOM 工作台" }).waitFor({ timeout: 15_000 });
  record("Workbench page renders", await page.getByRole("heading", { name: "BOM 工作台" }).isVisible());
  record("Sidebar BOM Workbench link renders", await page.locator('a[href="/bom/workbench"]').isVisible());
  record("Workbench parent renders", await page.locator(".bom-tree-panel", { hasText: parent.partNumber }).isVisible());

  await page.getByRole("button", { name: "CAD Draft" }).click();
  await page.locator(".bom-tree-list", { hasText: `P-BOMUI-${token}-A` }).waitFor({ timeout: 15_000 });
  record("CAD Draft line renders in tree", await page.locator(".bom-tree-list", { hasText: `P-BOMUI-${token}-A` }).isVisible());

  await page.getByRole("textbox", { name: "搜尋" }).fill(childB.partNumber);
  await page.getByRole("button", { name: "搜尋" }).click();
  await page.locator(".bom-search-result", { hasText: childB.partNumber }).first().waitFor({ timeout: 15_000 });
  await page.locator(".bom-search-result", { hasText: childB.partNumber }).first().dragTo(page.locator(".bom-tree-list"));
  await page.locator(".bom-tree-list", { hasText: childB.partNumber }).waitFor({ timeout: 15_000 });
  record("Search result can be dragged into BOM tree", await page.locator(".bom-tree-list", { hasText: childB.partNumber }).isVisible());
  await page.locator(".bom-tree-row", { hasText: childB.partNumber }).first().click();
  await page.getByRole("spinbutton", { name: "數量" }).fill("3");
  await page.locator(".bom-tree-list", { hasText: "Qty 3" }).waitFor({ timeout: 15_000 });
  record("Line quantity can be edited", await page.locator(".bom-tree-list", { hasText: "Qty 3" }).isVisible());

  await page.getByRole("button", { name: "新增群組" }).click();
  await page.locator(".bom-tree-list", { hasText: "新群組" }).waitFor({ timeout: 15_000 });
  record("Virtual group can be added", await page.locator(".bom-tree-list", { hasText: "新群組" }).isVisible());
  await page.getByRole("button", { name: "Undo" }).click();
  record("Undo removes session edit", (await page.locator(".bom-tree-list", { hasText: "新群組" }).count()) === 0);
  await page.getByRole("button", { name: "Redo" }).click();
  await page.locator(".bom-tree-list", { hasText: "新群組" }).waitFor({ timeout: 15_000 });
  record("Redo restores session edit", await page.locator(".bom-tree-list", { hasText: "新群組" }).isVisible());
  await page.locator(".bom-tree-row", { hasText: "新群組" }).first().getByRole("button", { name: "上移", exact: true }).click();
  await page.locator(".bom-tree-row", { hasText: childB.partNumber }).first().getByRole("button", { name: "縮排", exact: true }).click();
  record("Tree row order and hierarchy controls can be used", await page.getByText("未儲存").isVisible());
  record("Unsaved marker renders", await page.getByText("未儲存").isVisible());

  const saveResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/bom/drafts/") && response.request().method() === "PATCH" && response.ok()
  );
  await page.getByRole("button", { name: "儲存" }).click();
  const saveResponse = await saveResponsePromise;
  const savedBody = await saveResponse.json();
  const savedLines = savedBody.draft?.lines ?? [];
  const savedGroup = savedLines.find((line) => line.node_type === "group" && line.group_name === "新群組");
  const savedChildB = savedLines.find((line) => line.part_number === childB.partNumber);
  await page.getByText("BOM Draft 已儲存").waitFor({ timeout: 15_000 });
  record("Draft save succeeds from UI", await page.getByText("已同步").isVisible());
  record("Saved draft preserves edited quantity", savedChildB?.quantity === 3, JSON.stringify(savedChildB));
  record("Saved draft preserves edited hierarchy", Boolean(savedGroup?.id && savedChildB?.parent_line_id === savedGroup.id), JSON.stringify({ savedGroup, savedChildB }));

  await page.getByRole("button", { name: "複製" }).click();
  await page.getByText("Draft 已複製").waitFor({ timeout: 20_000 });
  record("Draft clone succeeds from UI", await page.getByText("Draft 已複製").isVisible());
  await page.getByRole("button", { name: "設為 Active" }).click();
  await page.getByText("已設為 Active Draft").waitFor({ timeout: 15_000 });
  record("Set Active Draft succeeds from UI", await page.getByText("已設為 Active Draft").isVisible());

  const compareOptions = await page.locator('.bom-compare-box select option[value]:not([value=""])').count();
  record("Compare draft options render", compareOptions >= 1, `${compareOptions} options`);
  const compareValue = await page.locator('.bom-compare-box select option[value]:not([value=""])').first().getAttribute("value");
  if (compareValue) {
    await page.locator(".bom-compare-box select").selectOption(compareValue);
    await page.locator(".bom-compare-box").getByText(/沒有差異|Qty|Group/).first().waitFor({ timeout: 15_000 });
    record("Compare draft panel updates", await page.locator(".bom-compare-box").getByText(/沒有差異|Qty|Group/).first().isVisible());
  }

  await page.getByLabel("送審原因").fill("QC BOM workbench UI submit review");
  await page.getByRole("button", { name: "送主管審核" }).click();
  await page.getByText("已送出研發主管審核").waitFor({ timeout: 15_000 });
  record("Submit review succeeds from UI", await page.getByText("已送出研發主管審核").isVisible());

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Desktop has no page-level horizontal overflow", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("Desktop has no console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

async function verifyMobile(browser, parent, cookie) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 }, isMobile: true });
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name: cookie.name, value: cookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.goto(`${apiBaseUrl}/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "BOM 工作台" }).waitFor({ timeout: 15_000 });
  record("Mobile workbench renders", await page.getByRole("heading", { name: "BOM 工作台" }).isVisible());
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Mobile has no page-level horizontal overflow", bodyOverflow <= 2, `${bodyOverflow}px`);
  await context.close();
}

async function run() {
  staticChecks();
  const engineerCookie = await apiLogin("engineer@example.com");
  const childA = await createSubmission(engineerCookie, {
    drawingNumber: `BOMUI-${token}-A`,
    partNumber: `P-BOMUI-${token}-A`,
    partName: "QC BOM UI child A",
    revision: "A",
    documentType: "Part"
  });
  const childB = await createSubmission(engineerCookie, {
    drawingNumber: `BOMUI-${token}-B`,
    partNumber: `P-BOMUI-${token}-B`,
    partName: "QC BOM UI child B",
    revision: "A",
    documentType: "Part"
  });
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMUI-${token}-ASM`,
    partNumber: `P-BOMUI-${token}-ASM`,
    partName: "QC BOM UI assembly",
    revision: "A",
    documentType: "Assembly",
    references: [
      {
        sourceFilename: `BOMUI-${token}-ASM.sldasm`,
        sourceFileRole: "sldasm",
        referencedFilename: `${childA.drawingNumber}.sldprt`,
        referencedPartNumber: childA.partNumber,
        referencedDrawingNumber: childA.drawingNumber,
        referencedRevision: childA.revision,
        referenceType: "assembly_component",
        quantity: 2,
        extractionMethod: "qc-bom-workbench-ui",
        confidence: "high"
      }
    ]
  });

  const browser = await chromium.launch({ headless: true });
  try {
    await verifyDesktop(browser, parent, childB, engineerCookie);
    await verifyMobile(browser, parent, engineerCookie);
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
