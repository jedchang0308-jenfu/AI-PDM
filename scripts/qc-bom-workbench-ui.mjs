#!/usr/bin/env node

import { chromium } from "playwright";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3130";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const token = Date.now().toString().slice(-7);
const results = [];
const read = (relativePath) => readProjectFile(root, relativePath);

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

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision ?? "1");
  form.set("material", "QC-Material");
  form.set("surface_finish", "QC-Finish");
  form.set("document_type", input.documentType ?? "Assembly");
  form.set("change_description", "QC seed for BOM visual workbench UI");
  if (input.references) form.set("cad_references_json", JSON.stringify(input.references));
  form.append("files", new File([Buffer.from("bom visual workbench ui qc")], `${input.drawingNumber}.pdf`, { type: "application/pdf" }));

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

  record("Sidebar links BOM Workbench", sidebarSource.includes("/bom/workbench"), "sidebar-nav.tsx");
  record(
    "Workbench uses visual canvas and detail drawer",
    pageSource.includes("bom-flow-canvas") && pageSource.includes("ReactFlow") && pageSource.includes("PdmDetailDrawer"),
    "page.tsx"
  );
  record(
    "Workbench supports graph drag/drop editing",
    pageSource.includes("handleFlowDrop") && pageSource.includes("handleFlowNodeDragStop") && pageSource.includes("moveLineToParent"),
    "page.tsx"
  );
  record("Workbench supports Undo Redo", pageSource.includes("Undo2") && pageSource.includes("Redo2") && pageSource.includes("beforeunload"), "page.tsx");
  record(
    "Workbench calls BOM APIs",
    ["/api/bom/workbench", "/api/bom/drafts/from-assembly", "/api/bom/drafts/import-xls", "/api/bom/drafts/${selectedDraft.id}/active"].every((needle) =>
      pageSource.includes(needle)
    ),
    "page.tsx"
  );
  record("Workbench supports clone compare review", pageSource.includes("cloneDraft") && pageSource.includes("buildCompareRows") && pageSource.includes("submit-review"), "page.tsx");
  record("Package exposes QC script", packageSource.includes("qc:bom-workbench-ui"), "package.json");
}

async function dragNodeTo(page, sourceLocator, targetLocator) {
  const source = await sourceLocator.boundingBox();
  const target = await targetLocator.boundingBox();
  record("Drag endpoints are measurable", Boolean(source && target), JSON.stringify({ source, target }));
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 18 });
  await page.mouse.up();
}

async function verifyDesktop(browser, parent, childB, cookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const consoleErrors = [];
  context.on("page", (page) => {
    page.on("console", (message) => {
      const location = message.location();
      if (message.type() === "error" && !location.url.endsWith("/favicon.ico")) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
  });
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name: cookie.name, value: cookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();

  await page.goto(`${apiBaseUrl}/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`, { waitUntil: "networkidle" });
  await page.locator(".bom-workbench-page").waitFor({ timeout: 15_000 });
  record("Workbench page renders", await page.locator(".bom-workbench-page").isVisible());
  record("Sidebar BOM Workbench link renders", await page.locator('a[href="/bom/workbench"]').isVisible());
  record("Workbench parent renders", await page.locator(".bom-tree-panel", { hasText: parent.partNumber }).isVisible());

  await page.getByRole("button", { name: "CAD Draft" }).click();
  const cadChildNode = page.locator(".bom-flow-canvas .bom-flow-node.line", { hasText: `P-BOMUI-${token}-A` }).first();
  await cadChildNode.waitFor({ timeout: 15_000 });
  record("CAD Draft line renders as graph node", await cadChildNode.isVisible());
  record("Graph edges render", (await page.locator(".bom-flow-canvas .react-flow__edge").count()) >= 1);

  await page.locator(".bom-library-panel input").fill(childB.partNumber);
  await page.locator(".bom-inline-actions .primary-button").click();
  const searchResult = page.locator(".bom-search-result", { hasText: childB.partNumber }).first();
  await searchResult.waitFor({ timeout: 15_000 });
  record("Search result exposes drag handle", await searchResult.locator(".bom-search-drag-handle").isVisible());
  const dataTransfer = await page.evaluateHandle((submissionId) => {
    const transfer = new DataTransfer();
    transfer.effectAllowed = "copy";
    transfer.setData("application/x-pdm-submission-id", submissionId);
    transfer.setData("text/plain", submissionId);
    return transfer;
  }, childB.submissionId);
  await page.locator(".bom-flow-canvas").dispatchEvent("dragover", { dataTransfer });
  await page.locator(".bom-flow-canvas").dispatchEvent("drop", { dataTransfer });
  const childNode = page.locator(".bom-flow-canvas .bom-flow-node.line", { hasText: childB.partNumber }).first();
  await childNode.waitFor({ timeout: 15_000 });
  record("Search result drag payload can be dropped into BOM graph", await childNode.isVisible());

  await childNode.click({ force: true });
  await page.locator(".bom-node-detail-drawer").waitFor({ timeout: 15_000 });
  record("Node click opens detail drawer", await page.locator(".bom-node-detail-drawer", { hasText: childB.partNumber }).isVisible());
  await page.locator(".bom-node-detail-drawer input[type='number']").fill("3");
  await page.locator(".bom-flow-canvas .bom-flow-node", { hasText: "Qty 3" }).waitFor({ timeout: 15_000 });
  record("Line quantity can be edited from drawer", await page.locator(".bom-flow-canvas .bom-flow-node", { hasText: "Qty 3" }).isVisible());
  await page.locator(".pdm-detail-drawer-floating-close").click();
  await page.locator(".bom-node-detail-drawer").waitFor({ state: "hidden", timeout: 15_000 });

  await page.locator(".bom-tree-toolbar button").nth(3).click();
  const groupNode = page.locator(".bom-flow-canvas .bom-flow-node.group", { hasText: "新群組" }).first();
  await groupNode.waitFor({ timeout: 15_000 });
  record("Virtual group can be added to graph", await groupNode.isVisible());

  await page.getByRole("button", { name: "Undo" }).click();
  record("Undo removes session edit", (await page.locator(".bom-flow-canvas .bom-flow-node.group").count()) === 0);
  await page.getByRole("button", { name: "Redo" }).click();
  await groupNode.waitFor({ timeout: 15_000 });
  record("Redo restores session edit", await groupNode.isVisible());

  await dragNodeTo(page, childNode, groupNode);
  const nestedChildNode = page.locator(".bom-flow-canvas .bom-flow-node.line", { hasText: childB.partNumber }).filter({ hasText: "Level 2" }).first();
  await nestedChildNode.waitFor({ timeout: 15_000 });
  record("Graph drag can change parent relation", await nestedChildNode.isVisible());

  const saveResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/bom/drafts/") && response.request().method() === "PATCH" && response.ok()
  );
  await page.locator(".bom-tree-toolbar button").first().click();
  const saveResponse = await saveResponsePromise;
  const savedBody = await saveResponse.json();
  const savedLines = savedBody.draft?.lines ?? [];
  const savedGroup = savedLines.find((line) => line.node_type === "group" && line.group_name === "新群組");
  const savedChildB = savedLines.find((line) => line.part_number === childB.partNumber);
  record("Draft save succeeds from UI", Boolean(savedBody.draft?.id), JSON.stringify(savedBody));
  record("Saved draft preserves edited quantity", savedChildB?.quantity === 3, JSON.stringify(savedChildB));
  record("Saved draft preserves graph hierarchy", Boolean(savedGroup?.id && savedChildB?.parent_line_id === savedGroup.id), JSON.stringify({ savedGroup, savedChildB }));

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
  await page.locator(".bom-workbench-page").waitFor({ timeout: 15_000 });
  record("Mobile workbench renders", await page.locator(".bom-workbench-page").isVisible());
  record("Mobile graph canvas renders", await page.locator(".bom-flow-canvas").isVisible());
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
    revision: "1",
    documentType: "Part"
  });
  const childB = await createSubmission(engineerCookie, {
    drawingNumber: `BOMUI-${token}-B`,
    partNumber: `P-BOMUI-${token}-B`,
    partName: "QC BOM UI child B",
    revision: "1",
    documentType: "Part"
  });
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMUI-${token}-ASM`,
    partNumber: `P-BOMUI-${token}-ASM`,
    partName: "QC BOM UI assembly",
    revision: "1",
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

  const browser = await launchBrowser();
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
