#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-drawing-part-relation-view" });
const unique = Date.now().toString().slice(-8);
const rootCode = `QCR${unique}`;
const rootId = `qc-relation-root-${unique}`;
const secondaryRootCode = `QCS${unique}`;
const secondaryRootId = `qc-relation-root-secondary-${unique}`;
const drawingM01 = `${rootCode}-M01`;
const drawingM02 = `${rootCode}-M02`;
const drawingR01 = `${rootCode}-R01`;
const partP01 = `${rootCode}-P01`;
const partP02 = `${rootCode}-P02`;
const partP03 = `${rootCode}-P03`;
const partP04 = `${rootCode}-P04`;
const outputRoot = path.resolve(root, "output", "playwright", "pdm-drawing-part-relation-view");
const outputDir = path.resolve(process.env.PDM_QC_OUTPUT_DIR ?? outputRoot);
if (!(outputDir === outputRoot || outputDir.startsWith(`${outputRoot}${path.sep}`))) {
  throw new Error(`Relation view QC output must stay inside ${outputRoot}`);
}
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function cleanupRelationData() {
  const db = new Database(dbPath);
  try {
    for (const code of [rootCode, secondaryRootCode]) {
      const existingRoot = db.prepare("SELECT id FROM part_roots WHERE root_code = ?").get(code);
      if (!existingRoot) continue;
      const drawingIds = db.prepare("SELECT id FROM drawing_numbers WHERE part_root_id = ?").all(existingRoot.id).map((row) => row.id);
      const partIds = db.prepare("SELECT id FROM part_numbers WHERE part_root_id = ?").all(existingRoot.id).map((row) => row.id);
      for (const drawingId of drawingIds) db.prepare("DELETE FROM same_drawing_variants WHERE drawing_number_id = ?").run(drawingId);
      for (const partId of partIds) db.prepare("DELETE FROM same_drawing_variants WHERE part_number_id = ?").run(partId);
      for (const drawingId of drawingIds) db.prepare("DELETE FROM drawing_part_links WHERE drawing_number_id = ?").run(drawingId);
      for (const partId of partIds) db.prepare("DELETE FROM drawing_part_links WHERE part_number_id = ?").run(partId);
      db.prepare("DELETE FROM warning_events WHERE entity_id = ?").run(existingRoot.id);
      db.prepare("DELETE FROM drawing_numbers WHERE part_root_id = ?").run(existingRoot.id);
      db.prepare("DELETE FROM part_numbers WHERE part_root_id = ?").run(existingRoot.id);
      db.prepare("DELETE FROM part_roots WHERE id = ?").run(existingRoot.id);
    }
  } finally {
    db.close();
  }
}

function seedRelationData() {
  cleanupRelationData();
  const db = new Database(dbPath);
  const now = new Date().toISOString();
  try {
    db.prepare(
      `
      INSERT INTO part_roots (
        id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, 'QC 關係視圖總成', 'manufactured', 'Active', 'numbering-rule-v2', 'user-engineer-demo', ?, ?)
    `
    ).run(rootId, rootCode, now, now);
    db.prepare(
      `
      INSERT INTO part_roots (
        id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Active', 'numbering-rule-v2', 'user-engineer-demo', ?, ?)
    `
    ).run(secondaryRootId, secondaryRootCode, `QC ${rootCode} 空白關係圖料根號`, now, now);
    for (const [index, partNumber, partName] of [
      [1, partP01, "QC 關係主料"],
      [2, partP02, "QC 多料一圖 A"],
      [3, partP03, "QC 多料一圖 B"],
      [4, partP04, "QC 待補製造圖料"]
    ]) {
      db.prepare(
        `
        INSERT INTO part_numbers (
          id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
          item_kind, is_universal, record_status, rule_version_id, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 0, 'Active', 'numbering-rule-v2', ?, ?)
      `
      ).run(`qc-relation-part-${index}-${unique}`, rootId, partNumber, index, `P${String(index).padStart(2, "0")}`, partName, now, now);
    }
    for (const [idSuffix, drawingNumber, purposeCode, purposeDescription, sequenceNo] of [
      ["m01", drawingM01, "M", "QC 製造圖", 1],
      ["m02", drawingM02, "M", "QC 未關聯製造圖", 2],
      ["r01", drawingR01, "R", "QC 參考圖", 1]
    ]) {
      db.prepare(
        `
        INSERT INTO drawing_numbers (
          id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
          is_primary_manufacturing, record_status, rule_version_id, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, ?, 'Active', 'numbering-rule-v2', ?, ?)
      `
      ).run(`qc-relation-drawing-${idSuffix}-${unique}`, rootId, drawingNumber, purposeCode, purposeDescription, sequenceNo, purposeCode === "M" ? 1 : 0, now, now);
    }
    for (const [idSuffix, drawingId, partId, linkType] of [
      ["m01-p01", `qc-relation-drawing-m01-${unique}`, `qc-relation-part-1-${unique}`, "primary_manufacturing"],
      ["m01-p02", `qc-relation-drawing-m01-${unique}`, `qc-relation-part-2-${unique}`, "primary_manufacturing"],
      ["m01-p03", `qc-relation-drawing-m01-${unique}`, `qc-relation-part-3-${unique}`, "primary_manufacturing"],
      ["r01-p01", `qc-relation-drawing-r01-${unique}`, `qc-relation-part-1-${unique}`, "reference"]
    ]) {
      db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at) VALUES (?, ?, ?, ?, 'user-engineer-demo', ?)").run(
        `qc-relation-link-${idSuffix}-${unique}`,
        drawingId,
        partId,
        linkType,
        now
      );
    }
    db.prepare("INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, 'user-engineer-demo', 'numbering.create', ?, ?)").run(
      `qc-relation-audit-${unique}`,
      JSON.stringify({ rootCode, drawingNumber: drawingM01, partNumber: partP01 }),
      now
    );
  } finally {
    db.close();
  }
}

function staticChecks() {
  const pageSource = read("src/app/numbering/search/page.tsx");
  const routeSource = read("src/app/api/numbering/relations/route.ts");
  const repositorySource = read("src/lib/repositories/numbering-async-repository.ts");
  const cssSource = read("src/app/globals.css");
  const packageSource = read("package.json");

  record("Relation page fetches grouped endpoint", pageSource.includes("/api/numbering/relations"), "src/app/numbering/search/page.tsx");
  record("Relation page has tree and matrix modes", pageSource.includes("關係樹") && pageSource.includes("矩陣") && pageSource.includes("RelationMatrixView"));
  record("Relation result omits redundant tree/matrix title row", !pageSource.includes("圖料關係樹") && !pageSource.includes("圖料關係矩陣"));
  record("Relation page renders root groups instead of flat identity table", pageSource.includes("RelationRootGroup") && !pageSource.includes("function SearchResultsTable"));
  record("Relation matrix maps every root through the shared root header", pageSource.includes("roots.map((root, index)") && pageSource.includes("<RelationRootHeader root={root}"));
  record("Relation matrix uses a diagonal drawing/part axis header", pageSource.includes("pdm-relation-axis-header") && cssSource.includes("linear-gradient(to top right"));
  record("Relation matrix sizes to fixed content-based columns", cssSource.includes("width: fit-content") && cssSource.includes("width: max-content") && cssSource.includes("min-width: 160px"));
  record(
    "Relation tree uses one explicit per-link role without repeated summary blocks",
    pageSource.includes("const role = relationCellLabel(relationType)") &&
      pageSource.includes("<strong>{role}</strong>") &&
      !pageSource.includes("relationGroupLabel") &&
      !pageSource.includes("summarizeRelationBlockers"),
    "src/app/numbering/search/page.tsx"
  );
  record("Relation page exposes controlled maintenance panel", pageSource.includes("RelationMaintenancePanel") && pageSource.includes("onRelationChange"));
  record("Relation detail drawer preserves clicked entity context", pageSource.includes("DetailTarget") && pageSource.includes("圖號明細") && pageSource.includes("料號明細") && pageSource.includes("data-detail-target"));
  record("Relation route read is search permission gated", routeSource.includes('requireNumberingPageAsync(request, "numbering.search")'));
  record("Relation route write is action permission gated", routeSource.includes('requireNumberingActionAsync(request, "numbering.link_variant")'));
  record("Relation route classifies manufacturing/reference/ambiguous server-side", routeSource.includes("isManufacturingDrawingPurpose") && routeSource.includes("reference_only") && routeSource.includes("ambiguous_primary"));
  record("Relation matrix uses compact non-misleading empty states", routeSource.includes("pending") && routeSource.includes("not_applicable") && pageSource.includes("待判定") && pageSource.includes("不適用"));
  record("Relation repository writes relation audit", repositorySource.includes("numbering.drawing_part.relation_maintain") && repositorySource.includes("before") && repositorySource.includes("after"));
  record("Relation repository protects locked statuses", repositorySource.includes("RELATION_MAINTENANCE_RECORD_LOCKED") && repositorySource.includes("Released") && repositorySource.includes("Obsolete"));
  record("Relation CSS defines tree/matrix containers", cssSource.includes(".pdm-relation-root") && cssSource.includes(".pdm-relation-matrix-wrap"));
  record("Relation CSS defines compact part grouping", cssSource.includes(".pdm-relation-part-group") && cssSource.includes(".pdm-relation-part-chip.has-role"), "src/app/globals.css");
  record(
    "Pending review reuses the formal relation-tree structure",
    pageSource.includes("<RelationReviewRoot")
      && pageSource.includes("<RelationReviewDrawingNode")
      && pageSource.includes("<RelationReviewOrphanParts")
      && pageSource.includes("pdm-relation-review-list")
      && !pageSource.includes("pdm-relation-change-list")
      && routeSource.includes("drawings:")
      && routeSource.includes("parts:")
  );
  record("Pending review defaults to collapsed details", pageSource.includes('<details className="pdm-relation-change-details">') && pageSource.includes("<summary>變更審查中"));
  record(
    "Pending review separates candidate availability from formal availability",
    routeSource.includes("reviewAvailabilityLabel")
      && routeSource.includes("不可供生產使用")
      && pageSource.includes("pdm-relation-review-availability")
      && !pageSource.includes("drawing.availabilityLabel")
  );
  record("Relation matrix horizontal scroll is contained", cssSource.includes(".pdm-relation-matrix-wrap") && cssSource.includes("overflow: auto"));
  record("Package exposes relation QC script", packageSource.includes('"qc:pdm-drawing-part-relation-view"'));
}

async function loginAsAdmin(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("Admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Admin login returns session cookie", Boolean(name && valueParts.length > 0), cookie ? "cookie received" : "missing cookie");
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  return `${name}=${valueParts.join("=")}`;
}

async function verifyRelationApi(sessionCookie) {
  const db = new Database(dbPath);
  const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM drawing_part_links WHERE drawing_number_id LIKE ? OR part_number_id LIKE ?").get(`%${unique}`, `%${unique}`).count;
  db.close();

  const response = await fetch(`${apiBaseUrl}/api/numbering/relations?query=${encodeURIComponent(rootCode)}`, {
    headers: { cookie: sessionCookie }
  });
  record("Relation API returns 200", response.ok, `HTTP ${response.status}`);
  const body = await response.json();
  const relationRoot = body.roots?.find((root) => root.rootCode === rootCode);
  record("Relation API returns both grouped roots", body.roots?.length === 2 && body.roots.some((root) => root.rootCode === secondaryRootCode), JSON.stringify(body.summary));
  record("Relation API includes all drawings and parts", relationRoot.drawings.length === 3 && relationRoot.parts.length === 4, JSON.stringify({ drawings: relationRoot.drawings.length, parts: relationRoot.parts.length }));
  record("Relation API marks reference relationships", relationRoot.matrix.some((cell) => cell.drawingNumber === drawingR01 && cell.partNumber === partP01 && cell.relationType === "reference"));
  record("Relation API marks selectable manufacturing candidates as pending", relationRoot.matrix.some((cell) => cell.drawingNumber === drawingM02 && cell.partNumber === partP04 && cell.relationType === "pending"));
  record("Relation API marks non-required empty cells as not applicable", relationRoot.matrix.some((cell) => cell.drawingNumber === drawingM02 && cell.partNumber === partP01 && cell.relationType === "not_applicable"));
  record("Relation API marks missing manufacturing coverage", relationRoot.blockers.some((blocker) => blocker.code === "part_without_manufacturing_drawing"), JSON.stringify(relationRoot.blockers));

  const afterDb = new Database(dbPath);
  const afterCount = afterDb.prepare("SELECT COUNT(*) AS count FROM drawing_part_links WHERE drawing_number_id LIKE ? OR part_number_id LIKE ?").get(`%${unique}`, `%${unique}`).count;
  afterDb.close();
  record("Relation API read has no write side effect", Number(beforeCount) === Number(afterCount), JSON.stringify({ beforeCount, afterCount }));
}

async function closeRelationDetailDrawer(page) {
  const drawer = page.getByRole("complementary", { name: "圖料明細" });
  await page.getByRole("button", { name: "關閉圖料明細", exact: true }).click();
  await drawer.waitFor({ state: "detached", timeout: 10_000 });
}

async function verifyViewport(browser, viewport, screenshotName) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600 });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const sessionCookie = await loginAsAdmin(context);
  if (viewport.width === 1440) await verifyRelationApi(sessionCookie);

  await page.goto(`${apiBaseUrl}/numbering/search`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "圖料工作台" }).waitFor({ timeout: 10_000 });
  await page.getByLabel("關鍵字").fill(rootCode);
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await page.getByRole("button", { name: rootCode, exact: true }).waitFor({ timeout: 10_000 });
  record(`Tree lists every matching root at ${viewport.width}px`, (await page.locator(".pdm-relation-root").count()) === 2 && (await page.getByRole("button", { name: secondaryRootCode, exact: true }).count()) === 1);
  record(`Tree omits redundant result title at ${viewport.width}px`, (await page.getByRole("heading", { name: "圖料關係樹", exact: true }).count()) === 0);
  record(`Manufacturing drawing renders linked parts at ${viewport.width}px`, await page.locator(".pdm-relation-node", { hasText: drawingM01 }).locator(`text=${partP03}`).isVisible());
  record(`Reference drawing renders reference relation at ${viewport.width}px`, await page.locator(".pdm-relation-node", { hasText: drawingR01 }).locator("text=參考").first().isVisible());
  record(`Missing manufacturing state is visible at ${viewport.width}px`, await page.locator(".pdm-relation-orphan", { hasText: partP04 }).isVisible());

  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Relation tree avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);

  await page.getByRole("tab", { name: "矩陣" }).click();
  await page.locator(".pdm-relation-matrix", { hasText: partP01 }).waitFor({ timeout: 10_000 });
  record(`Matrix lists the same roots as tree at ${viewport.width}px`, (await page.locator(".pdm-relation-root").count()) === 2 && (await page.getByRole("button", { name: secondaryRootCode, exact: true }).count()) === 1);
  record(`Matrix omits redundant result title at ${viewport.width}px`, (await page.getByRole("heading", { name: "圖料關係矩陣", exact: true }).count()) === 0);
  const axisLayout = await page.locator(".pdm-relation-axis-header").first().evaluate((header) => {
    const drawing = header.querySelector(".pdm-relation-axis-drawing")?.getBoundingClientRect();
    const part = header.querySelector(".pdm-relation-axis-part")?.getBoundingClientRect();
    const bounds = header.getBoundingClientRect();
    return {
      valid: Boolean(drawing && part && drawing.top < part.top && drawing.left > part.left),
      contained: Boolean(drawing && part && drawing.right <= bounds.right && part.left >= bounds.left),
      background: getComputedStyle(header).backgroundImage
    };
  });
  record(`Matrix axis labels occupy opposite corners at ${viewport.width}px`, axisLayout.valid && axisLayout.contained && axisLayout.background.includes("linear-gradient"), JSON.stringify(axisLayout));
  record(`Matrix shows manufacturing basis at ${viewport.width}px`, await page.locator(".pdm-relation-matrix td.relation-manufacturing_basis", { hasText: "製造依據" }).first().isVisible());
  record(`Matrix shows reference cell at ${viewport.width}px`, await page.locator(".pdm-relation-matrix td.relation-reference", { hasText: "參考" }).first().isVisible());
  record(`Matrix shows pending candidate cells at ${viewport.width}px`, await page.locator(".pdm-relation-matrix td.relation-pending", { hasText: "待判定" }).first().isVisible());
  record(`Matrix shows not-applicable cells at ${viewport.width}px`, await page.locator(".pdm-relation-matrix td.relation-not_applicable", { hasText: "不適用" }).first().isVisible());
  record(`Matrix no longer labels every empty cell as missing at ${viewport.width}px`, (await page.locator(".pdm-relation-matrix", { hasText: "缺關聯" }).count()) === 0);
  if (viewport.width === 1440) {
    await page.screenshot({ path: path.join(outputDir, "matrix-desktop.png"), fullPage: true });
  }
  const matrixOverflowOwner = await page.locator(".pdm-relation-matrix-wrap").evaluate((element) => getComputedStyle(element).overflowX);
  record(`Matrix horizontal scroll is container-owned at ${viewport.width}px`, matrixOverflowOwner === "auto" || matrixOverflowOwner === "scroll", matrixOverflowOwner);
  const matrixSizing = await page.locator(".pdm-relation-matrix").first().evaluate((table) => {
    const wrap = table.parentElement;
    const body = wrap?.parentElement;
    const drawingHeaders = Array.from(table.querySelectorAll("thead th:not(.sticky-col)"));
    return {
      tableWidth: table.getBoundingClientRect().width,
      wrapWidth: wrap?.getBoundingClientRect().width ?? 0,
      bodyWidth: body?.getBoundingClientRect().width ?? 0,
      drawingWidths: drawingHeaders.map((header) => header.getBoundingClientRect().width),
      contentFits: Array.from(table.querySelectorAll("th, td")).every((cell) => cell.scrollWidth <= cell.clientWidth + 1)
    };
  });
  const compactAtDesktop = viewport.width !== 1440 || matrixSizing.tableWidth < matrixSizing.bodyWidth;
  const fixedDrawingWidths = matrixSizing.drawingWidths.every((width) => width >= 159 && width <= 220);
  record(`Matrix uses compact content columns at ${viewport.width}px`, compactAtDesktop && fixedDrawingWidths && matrixSizing.contentFits, JSON.stringify(matrixSizing));

  if (viewport.width === 1440) {
    await page.getByRole("tab", { name: "關係樹" }).click();
    await page.getByRole("button", { name: rootCode, exact: true }).click();
    await page.getByRole("heading", { name: rootCode, exact: true }).waitFor({ timeout: 10_000 });
    record("Root click opens root detail drawer", (await page.locator("[role='complementary'][data-detail-target='part_root'][data-detail-code='" + rootCode + "']").count()) === 1);

    await page.locator(".pdm-relation-node", { hasText: drawingM01 }).getByRole("button", { name: drawingM01 }).click();
    await page.getByRole("heading", { name: drawingM01, exact: true }).waitFor({ timeout: 10_000 });
    record("Drawing click opens drawing detail drawer", (await page.locator("[role='complementary'][data-detail-target='drawing_number'][data-detail-code='" + drawingM01 + "']").count()) === 1);

    await closeRelationDetailDrawer(page);
    await page.locator(".pdm-relation-node", { hasText: drawingM01 }).locator(".pdm-relation-part-chip", { hasText: partP03 }).click();
    await page.getByRole("heading", { name: partP03, exact: true }).waitFor({ timeout: 10_000 });
    record("Part click opens part detail drawer", (await page.locator("[role='complementary'][data-detail-target='part_number'][data-detail-code='" + partP03 + "']").count()) === 1);

    await closeRelationDetailDrawer(page);
    await page.getByRole("button", { name: rootCode, exact: true }).click();
    await page.getByRole("heading", { name: rootCode, exact: true }).waitFor({ timeout: 10_000 });
    await page.getByText("關係維護").waitFor({ timeout: 10_000 });
    const maintenance = page.locator(".pdm-relation-maintenance-grid");
    await maintenance.locator("select").nth(0).selectOption(drawingM02);
    await maintenance.locator("select").nth(1).selectOption(partP04);
    await page.getByRole("button", { name: "製造依據", exact: true }).click();
    await page.getByText("已完成關係維護並寫入 audit").waitFor({ timeout: 10_000 });
    const db = new Database(dbPath);
    try {
      const relation = db
        .prepare(
          `
          SELECT l.link_type
          FROM drawing_part_links l
          JOIN drawing_numbers d ON d.id = l.drawing_number_id
          JOIN part_numbers p ON p.id = l.part_number_id
          WHERE d.drawing_number = ? AND p.part_number = ?
        `
        )
        .get(drawingM02, partP04);
      record("Maintenance action creates primary manufacturing link", relation?.link_type === "primary_manufacturing", JSON.stringify(relation));
      const audit = db.prepare("SELECT id FROM audit_logs WHERE action = 'numbering.drawing_part.relation_maintain' AND detail_json LIKE ?").get(`%${partP04}%`);
      record("Maintenance action writes audit", Boolean(audit), JSON.stringify(audit));
    } finally {
      db.close();
    }
  }

  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

fs.mkdirSync(outputDir, { recursive: true });
staticChecks();
seedRelationData();
const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1024, height: 768 }, "tree-laptop.png");
  await verifyViewport(browser, { width: 390, height: 844 }, "tree-mobile.png");
  await verifyViewport(browser, { width: 1440, height: 900 }, "tree-desktop.png");
} finally {
  await browser.close();
  cleanupRelationData();
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      baseUrl: apiBaseUrl,
      dbPath,
      screenshots: outputDir,
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
